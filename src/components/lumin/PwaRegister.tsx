import { useEffect } from "react";

/** Registers the hand-written /sw.js service worker (public/sw.js). Only
 * runs client-side (SSR renders this as a no-op) and only in production --
 * a service worker caching dev's constantly-changing assets would just
 * cause confusing stale-content bugs while iterating. */
export function PwaRegister() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[pwa] service worker registration failed", err);
    });
  }, []);

  return null;
}
