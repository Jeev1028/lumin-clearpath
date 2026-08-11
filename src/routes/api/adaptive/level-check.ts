import { createFileRoute } from "@tanstack/react-router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

import { requireUser } from "@/lib/api-auth";

const LEVEL_CHECK_SYSTEM_PROMPT = `You are Lumin AI's Adaptive Learner tool, part of ClearPath. Generate a short, original diagnostic quiz (NOT taken from any real textbook or existing assignment) to gauge how comfortable a student currently is with a subject, so ClearPath can calibrate practice difficulty. Questions should range from easy to moderately challenging across the set. Multiple choice, exactly 4 options each, exactly one correct.`;

const levelCheckSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        correctIndex: z.number().int().min(0).max(3),
      }),
    )
    .length(5),
});

export const Route = createFileRoute("/api/adaptive/level-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const geminiApiKey = process.env["GEMINI_API_KEY"];
        if (!geminiApiKey) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => ({}))) as { subject?: string };
        const subject = body.subject?.trim();
        if (!subject) return new Response("A subject is required", { status: 400 });

        const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });
        try {
          const { object } = await generateObject({
            model: google("gemini-3.6-flash"),
            schema: levelCheckSchema,
            system: LEVEL_CHECK_SYSTEM_PROMPT,
            prompt: `Generate a 5-question diagnostic quiz for the subject: "${subject}".`,
          });
          return Response.json(object);
        } catch (err) {
          console.error("[adaptive/level-check] generation failed", err);
          return new Response("Could not generate a level check right now.", { status: 502 });
        }
      },
    },
  },
});
