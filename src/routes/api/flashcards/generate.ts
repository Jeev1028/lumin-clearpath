import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { generateObjectWithFallback } from "@/lib/ai-fallback";
import { requireUser } from "@/lib/api-auth";

const FLASHCARDS_SYSTEM_PROMPT = `You are Lumin AI's flashcard generator, part of ClearPath. Generate ORIGINAL flashcard pairs (term/question on the front, a concise answer on the back) for a student to self-study with. Keep each side short -- a real flashcard, not a paragraph. This is a self-study tool the student chose to use, not their real assignment, so concise correct answers are appropriate here.

TRUTHFULNESS (non-negotiable): every card must be a fact you are genuinely confident is true. NEVER invent facts, biographies, dates, quotes, awards, publications or relationships. If the subject is a private individual, a classmate, a local or personal matter, an obscure person/place/organization, a fictional-sounding name you do not recognize, or anything you cannot reliably describe, set "reliable" to false and return an empty "cards" array. Do not guess, and do not write cards that merely sound plausible. If the subject is a school topic or a well-documented person or thing, set "reliable" to true and write accurate cards only.`;

function flashcardsSchema(count: number) {
  return z.object({
    reliable: z.boolean(),
    cards: z
      .array(
        z.object({
          front: z.string(),
          back: z.string(),
        }),
      )
      .max(count),
  });
}

export const Route = createFileRoute("/api/flashcards/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const geminiApiKey = process.env["GEMINI_API_KEY"];
        if (!geminiApiKey) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => ({}))) as { topic?: string; count?: number };
        const requested = Math.round(Number(body.count));
        const count = Number.isFinite(requested) ? Math.min(30, Math.max(3, requested)) : 10;
        const topic = body.topic?.trim();
        if (!topic) return new Response("A topic is required", { status: 400 });

        try {
          const object = await generateObjectWithFallback({
            schema: flashcardsSchema(count),
            system: FLASHCARDS_SYSTEM_PROMPT,
            prompt: `Generate exactly ${count} flashcards for the subject: "${topic}".`,
          });
          if (!object.reliable || object.cards.length < Math.min(3, count)) {
            return new Response(
              "Lumin doesn't have reliable information on that topic, so it won't guess. Try a school subject or a well-documented topic instead.",
              { status: 422 },
            );
          }
          return Response.json({ cards: object.cards });
        } catch (err) {
          console.error("[flashcards/generate] generation failed", err);
          return new Response("Could not generate flashcards right now.", { status: 502 });
        }
      },
    },
  },
});
