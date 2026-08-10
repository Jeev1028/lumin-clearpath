import { useNavigate } from "@tanstack/react-router";
import { Paperclip, Send, Sparkles } from "lucide-react";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import type { MaterialItem, Rubric } from "@/lib/clearpath";
import { createThread } from "@/lib/threads";

export type TaskDetailInfo = {
  title: string;
  course: string | null;
  due_date: string | null;
  description: string | null;
  materials: MaterialItem[];
  rubric: Rubric | null;
  source: string;
  classroom_course_id: string | null;
  google_classroom_id: string | null;
};

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
}: {
  task: TaskDetailInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const [teacherNote, setTeacherNote] = useState("");
  const [sendingNote, setSendingNote] = useState(false);
  const [askingLumin, setAskingLumin] = useState(false);

  if (!task) return null;
  const isClassroom = task.source === "classroom";

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

        {task.description && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p>
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
