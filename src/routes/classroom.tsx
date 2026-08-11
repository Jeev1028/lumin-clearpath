import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookOpenCheck, CheckCircle2, GraduationCap, Mail, Megaphone, Paperclip, RefreshCw } from "lucide-react";
import { MaterialPreviewCard } from "@/components/lumin/MaterialPreviewCard";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { TaskDetailDialog, type TaskDetailInfo } from "@/components/lumin/TaskDetailDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  getClassroomConnection,
  listClassroomAnnouncements,
  listClassroomCourses,
  listClassroomCoursework,
  listClassroomMaterials,
  type ClassroomAnnouncement,
  type ClassroomConnection,
  type ClassroomCourse,
  type ClassroomCoursework,
  type ClassroomMaterial,
} from "@/lib/clearpath";

const COMPLETED_STATES = new Set(["TURNED_IN", "RETURNED"]);

export const Route = createFileRoute("/classroom")({
  head: () => ({
    meta: [
      { title: "Classroom — ClearPath by Lumin AI" },
      {
        name: "description",
        content: "Your Google Classroom courses, coursework, announcements and materials in one place.",
      },
    ],
  }),
  component: ClassroomPage,
});

function ClassroomPage() {
  const navigate = useNavigate();
  const { session, user, loading, needsMfa } = useAuth();
  const [connection, setConnection] = useState<ClassroomConnection | null>(null);
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [coursework, setCoursework] = useState<ClassroomCoursework[]>([]);
  const [announcements, setAnnouncements] = useState<ClassroomAnnouncement[]>([]);
  const [materials, setMaterials] = useState<ClassroomMaterial[]>([]);
  const [connectBusy, setConnectBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskDetailInfo | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (needsMfa) {
      void navigate({ to: "/mfa-challenge" });
      return;
    }
    Promise.all([
      getClassroomConnection(),
      listClassroomCourses(),
      listClassroomCoursework(),
      listClassroomAnnouncements(),
      listClassroomMaterials(),
    ])
      .then(([conn, courseData, courseworkData, announcementData, materialData]) => {
        setConnection(conn);
        setCourses(courseData);
        setCoursework(courseworkData);
        setAnnouncements(announcementData);
        setMaterials(materialData);
        if (conn) void handleSync({ silent: true });
      })
      .catch(() => toast.error("Could not load your classroom data."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, needsMfa, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("classroom");
    if (!status) return;
    if (status === "connected") toast.success("Google Classroom connected!");
    else if (status === "denied") toast.error("Google Classroom connection was cancelled.");
    else toast.error("Could not connect Google Classroom. Please try again.");
    params.delete("classroom");
    const rest = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, []);

  async function handleConnect() {
    if (!session) return;
    setConnectBusy(true);
    try {
      const res = await fetch("/api/google-classroom/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error();
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      toast.error("Could not start the Google Classroom connection.");
      setConnectBusy(false);
    }
  }

  async function handleSync(options?: { silent?: boolean }) {
    if (!session) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/google-classroom/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const [courseData, courseworkData, announcementData, materialData, conn] = await Promise.all([
        listClassroomCourses(),
        listClassroomCoursework(),
        listClassroomAnnouncements(),
        listClassroomMaterials(),
        getClassroomConnection(),
      ]);
      setCourses(courseData);
      setCoursework(courseworkData);
      setAnnouncements(announcementData);
      setMaterials(materialData);
      setConnection(conn);
      if (!options?.silent) toast.success("Classroom synced — assignments added to your Tasks.");
    } catch (err) {
      if (!options?.silent) {
        toast.error(
          err instanceof Error && err.message ? err.message : "Sync failed — please try again.",
        );
      }
    } finally {
      setSyncing(false);
    }
  }

  async function reloadLocalData() {
    const [courseData, courseworkData] = await Promise.all([
      listClassroomCourses(),
      listClassroomCoursework(),
    ]);
    setCourses(courseData);
    setCoursework(courseworkData);
  }

  async function handleDisconnect() {
    if (!session) return;
    setConnectBusy(true);
    try {
      await fetch("/api/google-classroom/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setConnection(null);
      toast.success("Google Classroom disconnected.");
    } catch {
      toast.error("Could not disconnect.");
    } finally {
      setConnectBusy(false);
    }
  }

  function openCourseworkDetail(course: ClassroomCourse, work: ClassroomCoursework) {
    setDetailTask({
      title: work.title,
      course: course.name,
      due_date: work.due_at ? work.due_at.slice(0, 10) : null,
      description: work.description,
      materials: work.materials,
      student_work: work.student_work,
      rubric: work.rubric,
      source: "classroom",
      classroom_course_id: course.id,
      google_classroom_id: work.id,
      submission_state: work.submission_state,
      alternate_link: work.alternate_link,
      assigned_grade: work.assigned_grade,
      max_points: work.max_points,
    });
    setDetailOpen(true);
  }

  async function handleInviteTeacher(course: ClassroomCourse) {
    if (!session) return;
    try {
      const res = await fetch("/api/google-classroom/invite-teacher", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ courseId: course.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; teacherEmail?: string };
      if (!res.ok) throw new Error(data.error || "Could not send the invite.");
      toast.success(`Invite sent to ${data.teacherEmail}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the invite.");
    }
  }

  const courseworkByCourseId = useMemo(() => {
    const map = new Map<string, ClassroomCoursework[]>();
    for (const cw of coursework) {
      const list = map.get(cw.course_id) ?? [];
      list.push(cw);
      map.set(cw.course_id, list);
    }
    return map;
  }, [coursework]);

  const announcementsByCourseId = useMemo(() => {
    const map = new Map<string, ClassroomAnnouncement[]>();
    for (const a of announcements) {
      const list = map.get(a.course_id) ?? [];
      list.push(a);
      map.set(a.course_id, list);
    }
    return map;
  }, [announcements]);

  const materialsByCourseId = useMemo(() => {
    const map = new Map<string, ClassroomMaterial[]>();
    for (const m of materials) {
      const list = map.get(m.course_id) ?? [];
      list.push(m);
      map.set(m.course_id, list);
    }
    return map;
  }, [materials]);

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pb-24">
        <h1 className="text-3xl font-bold">Classroom</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your Google Classroom courses, coursework, announcements and materials — assignments
          are also added to{" "}
          <Link to="/tasks" className="underline underline-offset-4">
            Tasks
          </Link>
          , and grades show on the{" "}
          <Link to="/grades" className="underline underline-offset-4">
            Grades
          </Link>{" "}
          page.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <GraduationCap className="h-5 w-5 text-accent" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold">Google Classroom</p>
              <p className="text-xs text-muted-foreground">
                {connection
                  ? connection.last_synced_at
                    ? `Connected · last synced ${new Date(connection.last_synced_at).toLocaleString()}`
                    : "Connected · not yet synced"
                  : "Import your courses, coursework and grades, optional."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {connection ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={connectBusy || syncing}
                  onClick={() => void handleSync()}
                  className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
                  {syncing ? "Syncing…" : "Sync now"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={connectBusy || syncing}
                  onClick={() => void handleDisconnect()}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={connectBusy}
                onClick={() => void handleConnect()}
                className="bg-gradient-lumin text-primary-foreground"
              >
                Connect Google Classroom
              </Button>
            )}
          </div>
        </div>

        {!connection ? (
          <p className="mt-8 text-sm text-muted-foreground">
            Connect Google Classroom above to see your courses here.
          </p>
        ) : courses.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            No active courses found yet — try Sync now, or check back after your teacher adds you
            to a class.
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {courses.map((course) => {
              const work = courseworkByCourseId.get(course.id) ?? [];
              const pendingWork = work.filter((w) => !COMPLETED_STATES.has(w.submission_state ?? ""));
              const completedWork = work.filter((w) => COMPLETED_STATES.has(w.submission_state ?? ""));
              const courseAnnouncements = announcementsByCourseId.get(course.id) ?? [];
              const courseMaterials = materialsByCourseId.get(course.id) ?? [];
              const renderWorkItem = (item: ClassroomCoursework) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openCourseworkDetail(course, item)}
                  className="w-full rounded-xl border border-border/60 bg-background/40 p-3 text-left text-sm transition-colors hover:border-accent/40"
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.due_at ? `Due ${item.due_at.slice(0, 10)}` : "No due date"}
                    {typeof item.assigned_grade === "number" && item.max_points
                      ? ` · ${item.assigned_grade}/${item.max_points}`
                      : ""}
                  </p>
                </button>
              );
              return (
                <div
                  key={course.id}
                  className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{course.name}</h2>
                      <span className="text-xs text-muted-foreground">
                        {[course.section, course.room].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    {course.teacher_email && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleInviteTeacher(course)}
                        className="gap-1.5 border-border/70 bg-background/40 text-foreground hover:text-foreground"
                      >
                        <Mail className="h-3.5 w-3.5" aria-hidden />
                        Invite my teacher
                      </Button>
                    )}
                  </div>

                  {pendingWork.length > 0 && (
                    <div className="mt-4 border-t border-border/60 pt-4">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <BookOpenCheck className="h-3.5 w-3.5" aria-hidden />
                        Coursework
                      </p>
                      <div className="space-y-2">{pendingWork.map(renderWorkItem)}</div>
                    </div>
                  )}

                  {completedWork.length > 0 && (
                    <div className="mt-4 border-t border-border/60 pt-4">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        Completed
                      </p>
                      <div className="space-y-2">{completedWork.map(renderWorkItem)}</div>
                    </div>
                  )}

                  {courseAnnouncements.length > 0 && (
                    <div className="mt-4 border-t border-border/60 pt-4">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Megaphone className="h-3.5 w-3.5" aria-hidden />
                        Announcements
                      </p>
                      <div className="space-y-2">
                        {courseAnnouncements.slice(0, 5).map((a) => (
                          <div
                            key={a.id}
                            className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm"
                          >
                            <p>{a.text}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(a.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {courseMaterials.length > 0 && (
                    <div className="mt-4 border-t border-border/60 pt-4">
                      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Paperclip className="h-3.5 w-3.5" aria-hidden />
                        Materials
                      </p>
                      <div className="space-y-2">
                        {courseMaterials.map((m) => (
                          <div
                            key={m.id}
                            className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm"
                          >
                            <p className="font-medium">{m.title}</p>
                            {m.items.length > 0 && (
                              <ul className="mt-1.5 space-y-1.5">
                                {m.items.map((item, i) => (
                                  <li key={i}>
                                    <MaterialPreviewCard item={item} compact />
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <TaskDetailDialog
        task={detailTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSubmissionChanged={() => void reloadLocalData()}
      />
    </div>
  );
}
