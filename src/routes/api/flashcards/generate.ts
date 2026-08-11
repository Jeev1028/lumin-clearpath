import { createFileRoute } from "@tanstack/react-router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

import { requireUser } from "@/lib/api-auth";

const FLASHCARDS_SYSTEM_PROMPT = `You are Lumin AI's flashcard generator, part of ClearPath. Generate ORIGINAL flashcard pairs (term/question on the front, a concise answer on the back) for a student to self-study with. Keep each side short -- a real flashcard, not a paragraph. This is a self-study tool the student chose to use, not their real assignment, so concise correct answers are appropriate here.`;

const flashcardsSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string(),
        back: z.string(),
      }),
    )
    .length(10),
});

export const Route = createFileRoute("/api/flashcards/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const geminiApiKey = process.env["GEMINI_API_KEY"];
        if (!geminiApiKey) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => ({}))) as { topic?: string };
        const topic = body.topic?.trim();
        if (!topic) return new Response("A topic is required", { status: 400 });

        const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
        try {
          const { object } = await generateObject({
            model: google("gemini-3.6-flash"),
            schema: flashcardsSchema,
            system: FLASHCARDS_SYSTEM_PROMPT,
            prompt: `Generate exactly 10 flashcards for the subject: "${topic}".`,
          });
          return Response.json(object);
        } catch (err) {
          console.error("[flashcards/generate] generation failed", err);
          return new Response("Could not generate flashcards right now.", { status: 502 });
        }
      },
    },
  },
});
