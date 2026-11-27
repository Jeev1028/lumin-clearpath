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

        const body = (await request.json()) as ChatBody;
        const messages = body.messages;
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("messages are required", { status: 400 });
        }
        if (messages.length > MAX_MESSAGES) {
          return new Response("Conversation is too long for this guide", { status: 400 });
        }
        for (const message of messages) {
          if (textOf(message).length > MAX_MESSAGE_CHARS) {
            return new Response("Message is too long", { status: 400 });
          }
        }

        let programData: string;
        try {
          programData = await loadProgramData();
        } catch {
          return new Response("Program data is unavailable right now", { status: 503 });
        }

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
