import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

import { ATTACHMENT_BUCKET, STORAGE_URL_PREFIX } from "@/lib/file-attachments";
import { buildModelChain, type ChatModelCandidate } from "@/lib/chat-models";
import { LUMIN_SYSTEM_PROMPT } from "@/lib/lumin-prompt";
import type { Database } from "@/integrations/supabase/types";

type ChatBody = { messages?: UIMessage[]; threadId?: string; lastTier?: "primary" | "fallback" };

// How long a model gets to produce its first output before we move on. The
// last model gets longer since there's nowhere left to fall back to.
const FIRST_TOKEN_MS = 12_000;
const FALLBACK_FIRST_TOKEN_MS = 8_000;
const LAST_RESORT_FIRST_TOKEN_MS = 45_000;

// Shown when Lumin has to answer with anything below the top model. It never
// says which model: each step down the chain is only slightly worse.
const DEMOTED_NOTICE =
  "Lumin is in high demand right now, so replies may be slightly lower quality than usual. We apologize for the inconvenience. Lumin keeps trying to bring you back to full quality.";
const RESTORED_NOTICE = "Good news: Lumin is back to full quality.";

// Appended to Lumin's prompt for every model so answers read the same no
// matter which provider ends up replying.
const CONSISTENCY_RULES = `

CONSISTENT VOICE (applies no matter what)
- You are Lumin AI. Never say or hint which AI model, company or provider is behind you (not Gemini, Google, OpenAI, Llama, Mistral, Groq or any other). If asked, say you're Lumin AI, ClearPath's study companion.
- Write in clean Markdown: short paragraphs, "- " bullets only where they help, **bold** sparingly, no emojis unless the student uses them, no headings for short replies.
- Never mention your reasoning process, tools, rate limits, or that you might be a different model than before.
- Keep the same calm, warm tutor tone and the same brevity every time.`;

/** True when a reply opened a PDF block that it never closed. */
function hasOpenPdf(text: string): boolean {
  let open = false;
  for (const line of text.split("\n")) {
    if (/^:::pdf/i.test(line.trim())) open = true;
    else if (/^:::[ \t]*$/.test(line)) open = false;
  }
  return open;
}

function isContentChunk(chunk: UIMessageChunk): boolean {
  return chunk.type === "text-delta" || chunk.type === "reasoning-delta" || chunk.type === "file";
}

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

