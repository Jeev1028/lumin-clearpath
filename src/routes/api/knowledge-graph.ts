import { createFileRoute } from "@tanstack/react-router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

import { requireUser } from "@/lib/api-auth";

const KNOWLEDGE_GRAPH_SYSTEM_PROMPT = `You are Lumin AI's Knowledge Graph tool, part of ClearPath. Your job is to help a student break a topic down into its map of related sub-concepts so THEY can go research each one themselves -- never to explain or teach the topic yourself.

ACADEMIC HONESTY (non-negotiable):
- "summary" must be exactly 1-2 short sentences that only orient the student to what the general subject area is -- never explain causes, mechanisms, or "how/why" something happens. If you catch yourself writing an explanation, cut it down to just naming the subject.
- "subtopics" must be SHORT TERMS ONLY (2-5 words each), naming a related concept, sub-area, or angle worth researching. Do NOT explain what each subtopic means or why it matters -- a bare label only, like a heading a student would then go look up themselves.
- "sources" should be 2-3 real, credible, well-known sources (encyclopedias, educational sites, official documentation, reputable news outlets) relevant to the topic. Prefer general reference sources over ones that would fully answer a specific question.
- Never write anything that could be copy-pasted into an assignment as-is.`;

const knowledgeGraphSchema = z.object({
  summary: z.string(),
  subtopics: z.array(z.string()).min(4).max(8),
  sources: z.array(z.object({ title: z.string(), url: z.string() })).min(1).max(3),
});

export const Route = createFileRoute("/api/knowledge-graph")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const geminiApiKey = process.env["GEMINI_API_KEY"];
        if (!geminiApiKey) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => ({}))) as {
          topic?: string;
          path?: string[];
        };
        const topic = body.topic?.trim();
        if (!topic) return new Response("A topic is required", { status: 400 });
        const path = Array.isArray(body.path) ? body.path.filter((p) => typeof p === "string") : [];

        const google = createGoogleGenerativeAI({ apiKey: geminiApiKey });

        try {
          const { object } = await generateObject({
            model: google("gemini-3.6-flash"),
            schema: knowledgeGraphSchema,
            system: KNOWLEDGE_GRAPH_SYSTEM_PROMPT,
            prompt: [
              path.length > 0 ? `The student has been exploring: ${path.join(" → ")}.` : null,
              `Break down this topic into its map of related sub-concepts: "${topic}"`,
            ]
              .filter(Boolean)
              .join("\n"),
          });
          return Response.json(object);
        } catch (err) {
          console.error("[knowledge-graph] generation failed", err);
          return new Response("Could not generate that map right now.", { status: 502 });
        }
      },
    },
  },
});
