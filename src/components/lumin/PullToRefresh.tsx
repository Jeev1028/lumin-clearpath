import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { isInstalledApp } from "@/lib/native-app";

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
 * gesture. Reloads the whole app on release past the trigger distance,
 * which is the simplest reliable way to force a fresh load of everything
 * without wiring up per-page refetch logic across dozens of routes.
 *
 * Only active inside the installed app (iOS/Android), not on the regular
 * website -- a random web visitor overscrolling a long page shouldn't get
 * a surprise full reload.
 */
export function PullToRefresh() {
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
        window.location.reload();
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
  }, [enabled]);

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