// The website calls this same-origin, so it never needed CORS headers
// before. The Chrome extension calls it from a "chrome-extension://<id>"
// origin instead, which browsers treat as cross-origin -- without these
// headers the request would be blocked before the extension ever saw the
// response. Scoped to extension origins specifically (rather than a blanket
// "*") even though this endpoint is already Bearer-token gated regardless.
function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  if (!origin.startsWith("chrome-extension://")) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      },
      POST: async ({ request }) => {
        const cors = corsHeaders(request);
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401, headers: cors });

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const geminiApiKey = process.env["GEMINI_API_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          return new Response("Backend not configured", { status: 500, headers: cors });
        }
        if (!geminiApiKey) {
          return new Response("AI is not configured", { status: 500, headers: cors });
        }

        const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
        const userId = claimsData?.claims?.sub;
        if (claimsError || !userId)
          return new Response("Unauthorized", { status: 401, headers: cors });

        const body = (await request.json()) as ChatBody;
        const messages = body.messages;
        const threadId = body.threadId;
        if (!Array.isArray(messages) || !threadId) {
          return new Response("messages and threadId are required", { status: 400, headers: cors });
        }

        const { data: thread, error: threadError } = await supabase
          .from("threads")
          .select("id, title")
          .eq("id", threadId)
          .maybeSingle();
        if (threadError) {
          console.error("[chat] thread lookup failed", threadError);
          return new Response("Could not load conversation", { status: 500, headers: cors });
        }
        if (!thread) return new Response("Conversation not found", { status: 404, headers: cors });

        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === "user") {
          const content = textOf(lastMessage);
          const { error: insertError } = await supabase.from("messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            content,
            client_message_id: lastMessage.id,
          });
          if (insertError) console.error("[chat] failed to save user message", insertError);

          const isFirst = messages.filter((m) => m.role === "user").length === 1;
          const { error: threadUpdateError } = await supabase
            .from("threads")
            .update({
              updated_at: new Date().toISOString(),
              ...(isFirst && content
                ? { title: content.slice(0, 60) + (content.length > 60 ? "…" : "") }
                : {}),
            })
            .eq("id", threadId);
          if (threadUpdateError) console.error("[chat] failed to update thread", threadUpdateError);
        }

        const hasAttachments = messages.some((m) => m.parts.some((part) => part.type === "file"));
        // Best -> lightest; see src/lib/chat-models.ts.
        // Documents (PDFs, long tests/guides) need long replies, which the
        // tightest free tiers can't deliver without cutting off mid-way.
        const lastUserText = lastMessage?.role === "user" ? textOf(lastMessage) : "";
        const longOutput =
          /pdf|document|worksheet|handout|practice (test|exam|paper)|study guide|combine|merge|full (test|paper)|all of (it|them)/i.test(
            lastUserText,
          ) || messages.some((m) => m.role === "assistant" && textOf(m).includes(":::pdf"));
        const chain = buildModelChain(process.env, hasAttachments, longOutput);

        // Files uploaded to storage arrive as small references; download them
        // with the student's own token (storage rules limit them to their own
        // folder) and inline them for the model. Data-URL files (the browser
        // extension) pass through untouched.
        const history: UIMessage[] = await Promise.all(
          messages.map(async (m) => ({
            ...m,
            parts: await Promise.all(
              m.parts.map(async (part) => {
                if (part.type !== "file" || !part.url.startsWith(STORAGE_URL_PREFIX)) return part;
                const path = part.url.slice(STORAGE_URL_PREFIX.length);
                if (!path.startsWith(`${userId}/`)) {
                  return {
                    type: "text" as const,
                    text: `[Attachment unavailable: ${part.filename ?? "file"}]`,
                  };
                }
                const { data, error } = await supabase.storage
                  .from(ATTACHMENT_BUCKET)
                  .download(path);
                if (error || !data) {
                  console.error("[chat] attachment download failed", error);
                  return {
                    type: "text" as const,
                    text: `[Attachment unavailable: ${part.filename ?? "file"}]`,
                  };
                }
                const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
                return { ...part, url: `data:${part.mediaType};base64,${base64}` };
              }),
            ),
          })),
        );
        const modelMessages = await convertToModelMessages(history);
        const lastTier = body.lastTier === "fallback" ? "fallback" : "primary";

        // Starts a model and waits for its first real output. Resolves with a
        // stream to forward, or rejects if the model errors / stalls first.
        async function start(
          candidate: ChatModelCandidate,
          firstTokenMs: number,
        ): Promise<ReadableStream<UIMessageChunk>> {
          const controller = new AbortController();
          const total = setTimeout(() => controller.abort(), firstTokenMs);
          let streamError: unknown;
          const result = streamText({
            model: candidate.model,
            system: LUMIN_SYSTEM_PROMPT + CONSISTENCY_RULES,
            messages: modelMessages,
            // 800 was cutting off longer replies mid-sentence, especially
            // when discussing a whole attached document/PDF (which
            // naturally warrants a more thorough response).
            // Reasoning-style models spend part of this on hidden thinking,
            // so they get more room to avoid cut-off replies.
            maxOutputTokens: candidate.maxOutputTokens,
            maxRetries: 0,
            abortSignal: controller.signal,
            onFinish: ({ finishReason, usage }) => {
              if (finishReason === "length") {
                console.warn(`[chat] ${candidate.label} hit the output cap`, usage);
              }
            },
            onError: ({ error }) => {
              streamError = error;
              console.error(`[chat] ${candidate.label} error`, error);
            },
            ...(candidate.isGemini
              ? {
                  providerOptions: {
                    google: { thinkingConfig: { thinkingLevel: "low" as const } },
                  },
                }
              : {}),
          });
          const reader = result
            .toUIMessageStream({ originalMessages: history, sendReasoning: true })
            .getReader();
          const buffered: UIMessageChunk[] = [];
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) throw streamError ?? new Error("empty response");
              if (value.type === "error" || value.type === "abort") {
                throw streamError ?? new Error("model error");
              }
              buffered.push(value);
              if (isContentChunk(value)) break;
            }
          } catch (error) {
            clearTimeout(total);
            controller.abort();
            throw error;
          }
          // Got output: stop the first-token timer (the rest streams freely
          // under the route's own max duration).
          clearTimeout(total);
          return new ReadableStream<UIMessageChunk>({
            start(c) {
              for (const chunk of buffered) c.enqueue(chunk);
            },
            async pull(c) {
              const { done, value } = await reader.read();
              if (done) c.close();
              else c.enqueue(value);
            },
            cancel: () => reader.cancel(),
          });
        }

        const stream = createUIMessageStream({
          originalMessages: history,
          execute: async ({ writer }) => {
            const status = (tier: "primary" | "fallback", notice: string) =>
              writer.write({
                type: "data-lumin-status",
                data: { tier, notice },
                transient: true,
              } as UIMessageChunk);

            let forward: ReadableStream<UIMessageChunk> | undefined;
            let used = chain[0]!;
            let lastError: unknown;
            for (let i = 0; i < chain.length; i++) {
              const isLast = i === chain.length - 1;
              try {
                forward = await start(
                  chain[i]!,
                  isLast
                    ? LAST_RESORT_FIRST_TOKEN_MS
                    : i === 0
                      ? FIRST_TOKEN_MS
                      : FALLBACK_FIRST_TOKEN_MS,
                );
              } catch (error) {
                lastError = error;
                continue;
              }
              used = chain[i]!;
              // The top of the chain is full quality. Anything below it is
              // "slightly worse" -- tell the student once (the client keeps
              // a banner up), and tell them when they're back at the top.
              if (i > 0 && lastTier !== "fallback") status("fallback", DEMOTED_NOTICE);
              else if (i === 0 && lastTier === "fallback") status("primary", RESTORED_NOTICE);
              break;
            }
            if (!forward) throw lastError ?? new Error("all models failed");
            // Forward the reply ourselves so that, if a model quits partway
            // through a PDF (weaker fallbacks often do, calmly, with no
            // error), we can make it carry on instead of handing the student
            // a half-finished document.
            const reader = forward.getReader();
            const held: UIMessageChunk[] = [];
            let written = "";
            let textId = "";
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value.type === "text-delta") {
                written += value.delta;
                textId = value.id;
              }
              if (
                value.type === "text-end" ||
                value.type === "finish-step" ||
                value.type === "finish"
              ) {
                held.push(value);
                continue;
              }
              writer.write(value);
            }
            for (let attempt = 0; attempt < 3 && textId && hasOpenPdf(written); attempt++) {
              try {
                const more = streamText({
                  model: used.model,
                  system: LUMIN_SYSTEM_PROMPT + CONSISTENCY_RULES,
                  messages: [
                    ...modelMessages,
                    { role: "assistant", content: written.trimEnd() },
                    {
                      role: "user",
                      content:
                        "You stopped before the document was finished. Continue the document exactly where you stopped. Output ONLY the remaining content: do not repeat anything already written, do not add an introduction, and do NOT write the :::pdf opening line again (the document is already open). Finish every remaining section and question in full detail, then close the document with a line containing only ::: and add a one-line note.",
                    },
                  ],
                  maxOutputTokens: used.maxOutputTokens,
                  maxRetries: 0,
                  abortSignal: AbortSignal.timeout(90_000),
                });
                let added = "";
                let pending = "";
                const emit = (piece: string) => {
                  added += piece;
                  writer.write({ type: "text-delta", id: textId, delta: piece } as UIMessageChunk);
                };
                for await (const delta of more.textStream) {
                  pending += delta;
                  const cut = pending.lastIndexOf("\n");
                  if (cut === -1) continue;
                  const complete = pending.slice(0, cut + 1);
                  pending = pending.slice(cut + 1);
                  // The model must not restart the document: drop any new header.
                  const kept = complete
                    .split("\n")
                    .filter((line) => !/^:::pdf/i.test(line.trim()))
                    .join("\n");
                  if (kept) emit(kept);
                }
                if (pending && !/^:::pdf/i.test(pending.trim())) emit(pending);
                written += added;
                if (added.trim().length < 40) break;
              } catch (error) {
                console.error("[chat] continuation failed", error);
                break;
              }
            }
            for (const chunk of held) writer.write(chunk);
          },
          onError: (error) => {
            console.error("[chat] all models failed", error);
            return "Lumin could not respond right now. Please try again in a moment.";
          },
          onFinish: async ({ responseMessage }) => {
            const content = textOf(responseMessage);
            if (!content) return;
            const { error } = await supabase.from("messages").insert({
              thread_id: threadId,
              user_id: userId,
              role: "assistant",
              content,
              client_message_id: responseMessage.id,
            });
            if (error) console.error("[chat] failed to save assistant message", error);
          },
        });

        return createUIMessageStreamResponse({ stream, headers: cors });
      },
    },
  },
});
