import { useEffect, useRef, useState } from "react";

import { LuminBookMark } from "@/components/lumin/LuminMark";
import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { isNativeApp } from "@/lib/native-app";

const SESSION_KEY = "clearpath:intro-seen";
const FADE_MS = 500;
// Safety net only -- normally the "ended" event moves things along. This
const MAX_SOUND_WAIT_MS = 6500;
const AUDIO_SRC = "/audio/lumin-intro.mp3";

type Phase = "sound" | "logo";

/**
 * Full-screen animated "Lumin AI" intro. Sequence: the chime plays first
 * against a plain dark screen (no logo yet), and only once it finishes (or
 * fails/times out) does the logo animate in and become tappable to
 * continue -- tapping during the sound itself does nothing on purpose.
 *
 * Capacitor's native WKWebView config already disables iOS's "requires a
 * user gesture" media policy (mediaTypesRequiringUserActionForPlayback =
 * []), so autoplay works fine inside the installed app once the <audio>
 * element actually exists in the DOM -- the previous bug was calling
 * .play() in the same effect as the setState that mounts it, before React
 * had actually rendered it, so the ref was still null and nothing played.
 * On plain web, where autoplay may still be genuinely blocked, playback
 * failure just skips straight to the logo instead of stalling.
 *
 * On the web, it shows once per browser session (so casual visitors
 * clicking between pages aren't repeatedly interrupted). Inside the
 * installed app (iOS or Android), it replays on every cold launch instead,
 * matching how a real app's splash/intro behaves. Skipped entirely for
 * anyone with the reduced-motion accessibility preference on.
 */
export function IntroScreen() {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>("sound");
  const [dismissing, setDismissing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { prefs } = useSoundSettings();

  // Step 1: decide whether the intro should show at all.
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
  }, []);

  // Step 2: once actually visible (so the <audio> element genuinely exists
  // in the DOM), play the chime and wait for it to finish before revealing
  // the logo.
  useEffect(() => {
    if (!visible) return;

    function showLogo() {
      setPhase("logo");
    }

    if (!(prefs.enabled && prefs.introChime)) {
      showLogo();
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      showLogo();
      return;
    }

    audio.addEventListener("ended", showLogo);
    audio.play().catch(() => {
      // Autoplay blocked (can happen on plain web) -- don't leave the
      // user staring at a blank screen waiting for sound that'll never
      // come.
      showLogo();
    });
    const fallback = window.setTimeout(showLogo, MAX_SOUND_WAIT_MS);

    return () => {
      audio.removeEventListener("ended", showLogo);
      window.clearTimeout(fallback);
    };
  }, [visible, prefs.enabled, prefs.introChime]);

  function dismiss() {
    setDismissing(true);
    window.setTimeout(() => setVisible(false), FADE_MS);
  }

  function handleTap() {
    if (phase !== "logo") return; // not skippable during the sound itself
    dismiss();
  }

  if (!visible) return null;

  return (
    <div
      role="presentation"
      onClick={handleTap}
      className={`safe-top fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-[#0A1128] transition-opacity duration-500 ${
        phase === "logo" ? "cursor-pointer" : "cursor-default"
      } ${dismissing ? "opacity-0" : "opacity-100"}`}
    >
      <audio ref={audioRef} src={AUDIO_SRC} preload="auto" />
      {phase === "logo" && (
        <>
          <LuminBookMark className="animate-intro-in h-28 w-28 sm:h-32 sm:w-32" />
          <div
            className="animate-intro-text-in text-center"
            style={{ animationDelay: "0.15s", animationFillMode: "both" }}
          >
            <p className="font-display text-2xl font-semibold tracking-tight text-white">
              Lumin AI
            </p>
            <p className="mt-1 text-sm text-white/50">by ClearPath</p>
          </div>
          <p
            className="animate-intro-text-in absolute bottom-8 text-xs text-white/30"
            style={{ animationDelay: "0.6s", animationFillMode: "both" }}
          >
            Tap to continue
          </p>
        </>
      )}
    </div>
  );
}
