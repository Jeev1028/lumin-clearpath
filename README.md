# ClearPath — Lumin AI

**ClearPath** is an educational platform built around **Lumin AI**, a study assistant whose motto is *"To illuminate your educational journey"* (hence the name — ilLUMINate → Lumin). It's a full academic workspace, not just a chatbot: tasks, grades, a calendar, class organization, spaced-repetition flashcards, and an AI tutor that helps you *learn* the material instead of doing the work for you.

Live site: **[luminclearpath.ca](https://luminclearpath.ca)**

Built and maintained by **Jeevin**, a grade 10 student, as a passion project — a more honest, more capable alternative to tools like Google Classroom and ManageBac.

## What it does

- **Lumin AI chat** — an AI tutor with a strict academic-honesty policy: it will research, explain, summarize, and guide, but it will not write assignments, lab reports, or essays for you. It only ever answers in explanatory paragraph form, never in finished-deliverable form.
- **Tasks & grades** — track assignments and see grade trends over time.
- **Calendar** — a live calendar feed you can subscribe to from Apple Calendar, Outlook, Google Calendar, etc.
- **Classroom / Teacher Portal** — course organization for students and teachers.
- **Flashcard decks** — spaced-repetition study mode plus a matching game.
- **Knowledge Graph & Adaptive Learner** — Lumin AI maps out how concepts connect and adapts to what you personally need to review.
- **Notifications** — an in-app notification center, with optional sound effects and read-aloud support (fully toggleable in Settings).
- **Command palette** — quick keyboard-driven navigation, with keyboard and mouse support built in throughout.
- **Accounts** — email/password, or "Continue with Google."
- **Chrome extension** — Lumin AI in a browser popup, with quick actions to read the page you're on or get MLA citation guidance for whatever source you're looking at.

## Download the app

The website works in any browser, but native app shells are also available so it installs and behaves like a normal app (own icon, own window, offline-friendly shell, push-style updates).

| Platform | Where to get it | Notes |
| --- | --- | --- |
| **Android** | [Latest Android release](https://github.com/Jeev1028/lumin-clearpath/releases?q=android) — download `ClearPath.apk` | Sideload it directly: download the APK to your device and open it (you may need to allow "install from unknown sources" once). |
| **iOS / iPadOS** | [Latest iOS release](https://github.com/Jeev1028/lumin-clearpath/releases?q=ios) — download `ClearPath-unsigned.ipa` | The IPA is intentionally **unsigned** (no paid Apple Developer account is used). Sign and install it yourself with a free tool like [Sideloadly](https://sideloadly.io/) or [AltStore](https://altstore.io/), using your own free Apple ID. |
| **Chrome extension** | Not yet on the Chrome Web Store — build it yourself (see [`extension/README.md`](extension/README.md)) | `cd extension && npm install && npm run build`, then load the `extension/dist` folder as an unpacked extension via `chrome://extensions`. |

Both apps are thin native wrappers (Android [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity/), iOS [Capacitor](https://capacitorjs.com/)) that load the live site directly — they're not separate codebases with their own content.

## How updates work

This matters for knowing when you actually need to redownload something:

- **Everything you see and interact with day-to-day** (pages, the AI chat, flashcards, grades, styling, bug fixes, new features in the UI) lives on the website and **updates automatically** the moment it's deployed — for the browser *and* for both installed apps, since they just load the live site. You never need to reinstall for these changes.
- **Native-only changes** (app icon, splash screen, permissions, native sign-in plumbing, anything touching the Android/iOS project files themselves) require an actual new build. When that happens, a new APK/IPA is published to [Releases](https://github.com/Jeev1028/lumin-clearpath/releases) — redownload and reinstall from there to get it. Installing a new build over an old one is a normal update (same signing key each time), it won't wipe your account or data, since everything is stored server-side.

## Development

Requires Node.js and npm ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
git clone https://github.com/Jeev1028/lumin-clearpath.git
cd lumin-clearpath
npm install
npm run dev
```

You'll also need a `.env` file with Supabase and Google OAuth credentials — see `.env.example` if present, or ask for the relevant keys. The site is a [TanStack Start](https://tanstack.com/start) app (React 19) backed by [Supabase](https://supabase.com) (auth + database) and deployed on [Vercel](https://vercel.com).

Other useful scripts:

```sh
npm run build     # production build
npm run lint       # ESLint
npm run format     # Prettier
```

### Native app & extension projects

- `android/` — Android Trusted Web Activity project (built locally with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap); not built in CI).
- `ios/` — iOS Capacitor project (built automatically on every push via [GitHub Actions](.github/workflows/ios-build.yml), producing an unsigned IPA artifact).
- `extension/` — Chrome extension (Manifest V3); see `extension/README.md` for how to load it in Chrome. Not built in CI.

## Tech stack

TanStack Start · React 19 · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Realtime) · Vercel · Capacitor (iOS) · Bubblewrap/Trusted Web Activity (Android) · Chrome Extension Manifest V3 · Google Gemini (AI)
