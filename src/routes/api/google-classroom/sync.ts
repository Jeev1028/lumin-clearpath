import { createFileRoute } from "@tanstack/react-router";

import { getAdminClient, requireUser } from "@/lib/api-auth";
import {
  courseWorkDueDate,
  listAnnouncements,
  listCourseWork,
  listCourseWorkMaterials,
  listMyCourses,
  listMySubmissions,
  listRubrics,
  listTeachers,
  refreshAccessToken,
  summarizeMaterial,
  type ClassroomRubric,
} from "@/lib/google-classroom";
import { decryptToken, encryptToken } from "@/lib/token-crypto";

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
        const { data: connection, error: connError } = await admin
          .from("google_classroom_connections")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (connError) return new Response("Could not load connection", { status: 500 });
        if (!connection) return new Response("Google Classroom is not connected", { status: 400 });

        let accessToken = connection.access_token_encrypted
          ? decryptToken(connection.access_token_encrypted)
          : null;
        const expiresAt = connection.access_token_expires_at
          ? new Date(connection.access_token_expires_at).getTime()
          : 0;
        if (!accessToken || expiresAt - Date.now() < 60_000) {
          try {
            const refreshToken = decryptToken(connection.refresh_token_encrypted);
            const refreshed = await refreshAccessToken(refreshToken);
            accessToken = refreshed.access_token;
            await admin
              .from("google_classroom_connections")
              .update({
                access_token_encrypted: encryptToken(accessToken),
                access_token_expires_at: new Date(
                  Date.now() + refreshed.expires_in * 1000,
                ).toISOString(),
              })
              .eq("user_id", userId);
          } catch (err) {
            console.error("[google-classroom] token refresh failed", err);
            return new Response("Google Classroom access has expired — please reconnect it.", {
              status: 409,
            });
          }
        }

        let courseCount = 0;
        let courseworkCount = 0;
        let taskCount = 0;
        let announcementCount = 0;
        let materialCount = 0;

        try {
          const courses = await listMyCourses(accessToken!);
          for (const course of courses) {
            // Best-effort -- roster access can be restricted by the school's
            // Workspace admin; a missing teacher email just disables the
            // "message the teacher" relay for that course, nothing else.
            let teacherEmail: string | null = null;
            try {
              const teachers = await listTeachers(accessToken!, course.id);
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

            const [courseWork, submissions, announcements, courseMaterials] = await Promise.all([
              listCourseWork(accessToken!, course.id),
              listMySubmissions(accessToken!, course.id),
              listAnnouncements(accessToken!, course.id),
              listCourseWorkMaterials(accessToken!, course.id),
            ]);

            const submissionByCourseWork = new Map(submissions.map((s) => [s.courseWorkId, s]));

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
                const rubrics = await listRubrics(accessToken!, course.id, work.id);
                rubric = rubrics[0] ?? null;
              } catch (err) {
                console.error("[google-classroom] could not load rubric", err);
              }

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
