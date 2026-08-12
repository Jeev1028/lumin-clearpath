import { useEffect, useRef, useState } from "react";

import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { isInstalledApp } from "@/lib/native-app";
import luminMark from "@/assets/lumin-mark.png";

const SESSION_KEY = "clearpath:intro-seen";
const FADE_MS = 500;
// Safety net only -- normally the "ended" event moves things along.
const MAX_SOUND_WAIT_MS = 6500;
const AUDIO_SRC = "/audio/lumin-intro.mp3";

type Phase = "sound" | "logo";

/**
 * Full-screen animated "Lumin AI" intro, shown only inside the installed
 * app (iOS/Android) -- never on the plain website. Sequence: the chime
 * plays first against a softly pulsing glow (not a blank screen), and once
 * it finishes (or fails/times out) the crisp logo + text reveal on top and
 * the screen becomes tappable to continue -- tapping during the sound
 * itself does nothing on purpose.
 *
 * Uses sessionStorage the same way the web previously did, which turns out
 * to be exactly the right behavior for the app too: it naturally resets on
 * a true cold launch (new WebView process = fresh session storage) but
 * survives an in-app reload (e.g. pull-to-refresh) or simply backgrounding
 * and returning, so the intro only replays when the app actually restarts.
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
    if (!isInstalledApp()) return; // never on the plain website

    const reducedMotion = document.documentElement.getAttribute("data-reduced-motion") === "true";
    if (reducedMotion) return;

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
      // Autoplay blocked -- don't leave the user staring at a screen
      // waiting for sound that'll never come.
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

      {/* Present throughout both phases so the sound-only moment still has
          something happening on screen -- a soft ambient pulse rather than
          the crisp icon, which only reveals once the chime finishes. */}
      <span aria-hidden className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
        <span className="glow-orb animate-glow-pulse absolute inset-0 scale-150 rounded-full" />
        {phase === "logo" && (
          <img
            src={luminMark}
            alt="Lumin AI logo"
            className="animate-intro-in relative h-full w-full rounded-xl shadow-glow ring-1 ring-white/10"
          />
        )}
      </span>

      {phase === "logo" && (
        <>
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
