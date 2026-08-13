import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { isInstalledApp } from "@/lib/native-app";
import { REFRESH_EVENT } from "@/lib/refresh-events";

const PULL_TRIGGER_PX = 80;
const PULL_MAX_PX = 120;

/** Walks up from the touch target to find whichever element is actually
 * scrolling under it -- most pages just scroll the document, but a few
 * (like chat) have their own inner scroll container. */
function getScrollableAncestor(target: EventTarget | null): HTMLElement | null {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function currentScrollTop(container: HTMLElement | null): number {
  return container ? container.scrollTop : window.scrollY;
}

/**
 * Pull-down-to-refresh -- the standard mobile-app "reload this screen"
 * gesture. Re-fetches the current page's data on release past the trigger
 * distance, WITHOUT a hard `window.location.reload()`: a full browser-level
 * reload re-requests the page from the server, which briefly renders the
 * signed-out SSR shell before client-side auth re-hydrates (a visible
 * "flash" of the sign-in screen), fully resets in-memory app state, and --
 * inside some app-wrapper contexts (e.g. a home-screen web clip not in full
 * standalone mode) -- can make iOS drop out of "app" chrome and show
 * ordinary browser UI (URL bar, back button) instead.
 *
 * Most pages in this app fetch their own data with a plain `useEffect` in
 * the route component (not TanStack Router loaders, not React Query --
 * `router.invalidate()` alone has nothing to re-run for those), so getting
 * an actual refresh of on-screen data requires forcing those components to
 * remount: this dispatches a REFRESH_EVENT that the root layout listens
 * for to bump a `key` on <Outlet />, which unmounts and remounts the
 * current route's component tree, re-running every mount-time data fetch.
 * `router.invalidate()` and a React Query cache invalidation run too, for
 * the few places that do use loaders/useQuery (e.g. the chat page).
 *
 * Only active inside the installed app (iOS/Android), not on the regular
 * website -- a random web visitor overscrolling a long page shouldn't get
 * a surprise refresh.
 */
export function PullToRefresh() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [distance, setDistance] = useState(0);
  const [triggered, setTriggeredState] = useState(false);
  const startYRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    setEnabled(isInstalledApp());
  }, []);

  function setTriggered(value: boolean) {
    triggeredRef.current = value;
    setTriggeredState(value);
  }

  useEffect(() => {
    if (!enabled) return;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const container = getScrollableAncestor(e.target);
      if (currentScrollTop(container) > 0) return;
      containerRef.current = container;
      startYRef.current = e.touches[0]!.clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startYRef.current === null) return;
      const delta = e.touches[0]!.clientY - startYRef.current;
      if (delta <= 0 || currentScrollTop(containerRef.current) > 0) {
        startYRef.current = null;
        setPulling(false);
        setDistance(0);
        setTriggered(false);
        return;
      }
      setPulling(true);
      const clamped = Math.min(delta, PULL_MAX_PX);
      setDistance(clamped);
      setTriggered(clamped >= PULL_TRIGGER_PX);
    }

    function reset() {
      startYRef.current = null;
      containerRef.current = null;
      setPulling(false);
      setDistance(0);
      setTriggered(false);
    }

    function onTouchEnd() {
      if (triggeredRef.current) {
        reset();
        window.dispatchEvent(new Event(REFRESH_EVENT));
        void router.invalidate();
        void queryClient.invalidateQueries();
        return;
      }
      reset();
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, router, queryClient]);

  if (!enabled || !pulling) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-1/2 top-2 z-[300] -translate-x-1/2"
      style={{ transform: `translate(-50%, ${distance - 24}px)` }}
    >
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full border shadow-panel backdrop-blur-sm ${
          triggered
            ? "border-accent bg-card/95 text-accent"
            : "border-border/70 bg-card/90 text-muted-foreground"
        }`}
      >
        <RefreshCw
          className="h-4 w-4"
          style={{ transform: `rotate(${distance * 3}deg)` }}
        />
      </div>
    </div>
  );
}
