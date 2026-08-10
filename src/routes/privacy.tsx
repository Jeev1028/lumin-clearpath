import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalLayout } from "@/components/lumin/LegalLayout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — ClearPath" },
      {
        name: "description",
        content: "How ClearPath and Lumin AI collect, use, and protect your information.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" effectiveDate="August 10, 2026">
      <p>
        ClearPath ("ClearPath," "we," "us," or "our") provides Lumin AI, a study platform that
        helps students track tasks, manage a class schedule, and work with an academically honest
        AI study companion. This Privacy Policy explains what information we collect, how we use
        it, and the choices you have. By creating an account or using ClearPath, you agree to the
        practices described here.
      </p>

      <h2 className="text-xl font-semibold">1. Information we collect</h2>
      <p>We collect the following categories of information:</p>
      <ul>
        <li>
          <strong>Account information</strong> — your name, email address, and a securely hashed
          password if you sign up directly, or your name, email address, and profile photo if you
          sign in with Google.
        </li>
        <li>
          <strong>Content you provide</strong> — tasks, assignments, class schedule entries, your
          conversations with Lumin AI, and any study-planner preferences you choose to type in
          (such as preferred study times or subjects you find harder).
        </li>
        <li>
          <strong>Connected Google services (optional)</strong> — if you choose to connect Google
          Classroom or Google Calendar, we access only the specific data needed to display your
          courses, coursework, and calendar events inside ClearPath (for example, course names,
          assignment titles and due dates, and calendar event details). We request the minimum
          scopes necessary and never request access you have not explicitly approved.
        </li>
        <li>
          <strong>Usage information</strong> — basic technical data such as browser type,
          device type, and general usage patterns, used to keep the service reliable and secure.
        </li>
      </ul>

      <h2 className="text-xl font-semibold">2. How we use your information</h2>
      <ul>
        <li>To provide, operate, and maintain ClearPath's core features (tasks, schedule, Lumin AI chat).</li>
        <li>To personalize your experience, such as showing your own tasks, schedule, and chat history.</li>
        <li>
          To let Lumin AI read your outstanding tasks, weekly schedule, upcoming calendar events,
          and any preferences you provide, in order to generate a personalized study/assignment
          plan when you use the study planner on the Tasks or Schedule page. See Section 4 below
          for more detail.
        </li>
        <li>To sync coursework, assignments, and events from Google Classroom and Google Calendar, if you connect them.</li>
        <li>To maintain the security and integrity of the platform, including detecting abuse.</li>
        <li>To communicate with you about your account or important changes to the service.</li>
      </ul>
      <p>We do not sell your personal information, and we do not use your data for advertising.</p>

      <h2 className="text-xl font-semibold">3. Google API Services User Data Policy</h2>
      <p>
        ClearPath's use and transfer of information received from Google APIs (including Google
        Sign-In, Google Classroom, and Google Calendar) to any other app adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Data obtained through Google APIs is used only
        to provide and improve the ClearPath features you directly interact with, is never used
        for advertising, and is never sold or shared with third parties except as necessary to
        operate the service (for example, our database provider) or as required by law. You can
        revoke ClearPath's access to your Google data at any time from your{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          Google Account permissions page
        </a>
        .
      </p>

      <h2 className="text-xl font-semibold">4. How Lumin AI uses your information</h2>
      <p>
        Messages you send to Lumin AI are processed by a third-party AI model provider in order to
        generate a response, and are stored in our database so your conversation history is
        available to you across sessions. Please avoid sharing sensitive personal information
        (such as government ID numbers, medical information, or passwords) in your chats.
      </p>
      <p>
        When you use the Lumin study planner (available on the Tasks and Schedule pages), Lumin AI
        additionally reads your outstanding tasks (titles, courses, kinds, due dates, and status),
        your weekly recurring schedule, any calendar events already saved within the plan's time
        window, and any preferences you type in, and sends that information to the same
        third-party AI model provider to generate a suggested day-by-day plan. The resulting plan
        is saved to your account so it's available when you return, and is replaced each time you
        regenerate it. This data is used only to build the plan shown to you — it is never used
        to train third-party models, shared with your school, or shared with anyone else.
      </p>

      <h2 className="text-xl font-semibold">5. Where your data is stored</h2>
      <p>
        Your account data, tasks, schedule, chat history, and generated study plans are stored
        using Supabase, a hosted database and authentication provider. Data is encrypted in
        transit (HTTPS/TLS), and access to the underlying database is restricted and protected by
        authentication rules that ensure you can only access your own data.
      </p>

      <h2 className="text-xl font-semibold">6. Students and school use</h2>
      <p>
        ClearPath is designed for use by students, including students under the age of majority,
        in an educational context. We only collect the information described in this policy and
        do not knowingly collect more information than is necessary to provide the service. If you
        are a parent, guardian, or school administrator with questions about a student's data,
        please contact us using the details below.
      </p>

      <h2 className="text-xl font-semibold">7. Your rights and choices</h2>
      <ul>
        <li>You can access, update, or delete your task, schedule, chat, and study-plan data at any time from within the app.</li>
        <li>You can disconnect Google Classroom or Google Calendar at any time, which stops future data access immediately.</li>
        <li>You can request a full copy of your data, or full deletion of your account and associated data, by contacting us.</li>
      </ul>

      <h2 className="text-xl font-semibold">8. Data retention</h2>
      <p>
        We retain your information for as long as your account is active. If you delete your
        account, we delete your personal data within a reasonable time, except where we are
        required to retain limited records for legal or security purposes.
      </p>

      <h2 className="text-xl font-semibold">9. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. If we make material changes, we will
        update the effective date above and, where appropriate, notify you directly.
      </p>

      <h2 className="text-xl font-semibold">10. Contact us</h2>
      <p>
        If you have questions about this Privacy Policy or how your information is handled,
        contact us at{" "}
        <a href="mailto:lumin-support@luminclearpath.ca">lumin-support@luminclearpath.ca</a>.
      </p>

      <p>
        See also our{" "}
        <Link to="/terms" className="underline underline-offset-4">
          Terms of Service
        </Link>
        .
      </p>
    </LegalLayout>
  );
}
