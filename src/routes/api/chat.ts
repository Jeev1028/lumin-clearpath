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

import { buildModelChain, type ChatModelCandidate } from "@/lib/chat-models";
import { LUMIN_SYSTEM_PROMPT } from "@/lib/lumin-prompt";
import type { Database } from "@/integrations/supabase/types";

type ChatBody = { messages?: UIMessage[]; threadId?: string; lastTier?: "primary" | "fallback" };

// How long a model gets to produce its first output before we move on. The
// last model gets longer since there's nowhere left to fall back to.
const FIRST_TOKEN_MS = 12_000;
const FALLBACK_FIRST_TOKEN_MS = 8_000;
const LAST_RESORT_FIRST_TOKEN_MS = 45_000;

const DEMOTED_NOTICE =
  "Lumin is in high demand right now. We apologize for the inconvenience, but we're temporarily moving you to a slightly lighter model. Lumin will keep trying to bring you back to the full model.";
const RESTORED_NOTICE = "Good news: Lumin is back on the full model.";

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
        const chain = buildModelChain(process.env, hasAttachments);

        const history: UIMessage[] = messages;
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
            system: LUMIN_SYSTEM_PROMPT,
            messages: modelMessages,
            // 800 was cutting off longer replies mid-sentence, especially
            // when discussing a whole attached document/PDF (which
            // naturally warrants a more thorough response).
            maxOutputTokens: 2048,
            maxRetries: 0,
            abortSignal: controller.signal,
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
                // Tell the student once, as soon as the best model fails.
                if (i === 0) status("fallback", DEMOTED_NOTICE);
                continue;
              }
              if (i === 0 && lastTier === "fallback") status("primary", RESTORED_NOTICE);
              break;
            }
            if (!forward) throw lastError ?? new Error("all models failed");
            writer.merge(forward);
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
