import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AccessibilityProvider } from "@/components/lumin/AccessibilityProvider";
import { CommandPalette } from "@/components/lumin/CommandPalette";
import { IntroScreen } from "@/components/lumin/IntroScreen";
import { NoticeBanner } from "@/components/lumin/NoticeBanner";
import { PullToRefresh } from "@/components/lumin/PullToRefresh";
import { SoundSettingsProvider } from "@/components/lumin/SoundSettingsProvider";
import { PwaRegister } from "@/components/lumin/PwaRegister";
import { TutorialProvider } from "@/components/lumin/WelcomeTutorial";
import { Toaster } from "@/components/ui/sonner";

// Inline (unminified is fine -- it's tiny) script that runs synchronously as
// soon as it's parsed, before React ever mounts. It exists purely to close
// the gap between the server-rendered HTML painting (e.g. the sign-in form)
// and IntroScreen's own effect getting a chance to run: without this, native
// app users would briefly see whatever page they landed on flash behind the
// intro. The matching #native-boot-cover div (rendered unconditionally,
// below, and ALWAYS visible by default) is what actually paints; this
// script only decides whether to hide it early.
//
// Deliberately hides it via a data-* attribute on <html> (CSS-driven, see
// styles.css) rather than ever removing/touching the div itself: that div
// is rendered by React, and reaching in with raw DOM APIs like .remove() on
// a node React still thinks it owns is a classic way to crash hydration --
// React expects to find that node exactly where it left it, and having it
// vanish out from under it broke client-side routing app-wide (every
// <Link> silently stopped intercepting clicks, falling back to full native
// navigations). Setting an attribute on <html> is the same safe pattern
// AccessibilityProvider already uses elsewhere in this file's tree.
const BOOT_COVER_SCRIPT = `
(function () {
  function hide() {
    document.documentElement.setAttribute("data-hide-boot-cover", "true");
  }
  try {
    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    var seen = false;
    try { seen = sessionStorage.getItem("clearpath:intro-seen") === "1"; } catch (e) {}
    if (!isNative || seen) hide();
  } catch (e) {
    hide();
  }
})();
`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Lumin AI — Illuminate your educational journey" },
      {
        name: "description",
        content:
          "Lumin AI is the ClearPath study companion that guides students with research, sources and summaries — never doing the work for them.",
      },
      { name: "author", content: "ClearPath" },
      { name: "theme-color", content: "#0A1128" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { property: "og:title", content: "Lumin AI — Illuminate your educational journey" },
      {
        property: "og:description",
        content: "An academically honest AI study guide from ClearPath.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "icon", href: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { rel: "icon", href: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon-180.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=Manrope:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Painted immediately from the server-rendered HTML, before React
            hydrates -- see the comment on BOOT_COVER_SCRIPT above. Same
            background color as IntroScreen's own overlay so the hand-off
            between this and the real intro is seamless. Visible by default
            (see styles.css) so it actually covers the very first paint;
            hidden via the data-hide-boot-cover attribute, never removed. */}
        <div
          id="native-boot-cover"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            backgroundColor: "#0A1128",
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: BOOT_COVER_SCRIPT }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <TutorialProvider>
        <SoundSettingsProvider>
          <a href="#main-content" className="skip-to-content">
            Skip to main content
          </a>
          <AccessibilityProvider />
          <PwaRegister />
          <IntroScreen />
          <PullToRefresh />
          <NoticeBanner />
          <CommandPalette />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster position="top-center" />
        </SoundSettingsProvider>
      </TutorialProvider>
    </QueryClientProvider>
  );
}
