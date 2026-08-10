import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalLayout } from "@/components/lumin/LegalLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — ClearPath" },
      {
        name: "description",
        content: "The terms that govern your use of ClearPath and Lumin AI.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" effectiveDate="August 10, 2026">
      <p>
        Welcome to ClearPath. These Terms of Service ("Terms") govern your access to and use of
        ClearPath, including Lumin AI, our tasks and schedule tools, and any related features
        (collectively, the "Service"). By creating an account or using the Service, you agree to
        these Terms. If you do not agree, please do not use the Service.
      </p>

      <h2 className="text-xl font-semibold">1. Who can use ClearPath</h2>
      <p>
        ClearPath is intended for students, educators, and others using it for educational
        purposes. If you are under the age required to consent to online services in your
        jurisdiction without parental consent, you should have a parent or guardian review these
        Terms and our Privacy Policy with you before you use ClearPath.
      </p>

      <h2 className="text-xl font-semibold">2. Your account</h2>
      <ul>
        <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
        <li>You are responsible for all activity that occurs under your account.</li>
        <li>You must provide accurate information when creating your account.</li>
        <li>Notify us immediately if you suspect unauthorized use of your account.</li>
      </ul>

      <h2 className="text-xl font-semibold">3. Academic honesty — how Lumin AI behaves</h2>
      <p>
        Lumin AI is built to guide your learning, not to do your work for you. When you use Lumin
        AI, the following principles apply and cannot be bypassed by asking indirectly:
      </p>
      <ul>
        <li>Lumin AI will explain concepts, ask guiding questions, and check your understanding rather than writing assignments, essays, lab reports, or other graded work for you.</li>
        <li>When you ask Lumin AI to research a topic, it will provide links to real sources and remind you to cite them yourself in MLA format — it will not generate citations on your behalf.</li>
        <li>Analysis or summarization requests are answered in plain paragraph form, not formatted as an assignment deliverable (such as an essay or report) that could be submitted as your own work.</li>
      </ul>
      <p>
        You agree not to attempt to use ClearPath or Lumin AI to violate your school's academic
        integrity policies, and you remain solely responsible for complying with those policies
        and for how you use any information or guidance Lumin AI provides.
      </p>

      <h2 className="text-xl font-semibold">4. Lumin AI study planner</h2>
      <p>
        On the Tasks and Schedule pages, you can ask Lumin AI to generate a personalized
        study/assignment plan. To do this, Lumin AI reads your outstanding tasks, your weekly
        class schedule, any calendar events in the relevant time window, and any preferences you
        choose to type in (such as preferred study times or subjects you find harder), and uses
        that information — together with general, published learning-science research (such as
        spaced repetition, interleaving, and time-boxing) — to suggest a day-by-day plan. This
        feature only exists to help you decide <em>when</em> to work on your own tasks; it never
        completes any assignment's actual content for you, and remains subject to the academic
        honesty principles in Section 3. The plan is a suggestion, not a requirement — you're free
        to ignore or change it, and it does not affect your grades or standing in any way.
      </p>

      <h2 className="text-xl font-semibold">5. Connected Google services</h2>
      <p>
        ClearPath may allow you to optionally connect Google Classroom and Google Calendar to
        import your courses, coursework, and events. By connecting these services, you authorize
        ClearPath to access the specific data covered by the permissions you approve. You can
        disconnect these integrations at any time from your account settings or directly from your
        Google Account permissions. See our{" "}
        <Link to="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>{" "}
        for details on how this data is used.
      </p>

      <h2 className="text-xl font-semibold">6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose or in violation of any applicable school policy.</li>
        <li>Attempt to disrupt, overload, or gain unauthorized access to the Service or other users' accounts or data.</li>
        <li>Use automated means (bots, scrapers) to access the Service without our permission.</li>
        <li>Misrepresent your identity or affiliation with any school.</li>
        <li>Use Lumin AI to generate content intended to deceive an instructor about its authorship.</li>
      </ul>

      <h2 className="text-xl font-semibold">7. AI-generated content is not guaranteed to be accurate</h2>
      <p>
        Lumin AI is an AI system and can make mistakes, including factual errors, incomplete
        explanations, or an unrealistic study plan. Lumin AI is a study aid, not a substitute for
        instruction from your teachers, and you should verify important information — and use your
        own judgment on any suggested plan — independently, especially before relying on it for
        graded work.
      </p>

      <h2 className="text-xl font-semibold">8. Intellectual property</h2>
      <p>
        The ClearPath name, logo, and design are the property of ClearPath. You retain ownership
        of the content you create within the Service (such as your tasks and notes). By using
        Lumin AI, you grant us the limited right to process your messages, tasks, and schedule
        data solely to provide the Service to you, as described in our Privacy Policy.
      </p>

      <h2 className="text-xl font-semibold">9. Availability and changes to the Service</h2>
      <p>
        ClearPath is provided on an "as is" and "as available" basis. We may modify, suspend, or
        discontinue any part of the Service at any time, and we will try to give reasonable notice
        of significant changes where practical.
      </p>

      <h2 className="text-xl font-semibold">10. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, ClearPath is not liable for any indirect,
        incidental, or consequential damages arising from your use of the Service, including any
        academic consequences resulting from your use of Lumin AI, its study planner, or reliance
        on AI-generated content.
      </p>

      <h2 className="text-xl font-semibold">11. Termination</h2>
      <p>
        You may stop using ClearPath and delete your account at any time. We may suspend or
        terminate accounts that violate these Terms, misuse the Service, or pose a security risk
        to other users.
      </p>

      <h2 className="text-xl font-semibold">12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If we make material changes, we will update
        the effective date above and, where appropriate, notify you directly.
      </p>

      <h2 className="text-xl font-semibold">13. Contact us</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href="mailto:lumin-support@luminclearpath.ca">lumin-support@luminclearpath.ca</a>.
      </p>
    </LegalLayout>
  );
}
