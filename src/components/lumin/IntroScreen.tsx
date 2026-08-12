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
 * Autoplay is blocked on most platforms (WKWebView especially) until a
 * real tap happens, so the *first* tap is treated as "start the sound",
 * not "skip" -- otherwise the chime starts and immediately gets cut off
 * by the same tap dismissing the screen. Only a second tap (or letting
 * the timer run out) actually dismisses it. Skipped entirely for anyone
 * with the reduced-motion accessibility preference on.
 */
export function IntroScreen() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
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

    const wantsAudio = prefs.enabled && prefs.introChime;
    if (wantsAudio) {
      audioRef.current
        ?.play()
        .then(() => setAudioStarted(true))
        .catch(() => {
          // Autoplay blocked -- wait for the first tap to start it instead
          // (see handleTap) rather than silently giving up.
        });
    } else {
      setAudioStarted(true); // nothing to protect, a tap can dismiss right away
    }

    scheduleDismiss(INTRO_DURATION_MS);
    return () => {
      if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scheduleDismiss(delay: number) {
    if (dismissTimerRef.current) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(dismiss, delay);
  }

  function dismiss() {
    setDismissing(true);
    window.setTimeout(() => setVisible(false), FADE_MS);
  }

  function handleTap() {
    if (!audioStarted) {
      // First real user gesture -- this is what's actually allowed to
      // start audio on platforms that block autoplay. Let the chime play
      // out its full length instead of treating this tap as "skip".
      audioRef.current
        ?.play()
        .then(() => setAudioStarted(true))
        .catch(() => setAudioStarted(true)); // still blocked -- don't trap the user here
      scheduleDismiss(INTRO_DURATION_MS);
      return;
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
        {audioStarted ? "Tap to continue" : "Tap for sound"}
      </p>
    </div>
  );
}
