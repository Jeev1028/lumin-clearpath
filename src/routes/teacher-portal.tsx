import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LuminWordmark } from "@/components/lumin/LuminMark";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/teacher-portal")({
  head: () => ({
    meta: [{ title: "Class comments — ClearPath" }],
  }),
  component: TeacherPortalPage,
});

type PortalData = {
  courseName: string;
  students: { userId: string; name: string; email: string }[];
  coursework: { id: string; title: string; due_at: string | null; max_points: number | null }[];
  roster: {
    courseworkId: string;
    userId: string;
    submissionState: string | null;
    assignedGrade: number | null;
  }[];
};

const SUBMITTED_STATES = new Set(["TURNED_IN", "RETURNED"]);

function TeacherPortalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<PortalData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [studentId, setStudentId] = useState("");
  const [courseworkId, setCourseworkId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  useEffect(() => {
    if (token === null) return;
    if (!token) {
      setLoadError("This link is missing a token.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/teacher-portal?token=${encodeURIComponent(token)}`);
        const body = await res.text();
        if (!res.ok) throw new Error(body || "This link is invalid or has expired.");
        setData(JSON.parse(body) as PortalData);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "This link is invalid or has expired.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !studentId || !message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/teacher-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          studentUserId: studentId,
          courseworkId: courseworkId || undefined,
          message: message.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not send that comment.");
      toast.success("Comment sent.");
      setMessage("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send that comment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-deep">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="glow-orb absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 opacity-50" />
      </div>

      <header className="mx-auto w-full max-w-3xl px-6 py-6">
        <LuminWordmark />
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 pb-20">
        {loading ? (
          <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <div className="mt-10 rounded-2xl border border-border/70 bg-card/80 p-6 text-sm text-muted-foreground">
            {loadError}
          </div>
        ) : data ? (
          <div className="mt-10 rounded-3xl border border-border/70 bg-card/80 p-8 shadow-panel backdrop-blur-sm">
            <h1 className="text-2xl font-semibold">{data.courseName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Send a private comment to any of your students who use ClearPath. No account
              needed — this doesn't post inside Google Classroom, but the student will see it
              on ClearPath and get an email notification.
            </p>

            {data.students.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                None of your students in this class use ClearPath yet.
              </p>
            ) : (
              <>
                {data.coursework.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Class overview
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Only shows students using ClearPath — not your full Classroom roster.
                    </p>
                    <div className="mt-3 overflow-x-auto rounded-xl border border-border/60">
                      <table className="w-full min-w-[480px] border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-border/60 bg-background/40">
                            <th className="sticky left-0 bg-background/95 p-2 text-left font-medium">
                              Assignment
                            </th>
                            {data.students.map((s) => (
                              <th key={s.userId} className="p-2 text-left font-medium">
                                {s.name.split(" ")[0]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.coursework.map((cw) => (
                            <tr key={cw.id} className="border-b border-border/40 last:border-0">
                              <td className="sticky left-0 bg-card/95 p-2 font-medium">{cw.title}</td>
                              {data.students.map((s) => {
                                const entry = data.roster.find(
                                  (r) => r.courseworkId === cw.id && r.userId === s.userId,
                                );
                                const submitted = entry?.submissionState
                                  ? SUBMITTED_STATES.has(entry.submissionState)
                                  : false;
                                const graded = entry?.submissionState === "RETURNED";
                                return (
                                  <td key={s.userId} className="p-2">
                                    {!entry ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : graded ? (
                                      <span className="text-emerald-400">
                                        Graded
                                        {typeof entry.assignedGrade === "number"
                                          ? ` (${entry.assignedGrade}${typeof cw.max_points === "number" ? `/${cw.max_points}` : ""})`
                                          : ""}
                                      </span>
                                    ) : submitted ? (
                                      <span className="text-accent">Turned in</span>
                                    ) : (
                                      <span className="text-muted-foreground">Not yet</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSend} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Student</Label>
                  <Select value={studentId} onValueChange={setStudentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.students.map((s) => (
                        <SelectItem key={s.userId} value={s.userId}>
                          {s.name} ({s.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {data.coursework.length > 0 && (
                  <div className="space-y-2">
                    <Label>About (optional)</Label>
                    <Select value={courseworkId} onValueChange={setCourseworkId}>
                      <SelectTrigger>
                        <SelectValue placeholder="General comment" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.coursework.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="portal-message">Comment</Label>
                  <Textarea
                    id="portal-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Write your comment…"
                    className="min-h-28"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={sending || !studentId || !message.trim()}
                  className="gap-1.5 bg-gradient-lumin text-primary-foreground shadow-glow"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  {sending ? "Sending…" : "Send comment"}
                </Button>
                </form>
              </>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
