import { createFileRoute } from "@tanstack/react-router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { LUMIN_SYSTEM_PROMPT } from "@/lib/lumin-prompt";
import type { Database } from "@/integrations/supabase/types";

type ChatBody = { messages?: UIMessage[]; threadId?: string };

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

        const google = createGoogleGenerativeAI({
          apiKey: geminiApiKey,
        });

        const result = streamText({
          model: google("gemini-3.6-flash"),
          system: LUMIN_SYSTEM_PROMPT,
          messages: await convertToModelMessages(messages),
          // 800 was cutting off longer replies mid-sentence, especially
          // when discussing a whole attached document/PDF (which
          // naturally warrants a more thorough response).
          maxOutputTokens: 2048,
          providerOptions: {
            google: {
              thinkingConfig: { thinkingLevel: "low" },
            },
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          sendReasoning: true,
          headers: cors,
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
      },
    },
  },
});
