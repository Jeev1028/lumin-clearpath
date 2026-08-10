import { createFileRoute } from "@tanstack/react-router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { SITE_ASSISTANT_PROMPT } from "@/lib/site-assistant-prompt";

type ChatBody = { messages?: UIMessage[] };

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 600;

function textOf(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

export const Route = createFileRoute("/api/site-chat")({
  server: {
    handlers: {
      // Intentionally unauthenticated — this is the public "ask about the
      // site" widget on the homepage, separate from the signed-in Lumin AI
      // tutor at /api/chat. Kept stateless (no persistence) and capped in
      // size since it's reachable by anonymous visitors.
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
          return new Response("Conversation is too long for this widget", { status: 400 });
        }
        for (const message of messages) {
          if (textOf(message).length > MAX_MESSAGE_CHARS) {
            return new Response("Message is too long", { status: 400 });
          }
        }

        const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });

        const result = streamText({
          model: google("gemini-3.6-flash"),
          system: SITE_ASSISTANT_PROMPT,
          messages: await convertToModelMessages(messages),
          maxOutputTokens: 500,
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
