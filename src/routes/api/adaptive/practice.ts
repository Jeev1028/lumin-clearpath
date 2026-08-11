import { createFileRoute } from "@tanstack/react-router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

import { requireUser } from "@/lib/api-auth";

const PRACTICE_SYSTEM_PROMPT = `You are Lumin AI's Adaptive Learner tool, part of ClearPath. Generate a short set of ORIGINAL practice questions (never copied from a real textbook, worksheet, or assignment) for a student to self-test with, calibrated to the requested difficulty. This is extra self-practice the student chose to do -- unlike ClearPath's main research/homework assistant, it is appropriate here to give full worked answers and explanations, since you invented these questions yourself for practice purposes, not helping complete the student's real assigned work.

Calibrate difficulty:
- beginner: foundational, single-concept questions.
- intermediate: applies 1-2 concepts together, some multi-step reasoning.
- advanced: multi-step, requires connecting several concepts or deeper reasoning.`;

const practiceSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
        explanation: z.string(),
      }),
    )
    .length(5),
});

export const Route = createFileRoute("/api/adaptive/practice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const geminiApiKey = process.env["GEMINI_API_KEY"];
        if (!geminiApiKey) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => ({}))) as {
          subject?: string;
          difficulty?: "beginner" | "intermediate" | "advanced";
        };
        const subject = body.subject?.trim();
        const difficulty = body.difficulty;
        if (!subject || !difficulty) {
          return new Response("A subject and difficulty are required", { status: 400 });
        }

        const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
        try {
          const { object } = await generateObject({
            model: google("gemini-3.6-flash"),
            schema: practiceSchema,
            system: PRACTICE_SYSTEM_PROMPT,
            prompt: `Generate exactly 5 ${difficulty}-difficulty practice questions for the subject: "${subject}".`,
          });
          return Response.json(object);
        } catch (err) {
          console.error("[adaptive/practice] generation failed", err);
          return new Response("Could not generate practice questions right now.", { status: 502 });
        }
      },
    },
  },
});
