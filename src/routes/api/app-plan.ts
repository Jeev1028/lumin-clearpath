import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient } from "@/lib/api-auth";
import { verifySignedState } from "@/lib/oauth-state";
import { generateStudyPlan } from "@/lib/study-plan-generate";

// The Lumin Cal iPhone app has no Supabase session, only the same long-lived
// signed token that powers the calendar feed (sent as a Bearer header, never in
// the URL). That token already grants read access to the student's calendar, and
// this route lets it read, regenerate and tick off the study plan as well.
const FEED_TOKEN_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function userFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const payload = verifySignedState(token, FEED_TOKEN_MAX_AGE_MS);
  const userId = payload?.["userId"];
  return typeof userId === "string" && userId ? userId : null;
}

export const Route = createFileRoute("/api/app-plan")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = userFrom(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const { data, error } = await getAdminClient()
          .from("study_plans")
          .select("horizon, preferences, plan_markdown, generated_at, completed_blocks")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) return new Response("Could not load study plan", { status: 500 });
        return Response.json({ plan: data }, { headers: { "Cache-Control": "no-store" } });
      },
      POST: async ({ request }) => {
        const userId = userFrom(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        return generateStudyPlan(getAdminClient(), userId, request);
      },
      PUT: async ({ request }) => {
        const userId = userFrom(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const body = (await request.json().catch(() => null)) as {
          completed_blocks?: unknown;
        } | null;
        const blocks = body?.completed_blocks;
        if (
          !Array.isArray(blocks) ||
          blocks.length > 2000 ||
          blocks.some((b) => typeof b !== "string")
        ) {
          return new Response("Invalid request", { status: 400 });
        }
        const { error } = await getAdminClient()
          .from("study_plans")
          .update({ completed_blocks: (blocks as string[]).map((b) => b.slice(0, 600)) })
          .eq("user_id", userId);
        if (error) return new Response("Could not save", { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
