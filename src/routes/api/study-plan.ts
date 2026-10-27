import { createFileRoute } from "@tanstack/react-router";

import { requireUser } from "@/lib/api-auth";
import { generateStudyPlan } from "@/lib/study-plan-generate";

export const Route = createFileRoute("/api/study-plan")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { data, error } = await auth.supabase
          .from("study_plans")
          .select("horizon, preferences, plan_markdown, generated_at, completed_blocks")
          .maybeSingle();
        if (error) return new Response("Could not load study plan", { status: 500 });
        return Response.json({ plan: data });
      },
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        return generateStudyPlan(auth.supabase, auth.userId, request);
      },
    },
  },
});
