import { useEffect, useState } from "react";

/**
 * iOS (both Mobile Safari and the Capacitor app's WKWebView) does not
 * shrink `100vh`/`h-screen`/`100dvh` when the on-screen keyboard appears --
 * the layout viewport stays full height and the keyboard just overlaps the
 * bottom of the page, hiding anything anchored there (like a chat composer)
 * behind it. This is especially visible on iPad, where the keyboard can
 * take up a large portion of the screen.
 *
 * The `visualViewport` API reports the *actual* visible height (excluding
 * the keyboard) and fires a `resize` event when the keyboard opens/closes,
 * so we track it here and hand back an explicit pixel height to apply
 * instead of a viewport unit. Returns `undefined` on browsers without
 * `visualViewport` support, so callers can fall back to a normal
 * `h-screen`/CSS height.
 */
export function useKeyboardSafeHeight(): number | undefined {
  const [height, setHeight] = useState<number | undefined>(() =>
    typeof window !== "undefined" ? window.visualViewport?.height : undefined,
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setHeight(vv.height);
      // Some browsers (notably Mobile Safari) also pan the layout viewport
      // down when a focused input is near the bottom of the screen, to
      // keep it visible above the keyboard -- even though our container
      // already shrinks to fit. Snapping scroll back to the top avoids
      // stacking that extra offset on top of our own resize.
      window.scrollTo(0, 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
