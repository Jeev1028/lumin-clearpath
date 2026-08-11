import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { useAuth } from "@/hooks/useAuth";
import {
  getClassroomConnection,
  listClassroomCourses,
  listClassroomCoursework,
  type ClassroomConnection,
  type ClassroomCourse,
  type ClassroomCoursework,
} from "@/lib/clearpath";

export const Route = createFileRoute("/grades")({
  head: () => ({
    meta: [
      { title: "Grades — ClearPath by Lumin AI" },
      { name: "description", content: "Your grades across every connected Google Classroom course." },
    ],
  }),
  component: GradesPage,
});

function average(items: ClassroomCoursework[]): number | null {
  const graded = items.filter(
    (i) => typeof i.assigned_grade === "number" && typeof i.max_points === "number" && i.max_points > 0,
  );
  if (graded.length === 0) return null;
  const pct = graded.reduce((sum, i) => sum + i.assigned_grade! / i.max_points!, 0) / graded.length;
  return Math.round(pct * 1000) / 10;
}

type TrendPoint = { label: string; date: string; percent: number };

/** Grade trend over time, using each item's due date as the best available
 * chronological anchor (Classroom doesn't expose a separate "graded on"
 * timestamp). Only meaningful with at least a couple of graded, dated
 * items, so callers should check length before rendering a chart. */
function gradeTrend(items: ClassroomCoursework[]): TrendPoint[] {
  return items
    .filter(
      (i) =>
        typeof i.assigned_grade === "number" &&
        typeof i.max_points === "number" &&
        i.max_points > 0 &&
        i.due_at,
    )
    .map((i) => ({
      label: i.title,
      date: i.due_at!,
      percent: Math.round((i.assigned_grade! / i.max_points!) * 1000) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function GradesPage() {
  const navigate = useNavigate();
  const { user, loading, needsMfa } = useAuth();
  const [connection, setConnection] = useState<ClassroomConnection | null>(null);
  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [coursework, setCoursework] = useState<ClassroomCoursework[]>([]);

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
    Promise.all([getClassroomConnection(), listClassroomCourses(), listClassroomCoursework()])
      .then(([conn, courseData, courseworkData]) => {
        setConnection(conn);
        setCourses(courseData);
        setCoursework(courseworkData);
      })
      .catch(() => toast.error("Could not load your grades."));
  }, [loading, user, needsMfa, navigate]);

  const courseworkByCourseId = useMemo(() => {
    const map = new Map<string, ClassroomCoursework[]>();
    for (const cw of coursework) {
      const list = map.get(cw.course_id) ?? [];
      list.push(cw);
      map.set(cw.course_id, list);
    }
    return map;
  }, [coursework]);

  const overallAverage = average(coursework);

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-4xl px-6 pb-24">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <GraduationCap className="h-5 w-5 text-accent" aria-hidden />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Grades</h1>
            <p className="text-sm text-muted-foreground">
              Pulled from Google Classroom — synced from the{" "}
              <Link to="/classroom" className="underline underline-offset-4">
                Classroom
              </Link>{" "}
              page.
            </p>
          </div>
        </div>

        {!connection ? (
          <div className="mt-8 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
            <p className="text-sm text-muted-foreground">
              Connect Google Classroom on the{" "}
              <Link to="/classroom" className="underline underline-offset-4">
                Classroom page
              </Link>{" "}
              to see your grades here.
            </p>
          </div>
        ) : (
          <>
            {overallAverage !== null && (
              <div className="mt-6 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
                <p className="text-xs text-muted-foreground">Overall average (graded work only)</p>
                <p className="mt-1 text-3xl font-bold text-accent">{overallAverage}%</p>
              </div>
            )}

            <div className="mt-6 space-y-6">
              {courses.map((course) => {
                const work = courseworkByCourseId.get(course.id) ?? [];
                const courseAverage = average(work);
                const trend = gradeTrend(work);
                if (work.length === 0) return null;
                return (
                  <div
                    key={course.id}
                    className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="text-lg font-semibold">{course.name}</h2>
                      {courseAverage !== null && (
                        <span className="text-sm font-semibold text-accent">{courseAverage}%</span>
                      )}
                    </div>

                    {trend.length >= 2 && (
                      <div className="mt-3 h-32 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={trend} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                              tickFormatter={(value: string) =>
                                new Date(value).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })
                              }
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                              width={32}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "var(--card)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                fontSize: 12,
                              }}
                              labelFormatter={(value: string) => new Date(value).toLocaleDateString()}
                              formatter={(value: number, _name, item) => [
                                `${value}%`,
                                item.payload.label,
                              ]}
                            />
                            <Line
                              type="monotone"
                              dataKey="percent"
                              stroke="var(--accent)"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border/60 text-xs text-muted-foreground">
                            <th className="pb-2 pr-4">Coursework</th>
                            <th className="pb-2 pr-4">Due</th>
                            <th className="pb-2 pr-4">Grade</th>
                            <th className="pb-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {work.map((item) => (
                            <tr key={item.id} className="border-b border-border/40">
                              <td className="py-2 pr-4">{item.title}</td>
                              <td className="py-2 pr-4 text-muted-foreground">
                                {item.due_at ? new Date(item.due_at).toLocaleDateString() : "—"}
                              </td>
                              <td className="py-2 pr-4">
                                {typeof item.assigned_grade === "number" && item.max_points
                                  ? `${item.assigned_grade} / ${item.max_points}`
                                  : "Not graded yet"}
                              </td>
                              <td className="py-2 text-muted-foreground">
                                {item.submission_state === "TURNED_IN"
                                  ? "Turned in"
                                  : item.submission_state === "RETURNED"
                                    ? "Returned"
                                    : "Assigned"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
