import { createFileRoute } from "@tanstack/react-router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import {
  buildUniPrompt,
  describePrograms,
  type UniProgramRow,
} from "@/lib/uni-assistant-prompt";

type ChatBody = { messages?: UIMessage[] };

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 600;
const CACHE_MS = 5 * 60 * 1000;

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 20;
const GLOBAL_MAX = 300;
const rateHits = new Map<string, number[]>();
let globalHits: number[] = [];

let cached: { at: number; text: string } | null = null;

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

// Public read-only data (RLS allows select for everyone), so the publishable
// key is enough. Cached briefly so a chat burst does not hammer Supabase.
async function loadProgramData(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.text;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured");
  const res = await fetch(
    `${url}/rest/v1/programs?select=*,universities(name,province),fact_sources(source_url,verified,date_accessed)&order=id`,
    { headers: { apikey: key } },
  );
  if (!res.ok) throw new Error(`Programs request failed (${res.status})`);
  const text = describePrograms((await res.json()) as UniProgramRow[]);
  cached = { at: Date.now(), text };
  return text;
}

export const Route = createFileRoute("/api/uni-chat")({
  server: {
    handlers: {
      // Intentionally unauthenticated, like /api/site-chat: it is the public
      // guide on /uni. Stateless and size-capped because anyone can reach it.
      POST: async ({ request }) => {
        const geminiApiKey = process.env["GEMINI_API_KEY"];
        if (!geminiApiKey) {
          return new Response("AI is not configured", { status: 500 });
        }

        const body = (await request.json().catch(() => ({}))) as ChatBody;
        const incoming = body.messages;
        if (!Array.isArray(incoming) || incoming.length === 0) {
          return new Response("messages are required", { status: 400 });
        }
        if (incoming.length > MAX_MESSAGES) {
          return new Response("Conversation is too long for this guide", { status: 400 });
        }
        // Rebuild every message from scratch: only user/assistant roles and plain
        // text, so clients can't inject system turns, files or URLs to fetch.
        const messages: UIMessage[] = [];
        for (const m of incoming) {
          if (m?.role !== "user" && m?.role !== "assistant") {
            return new Response("Invalid message role", { status: 400 });
          }
          const text = Array.isArray(m.parts) ? textOf(m) : "";
          if (text.length > MAX_MESSAGE_CHARS) {
            return new Response("Message is too long", { status: 400 });
          }
          if (text) {
            messages.push({
              id: String(messages.length),
              role: m.role,
              parts: [{ type: "text", text }],
            });
          }
        }
        if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
          return new Response("A user message is required", { status: 400 });
        }

        let programData: string;
        try {
          programData = await loadProgramData();
        } catch {
          return new Response("Program data is unavailable right now", { status: 503 });
        }

        // Charged only after validation, so junk requests cannot burn the budget. Keep /uni's traffic from using up the Gemini key shared with Lumin AI.
        // shortcut: per-instance memory, so serverless instances each keep their own count; use a shared store if abused.
        // cf-connecting-ip is set by Cloudflare and can't be forged by the client; the
        // last x-forwarded-for hop (added by the proxy) is the fallback, never the first.
        const xff = request.headers.get("x-forwarded-for")?.split(",");
        const ip = request.headers.get("cf-connecting-ip") || xff?.[xff.length - 1]?.trim() || "unknown";
        const now = Date.now();
        if (rateHits.size > 5000) {
          for (const [k, v] of rateHits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) rateHits.delete(k);
        }
        globalHits = globalHits.filter((t) => now - t < RATE_WINDOW_MS);
        const hits = (rateHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
        if (hits.length >= RATE_MAX || globalHits.length >= GLOBAL_MAX) {
          return new Response("Too many questions, try again in a few minutes", { status: 429 });
        }
        hits.push(now);
        globalHits.push(now);
        rateHits.set(ip, hits);

        const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });

        const result = streamText({
          model: google("gemini-3.6-flash"),
          system: buildUniPrompt(programData),
          messages: await convertToModelMessages(messages),
          maxOutputTokens: 600,
          providerOptions: {
            google: {
              thinkingConfig: { thinkingLevel: "minimal" },
            },
          },
        });

        return result.toUIMessageStreamResponse();
      },
    },
  },
});
