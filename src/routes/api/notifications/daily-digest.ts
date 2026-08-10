import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient } from "@/lib/api-auth";
import { escapeHtml, sendEmail } from "@/lib/email";

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type DigestTask = {
  id: string;
  user_id: string;
  title: string;
  course: string | null;
  due_date: string | null;
  status: string;
};

async function runDigest() {
  const admin = getAdminClient();
  const today = todayStr();

  // Anything not yet submitted, with a due date on or before today, needs a
  // reminder — this mirrors the exact "overdue"/"due today" logic already
  // used on the Tasks page.
  const { data: tasks, error } = await admin
    .from("tasks")
    .select("id, user_id, title, course, due_date, status")
    .neq("status", "submitted")
    .not("due_date", "is", null)
    .lte("due_date", today)
    .returns<DigestTask[]>();
  if (error) throw error;

  const byUser = new Map<string, DigestTask[]>();
  for (const task of tasks ?? []) {
    const list = byUser.get(task.user_id) ?? [];
    list.push(task);
    byUser.set(task.user_id, list);
  }

  let sent = 0;
  let skipped = 0;

  for (const [userId, userTasks] of byUser) {
    const { data: existingLog } = await admin
      .from("daily_digest_log")
      .select("user_id")
      .eq("user_id", userId)
      .eq("sent_for_date", today)
      .maybeSingle();
    if (existingLog) {
      skipped++;
      continue;
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user?.email) {
      skipped++;
      continue;
    }
    const meta = (userData.user.user_metadata ?? {}) as Record<string, unknown>;
    if (meta["email_digest_enabled"] === false) {
      skipped++;
      continue;
    }

    const overdue = userTasks.filter((t) => (t.due_date as string) < today);
    const dueToday = userTasks.filter((t) => t.due_date === today);

    const row = (t: DigestTask, label: string, color: string) =>
      `<li style="margin-bottom:6px;">
        <strong>${escapeHtml(t.title)}</strong>${t.course ? ` — ${escapeHtml(t.course)}` : ""}
        <span style="color:${color};"> (${label})</span>
      </li>`;

    const listHtml = [
      ...overdue.map((t) => row(t, `overdue, was due ${t.due_date}`, "#f87171")),
      ...dueToday.map((t) => row(t, "due today", "#38bdf8")),
    ].join("");

    const count = overdue.length + dueToday.length;
    const summary = [
      overdue.length ? `${overdue.length} overdue` : "",
      dueToday.length ? `${dueToday.length} due today` : "",
    ]
      .filter(Boolean)
      .join(" and ");

    const html = `
      <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
        <h2 style="margin-bottom: 4px;">Your ClearPath tasks</h2>
        <p style="color: #475569;">You have ${summary}.</p>
        <ul style="padding-left: 18px;">${listHtml}</ul>
        <p><a href="https://luminclearpath.ca/tasks" style="color:#2563eb;">Open Tasks →</a></p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
          You're getting this because email reminders are on for your ClearPath account.
          Turn them off anytime in Account settings.
        </p>
      </div>`;

    try {
      await sendEmail({
        to: userData.user.email,
        subject: `${count} task${count === 1 ? "" : "s"} need your attention`,
        html,
      });
      await admin.from("daily_digest_log").insert({ user_id: userId, sent_for_date: today });
      sent++;
    } catch (err) {
      console.error("[daily-digest] send failed for", userId, err);
      skipped++;
    }
  }

  return { sent, skipped, usersWithTasks: byUser.size };
}

export const Route = createFileRoute("/api/notifications/daily-digest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env["CRON_SECRET"];
        const auth = request.headers.get("authorization");
        if (!secret || auth !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const result = await runDigest();
          return Response.json(result);
        } catch (err) {
          console.error("[daily-digest] failed", err);
          return new Response("Digest failed", { status: 500 });
        }
      },
    },
  },
});
