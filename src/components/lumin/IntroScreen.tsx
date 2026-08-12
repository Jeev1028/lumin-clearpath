import { useEffect, useRef, useState } from "react";

import { LuminBookMark } from "@/components/lumin/LuminMark";
import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { isNativeApp } from "@/lib/native-app";

const SESSION_KEY = "clearpath:intro-seen";
const INTRO_DURATION_MS = 4500;
const FADE_MS = 500;
const AUDIO_SRC = "/audio/lumin-intro.mp3";

/**
 * Full-screen animated "Lumin AI" intro -- a brief branded moment (with
 * sound, where the platform's autoplay policy allows it) before the app
 * appears underneath.
 *
 * On the web, it shows once per browser session (so casual visitors
 * clicking between pages aren't repeatedly interrupted). Inside the
 * installed app (iOS or Android), it replays on every cold launch instead,
 * matching how a real app's splash/intro behaves -- this component only
 * re-mounts when the native shell's WebView does a true fresh load, since
 * in-app navigation afterward is all client-side routing.
 *
 * Skippable with a tap (which also retries audio playback, covering the
 * case where autoplay was blocked), and skipped entirely for anyone with
 * the reduced-motion accessibility preference on.
 */
export function IntroScreen() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { prefs } = useSoundSettings();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion = document.documentElement.getAttribute("data-reduced-motion") === "true";
    if (reducedMotion) return;

    if (!isNativeApp()) {
      let alreadySeen = false;
      try {
        alreadySeen = sessionStorage.getItem(SESSION_KEY) === "1";
      } catch {
        // ignore -- worst case the intro just shows again this load
      }
      if (alreadySeen) return;
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // ignore
      }
    }

    setVisible(true);
    if (prefs.enabled && prefs.introChime) {
      audioRef.current?.play().catch(() => {
        // Autoplay blocked by the platform -- the visual intro still plays
        // silently, and tapping anywhere will retry playback.
      });
    }

    const timer = window.setTimeout(dismiss, INTRO_DURATION_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    setDismissing(true);
    window.setTimeout(() => setVisible(false), FADE_MS);
  }

  function handleTap() {
    if (prefs.enabled && prefs.introChime) {
      void audioRef.current?.play().catch(() => {});
    }
    dismiss();
  }

  if (!visible) return null;

  return (
    <div
      role="presentation"
      onClick={handleTap}
      className={`safe-top fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center gap-4 bg-[#0A1128] transition-opacity duration-500 ${
        dismissing ? "opacity-0" : "opacity-100"
      }`}
    >
      <audio ref={audioRef} src={AUDIO_SRC} preload="auto" />
      <LuminBookMark className="animate-intro-in h-28 w-28 sm:h-32 sm:w-32" />
      <div
        className="animate-intro-text-in text-center"
        style={{ animationDelay: "0.5s", animationFillMode: "both" }}
      >
        <p className="font-display text-2xl font-semibold tracking-tight text-white">Lumin AI</p>
        <p className="mt-1 text-sm text-white/50">by ClearPath</p>
      </div>
      <p
        className="animate-intro-text-in absolute bottom-8 text-xs text-white/30"
        style={{ animationDelay: "1s", animationFillMode: "both" }}
      >
        Tap to continue
      </p>
    </div>
  );
}
