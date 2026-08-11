import { useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  ExternalLink,
  FileEdit,
  GraduationCap,
  Link2,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  listTeacherComments,
  markTeacherCommentRead,
  type MaterialItem,
  type Rubric,
  type TeacherComment,
} from "@/lib/clearpath";
import { createThread } from "@/lib/threads";

const SUBMITTED_STATES = new Set(["TURNED_IN", "RETURNED"]);

export type TaskDetailInfo = {
  title: string;
  course: string | null;
  due_date: string | null;
  description: string | null;
  materials: MaterialItem[];
  student_work: MaterialItem[];
  rubric: Rubric | null;
  source: string;
  classroom_course_id: string | null;
  google_classroom_id: string | null;
  submission_state: string | null;
  alternate_link: string | null;
  assigned_grade: number | null;
  max_points: number | null;
};

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  onSubmissionChanged,
}: {
  task: TaskDetailInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmissionChanged?: () => void;
}) {
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const [teacherNote, setTeacherNote] = useState("");
  const [sendingNote, setSendingNote] = useState(false);
  const [askingLumin, setAskingLumin] = useState(false);
  const [comments, setComments] = useState<TeacherComment[]>([]);
  const [submissionState, setSubmissionState] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [studentWork, setStudentWork] = useState<MaterialItem[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    setSubmissionState(task?.submission_state ?? null);
    setStudentWork(task?.student_work ?? []);
    setLinkInput("");
  }, [task?.google_classroom_id, task?.submission_state, task?.student_work]);

  useEffect(() => {
    if (!open || !task?.classroom_course_id) {
      setComments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const all = await listTeacherComments();
        const relevant = all.filter(
          (c) =>
            c.course_id === task.classroom_course_id &&
            (!c.coursework_id || c.coursework_id === task.google_classroom_id),
        );
        if (cancelled) return;
        setComments(relevant);
        for (const c of relevant) {
          if (!c.read_at) void markTeacherCommentRead(c.id);
        }
      } catch {
        // non-fatal — comments just won't show
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.classroom_course_id, task?.google_classroom_id]);

  if (!task) return null;
  const isClassroom = task.source === "classroom";
  const isSubmitted = submissionState ? SUBMITTED_STATES.has(submissionState) : false;
  const isGraded = submissionState === "RETURNED";

  async function handleSubmissionAction(action: "turnIn" | "reclaim") {
    if (!session || !task?.classroom_course_id || !task.google_classroom_id) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/google-classroom/submission", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: task.classroom_course_id,
          courseworkId: task.google_classroom_id,
          action,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        submissionState?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not update your submission.");
      setSubmissionState(data.submissionState ?? (action === "turnIn" ? "TURNED_IN" : "CREATED"));
      toast.success(action === "turnIn" ? "Assignment turned in!" : "Turn-in undone — you can edit it again.");
      onSubmissionChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update your submission.";
      if (task.alternate_link) {
        toast.error(message, {
          action: {
            label: "Open in Classroom",
            onClick: () => window.open(task.alternate_link!, "_blank", "noreferrer"),
          },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachLink(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !task?.classroom_course_id || !task.google_classroom_id || !linkInput.trim()) return;
    setAttaching(true);
    try {
      const res = await fetch("/api/google-classroom/submission", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: task.classroom_course_id,
          courseworkId: task.google_classroom_id,
          action: "addLink",
          url: linkInput.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        studentWork?: MaterialItem[];
      };
      if (!res.ok) throw new Error(data.error || "Could not attach that link.");
      setStudentWork(data.studentWork ?? []);
      setLinkInput("");
      toast.success("Link attached to your work.");
      onSubmissionChanged?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not attach that link.";
      if (task.alternate_link) {
        toast.error(message, {
          action: {
            label: "Open in Classroom",
            onClick: () => window.open(task.alternate_link!, "_blank", "noreferrer"),
          },
        });
      } else {
        toast.error(message);
      }
    } finally {
      setAttaching(false);
    }
  }

  async function handleSendNote(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !task || !teacherNote.trim() || !task.classroom_course_id) return;
    setSendingNote(true);
    try {
      const res = await fetch("/api/google-classroom/message-teacher", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: task.classroom_course_id,
          courseworkId: task.google_classroom_id,
          message: teacherNote.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; teacherEmail?: string };
      if (!res.ok) throw new Error(data.error || "Could not send your message.");
      toast.success(`Sent to your teacher (${data.teacherEmail}).`);
      setTeacherNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setSendingNote(false);
    }
  }

  async function handleAskLumin() {
    if (!user || !task) return;
    setAskingLumin(true);
    try {
      const rubricText = task.rubric?.criteria
        ?.map(
          (c) =>
            `${c.title ?? "Criterion"}: ${(c.levels ?? [])
              .map((l) => `${l.title ?? ""} (${l.points ?? "?"} pts)`)
              .join(", ")}`,
        )
        .join("\n");

      const prompt = [
        `Can you help me understand this assignment?`,
        `Title: ${task.title}`,
        task.course ? `Course: ${task.course}` : null,
        task.due_date ? `Due: ${task.due_date}` : null,
        task.description ? `Description: ${task.description}` : null,
        rubricText ? `Rubric:\n${rubricText}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const thread = await createThread(user.id);
      try {
        sessionStorage.setItem(`clearpath:chat-prefill:${thread.id}`, prompt);
      } catch {
        // ignore — worst case the chat just opens with an empty input
      }
      onOpenChange(false);
      await navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
    } catch {
      toast.error("Could not start a conversation with Lumin.");
    } finally {
      setAskingLumin(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-border/70 bg-card/95 backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            {[task.course, task.due_date ? `Due ${task.due_date}` : null].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>

        {isClassroom && task.classroom_course_id && task.google_classroom_id && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/40 p-3">
            {isSubmitted ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {isGraded ? "Turned in · graded" : "Turned in"}
                </span>
                {!isGraded && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={submitting}
                    onClick={() => void handleSubmissionAction("reclaim")}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Undo turn-in
                  </Button>
                )}
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={submitting}
                onClick={() => void handleSubmissionAction("turnIn")}
                className="gap-1.5 bg-gradient-lumin text-primary-foreground shadow-glow"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                {submitting ? "Turning in…" : "Turn in"}
              </Button>
            )}
            {task.alternate_link && (
              <a
                href={task.alternate_link}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Open in Google Classroom
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
          </div>
        )}

        {typeof task.assigned_grade === "number" && (
          <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
            <GraduationCap className="h-4 w-4 text-accent" aria-hidden />
            <span className="text-sm font-medium">
              Grade: {task.assigned_grade}
              {typeof task.max_points === "number" ? ` / ${task.max_points}` : ""}
            </span>
          </div>
        )}

        {task.description && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p>
          </div>
        )}

        {(studentWork.length > 0 || (isClassroom && task.classroom_course_id && task.google_classroom_id)) && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FileEdit className="h-3.5 w-3.5" aria-hidden />
              Your work
            </p>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Your own copy of this assignment — edit it, then use Turn in above when you're done.
            </p>
            {studentWork.length > 0 && (
              <ul className="space-y-1">
                {studentWork.map((m, i) => (
                  <li key={i}>
                    {m.url ? (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-accent/20"
                      >
                        <FileEdit className="h-3.5 w-3.5" aria-hidden />
                        Open "{m.title}"
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">{m.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isClassroom && task.classroom_course_id && task.google_classroom_id && (
              <form onSubmit={handleAttachLink} className="mt-2 flex gap-1.5">
                <Input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  placeholder="Paste a Google Drive or other link to attach…"
                  className="h-8 text-xs"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={attaching || !linkInput.trim()}
                  className="h-8 shrink-0 gap-1 border-border/70 bg-background/40 px-2.5 text-xs text-foreground hover:text-foreground"
                >
                  <Link2 className="h-3.5 w-3.5" aria-hidden />
                  {attaching ? "Attaching…" : "Attach"}
                </Button>
              </form>
            )}
          </div>
        )}

        {task.materials.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" aria-hidden />
              Attached materials
            </p>
            <ul className="space-y-1">
              {task.materials.map((m, i) =>
                m.url ? (
                  <li key={i}>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-accent underline underline-offset-4"
                    >
                      {m.title}
                    </a>
                  </li>
                ) : (
                  <li key={i} className="text-sm text-muted-foreground">
                    {m.title}
                  </li>
                ),
              )}
            </ul>
          </div>
        )}

        {task.rubric?.criteria && task.rubric.criteria.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rubric
            </p>
            <div className="space-y-3">
              {task.rubric.criteria.map((criterion, i) => (
                <div key={i} className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <p className="text-sm font-medium">{criterion.title ?? `Criterion ${i + 1}`}</p>
                  {criterion.levels && criterion.levels.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {criterion.levels.map((level, j) => (
                        <li key={j} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {level.title ?? "Level"} ({level.points ?? "?"} pts)
                          </span>
                          {level.description ? ` — ${level.description}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {comments.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              Comments from your teacher
            </p>
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{c.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => void handleAskLumin()}
          disabled={askingLumin}
          className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {askingLumin ? "Starting…" : "Ask Lumin about this"}
        </Button>

        {isClassroom && task.classroom_course_id && (
          <form onSubmit={handleSendNote} className="border-t border-border/60 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Message your teacher privately
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sent by email directly to your teacher — Google Classroom doesn't let apps post
              comments, so this is the closest equivalent.
            </p>
            <Textarea
              value={teacherNote}
              onChange={(e) => setTeacherNote(e.target.value)}
              placeholder="Ask a question about this assignment…"
              className="mt-2 min-h-20"
            />
            <DialogFooter className="mt-2">
              <Button
                type="submit"
                size="sm"
                disabled={sendingNote || !teacherNote.trim()}
                className="gap-1.5 bg-gradient-lumin text-primary-foreground shadow-glow"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                {sendingNote ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
