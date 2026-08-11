import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import {
  ClassroomNotConnectedError,
  ClassroomTokenExpiredError,
  getValidClassroomAccessToken,
} from "@/lib/classroom-connection";
import { escapeHtml, sendEmail } from "@/lib/email";
import {
  courseWorkDueDate,
  listAnnouncements,
  listCourseWork,
  listCourseWorkMaterials,
  listMyCourses,
  listMySubmissions,
  listRubrics,
  listTeachers,
  summarizeMaterial,
  type ClassroomRubric,
} from "@/lib/google-classroom";

function mapTaskStatus(submissionState: string | undefined): "todo" | "submitted" {
  return submissionState === "TURNED_IN" || submissionState === "RETURNED" ? "submitted" : "todo";
}

export const Route = createFileRoute("/api/google-classroom/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { userId } = auth;

        const admin = getAdminClient();
        let accessToken: string;
        try {
          accessToken = await getValidClassroomAccessToken(admin, userId);
        } catch (err) {
          if (err instanceof ClassroomNotConnectedError) {
            return new Response("Google Classroom is not connected", { status: 400 });
          }
          if (err instanceof ClassroomTokenExpiredError) {
            return new Response(err.message, { status: 409 });
          }
          return new Response("Could not load connection", { status: 500 });
        }

        // Notifications ("new assignment posted" / "you got a grade") are
        // only meaningful once there's a prior sync to diff against --
        // without this, a student's very first connect would email them
        // once for every single pre-existing assignment in every course.
        const { data: connMeta } = await admin
          .from("google_classroom_connections")
          .select("last_synced_at")
          .eq("user_id", userId)
          .maybeSingle();
        const notifyEnabled = Boolean(connMeta?.last_synced_at);

        let studentEmail: string | null = null;
        let emailsEnabled = false;
        if (notifyEnabled) {
          const { data: authUser } = await admin.auth.admin.getUserById(userId);
          studentEmail = authUser?.user?.email ?? null;
          const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
          emailsEnabled = meta["email_digest_enabled"] !== false;
        }

        async function notify(options: {
          type: string;
          title: string;
          bodyText: string;
          bodyHtml: string;
        }) {
          if (!notifyEnabled) return;

          // In-app notification center entry -- independent of the email
          // digest preference, since that's a separate channel/toggle.
          try {
            await admin.from("app_notifications").insert({
              user_id: userId,
              type: options.type,
              title: options.title,
              body: options.bodyText,
              url: "/classroom",
            });
          } catch (err) {
            console.error("[google-classroom] in-app notification failed", err);
          }

          if (!emailsEnabled || !studentEmail) return;
          try {
            await sendEmail({
              to: studentEmail,
              subject: options.title,
              html: `
                <div style="font-family: -apple-system, Segoe UI, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
                  ${options.bodyHtml}
                  <p><a href="https://luminclearpath.ca/classroom" style="color:#2563eb;">Open Classroom on ClearPath →</a></p>
                  <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
                    You're getting this because email notifications are on for your ClearPath account.
                    Turn them off anytime in Account settings.
                  </p>
                </div>`,
            });
          } catch (err) {
            console.error("[google-classroom] notification email failed", err);
          }
        }

        let courseCount = 0;
        let courseworkCount = 0;
        let taskCount = 0;
        let announcementCount = 0;
        let materialCount = 0;

        try {
          const courses = await listMyCourses(accessToken);
          for (const course of courses) {
            // Best-effort -- roster access can be restricted by the school's
            // Workspace admin; a missing teacher email just disables the
            // "message the teacher" relay for that course, nothing else.
            let teacherEmail: string | null = null;
            try {
              const teachers = await listTeachers(accessToken, course.id);
              teacherEmail = teachers.find((t) => t.profile?.emailAddress)?.profile?.emailAddress ?? null;
            } catch (err) {
              console.error("[google-classroom] could not load teacher roster", err);
            }

            await admin.from("classroom_courses").upsert(
              {
                id: course.id,
                user_id: userId,
                name: course.name,
                section: course.section ?? null,
                room: course.room ?? null,
                teacher_email: teacherEmail,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id,user_id" },
            );
            courseCount++;

            const [courseWork, submissions, announcements, courseMaterials, existingCoursework] =
              await Promise.all([
                listCourseWork(accessToken, course.id),
                listMySubmissions(accessToken, course.id),
                listAnnouncements(accessToken, course.id),
                listCourseWorkMaterials(accessToken, course.id),
                admin
                  .from("classroom_coursework")
                  .select("id, submission_state, assigned_grade")
                  .eq("course_id", course.id)
                  .eq("user_id", userId),
              ]);

            const submissionByCourseWork = new Map(submissions.map((s) => [s.courseWorkId, s]));
            const existingById = new Map((existingCoursework.data ?? []).map((c) => [c.id, c]));

            for (const work of courseWork) {
              const submission = submissionByCourseWork.get(work.id);
              const dueDate = courseWorkDueDate(work);
              const materials = (work.materials ?? [])
                .map(summarizeMaterial)
                .filter((m): m is NonNullable<typeof m> => m !== null);
              // "Make a copy for each student" attachments live on the
              // student's own submission, not on the shared courseWork --
              // these are the student's individually-owned file, distinct
              // from the (often read-only) shared materials above.
              const studentWork = (submission?.assignmentSubmission?.attachments ?? [])
                .map(summarizeMaterial)
                .filter((m): m is NonNullable<typeof m> => m !== null);

              let rubric: ClassroomRubric | null = null;
              try {
                const rubrics = await listRubrics(accessToken, course.id, work.id);
                rubric = rubrics[0] ?? null;
              } catch (err) {
                console.error("[google-classroom] could not load rubric", err);
              }

              const existing = existingById.get(work.id);
              const isNewCoursework = notifyEnabled && !existing;
              const gradeJustPosted =
                notifyEnabled &&
                Boolean(existing) &&
                typeof submission?.assignedGrade === "number" &&
                existing?.assigned_grade !== submission.assignedGrade;

              await admin.from("classroom_coursework").upsert(
                {
                  id: work.id,
                  user_id: userId,
                  course_id: course.id,
                  title: work.title,
                  description: work.description ?? null,
                  due_at: dueDate,
                  max_points: work.maxPoints ?? null,
                  assigned_grade: submission?.assignedGrade ?? null,
                  submission_state: submission?.state ?? null,
                  work_type: work.workType ?? null,
                  materials,
                  student_work: studentWork,
                  rubric,
                  alternate_link: work.alternateLink ?? null,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "id,user_id" },
              );
              courseworkCount++;

              const { error: taskError } = await admin.from("tasks").upsert(
                {
                  user_id: userId,
                  title: work.title,
                  course: course.name,
                  kind: "assignment",
                  status: mapTaskStatus(submission?.state),
                  due_date: dueDate,
                  description: work.description ?? null,
                  materials,
                  student_work: studentWork,
                  rubric,
                  source: "classroom",
                  google_classroom_id: work.id,
                  classroom_course_id: course.id,
                  submission_state: submission?.state ?? null,
                  alternate_link: work.alternateLink ?? null,
                  assigned_grade: submission?.assignedGrade ?? null,
                  max_points: work.maxPoints ?? null,
                },
                { onConflict: "user_id,google_classroom_id" },
              );
              if (!taskError) taskCount++;

              if (isNewCoursework) {
                const bodyText = `Just posted in ${course.name}${dueDate ? ` — due ${dueDate}` : ""}.`;
                await notify({
                  type: "new_assignment",
                  title: `New assignment: ${work.title}`,
                  bodyText,
                  bodyHtml: `<h2 style="margin-bottom: 4px;">${escapeHtml(work.title)}</h2>
                   <p style="color: #475569;">${escapeHtml(bodyText)}</p>`,
                });
              } else if (gradeJustPosted) {
                const points =
                  typeof work.maxPoints === "number"
                    ? ` (${submission!.assignedGrade}/${work.maxPoints})`
                    : ` (${submission!.assignedGrade})`;
                const bodyText = `Graded${points} in ${course.name}.`;
                await notify({
                  type: "grade",
                  title: `Grade posted: ${work.title}`,
                  bodyText,
                  bodyHtml: `<h2 style="margin-bottom: 4px;">${escapeHtml(work.title)}</h2>
                   <p style="color: #475569;">${escapeHtml(bodyText)}</p>`,
                });
              }
            }

            for (const announcement of announcements) {
              await admin.from("classroom_announcements").upsert(
                {
                  id: announcement.id,
                  user_id: userId,
                  course_id: course.id,
                  text: announcement.text,
                  created_at: announcement.creationTime,
                },
                { onConflict: "id,user_id" },
              );
              announcementCount++;
            }

            for (const material of courseMaterials) {
              const items = (material.materials ?? [])
                .map(summarizeMaterial)
                .filter((m): m is NonNullable<typeof m> => m !== null);
              await admin.from("classroom_materials").upsert(
                {
                  id: material.id,
                  user_id: userId,
                  course_id: course.id,
                  title: material.title,
                  description: material.description ?? null,
                  items,
                  created_at: material.creationTime,
                },
                { onConflict: "id,user_id" },
              );
              materialCount++;
            }
          }

          await admin
            .from("google_classroom_connections")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("user_id", userId);

          return Response.json({
            courses: courseCount,
            coursework: courseworkCount,
            tasksImported: taskCount,
            announcements: announcementCount,
            materials: materialCount,
          });
        } catch (err) {
          console.error("[google-classroom] sync failed", err);
          return new Response("Sync failed", { status: 500 });
        }
      },
    },
  },
});
