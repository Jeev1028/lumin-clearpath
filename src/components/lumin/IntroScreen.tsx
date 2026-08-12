import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";

import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { isInstalledApp } from "@/lib/native-app";
import luminMark from "@/assets/lumin-mark.png";

const SESSION_KEY = "clearpath:intro-seen";
// Temporary: lets the two book-opening styles be compared live without a
// rebuild. Remove this + the toggle button once a final style is chosen.
const STYLE_KEY = "clearpath:intro-book-style";
const FADE_MS = 500;
// Safety net only -- normally the "ended" event moves things along.
const MAX_SOUND_WAIT_MS = 6500;
// How long before the chime actually ends the book should start opening --
// tuned by feel rather than tied to an exact beat timestamp in the audio.
const OPEN_LEAD_MS = 800;
const OPEN_TRANSITION_MS = 650;
const AUDIO_SRC = "/audio/lumin-intro.mp3";

type Phase = "sound" | "opening" | "logo";
type BookStyle = "flat" | "3d";

// Shared silhouette for both book flaps, as CSS clip-path percentages within
// their own box (the glow container). Left flap drawn as-is; right flap is
// its horizontal mirror (100% - x). The bottom vertex doubles as each
// flap's transform-origin, so rotating around it swings the flap's top
// while its bottom tip stays anchored -- like a page turning at the spine.
const LEFT_FLAP_CLIP = "polygon(19% 27.5%, 47% 40%, 50% 75%, 24% 64%)";
const RIGHT_FLAP_CLIP = "polygon(81% 27.5%, 53% 40%, 50% 75%, 76% 64%)";
const FLAP_ORIGIN = "50% 75%";

// How far each flap rotates when "closed" -- purely empirical, tuned to
// read as a plausible closed-book silhouette rather than derived from any
// specific point in the (deliberately asymmetric) flap shape. 3D needs a
// bigger angle than flat since rotateY's foreshortening makes the same
// angle look less "closed" than a flat 2D rotate() does.
const FLAT_CLOSED_DEG = 58;
const THREED_CLOSED_DEG = 105;

function releaseBootCover() {
  // Sets an attribute on <html> to hide the cover via CSS (styles.css)
  // rather than ever removing the div itself -- see the comment on
  // BOOT_COVER_SCRIPT in __root.tsx for why removing a React-rendered node
  // with a raw DOM API crashes hydration app-wide.
  document.documentElement.setAttribute("data-hide-boot-cover", "true");
}

/**
 * Full-screen animated "Lumin AI" intro, shown only inside the installed
 * app (iOS/Android) -- never on the plain website. Sequence: a stylized
 * closed book sits under a pulsing glow while the chime plays, opens on a
 * CSS-driven hinge animation timed to finish right around when the chime
 * ends, then cross-fades into the crisp real logo + text, at which point
 * the screen becomes tappable to continue.
 *
 * Uses sessionStorage the same way the web previously did, which turns out
 * to be exactly the right behavior for the app too: it naturally resets on
 * a true cold launch (new WebView process = fresh session storage) but
 * survives an in-app reload (e.g. pull-to-refresh) or simply backgrounding
 * and returning, so the intro only replays when the app actually restarts.
 *
 * Note this component's own "should it show" decision only runs after React
 * mounts -- which is *after* the server-rendered page (e.g. the sign-in
 * form) has already painted, so on its own this would flash that page for a
 * moment on every cold launch. __root.tsx's raw #native-boot-cover div
 * covers that gap (it's plain HTML, painted before any JS runs at all);
 * this component is responsible for releasing it the instant it's ready to
 * take over, on every code path below, not just the "show intro" one.
 */
export function IntroScreen() {
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<Phase>("sound");
  const [dismissing, setDismissing] = useState(false);
  const [bookStyle, setBookStyle] = useState<BookStyle>("flat");
  const [replayKey, setReplayKey] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { prefs } = useSoundSettings();

  // Step 1: decide whether the intro should show at all.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isInstalledApp()) {
      releaseBootCover(); // plain website -- never wanted a cover at all
      return;
    }

    const reducedMotion = document.documentElement.getAttribute("data-reduced-motion") === "true";
    if (reducedMotion) {
      releaseBootCover();
      return;
    }

    try {
      const savedStyle = localStorage.getItem(STYLE_KEY);
      if (savedStyle === "flat" || savedStyle === "3d") setBookStyle(savedStyle);
    } catch {
      // ignore -- default style is fine
    }

    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // ignore -- worst case the intro just shows again this load
    }
    if (alreadySeen) {
      releaseBootCover();
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }

    // This component's own overlay is about to render on this same update,
    // so handing off from the raw cover to it right here is seamless (both
    // are the same solid navy background).
    releaseBootCover();
    setVisible(true);
  }, []);

  // Preload the logo image as soon as the intro decides to show (during the
  // "sound" phase, well before it's needed) so it's already cached by the
  // time "logo" phase renders it -- otherwise the browser only starts
  // fetching it right as the <img> mounts, causing a blank flash first.
  useEffect(() => {
    if (!visible) return;
    const preloadImg = new Image();
    preloadImg.src = luminMark;
  }, [visible]);

  // Step 2: once actually visible (so the <audio> element genuinely exists
  // in the DOM), play the chime, schedule the book-opening animation to
  // finish right around when the chime ends, and reveal the crisp final
  // logo once it actually does (or immediately, if sound is off/unavailable
  // -- the opening animation is an enhancement on top of the sound-synced
  // experience, not something that needs its own no-sound fallback path).
  useEffect(() => {
    if (!visible) return;

    function showOpening() {
      setPhase((p) => (p === "sound" ? "opening" : p));
    }
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

    let openTimer: number | undefined;
    function scheduleOpening() {
      const duration = audio!.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const delayMs = Math.max(0, duration * 1000 - OPEN_LEAD_MS);
      openTimer = window.setTimeout(showOpening, delayMs);
    }

    if (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0) {
      scheduleOpening();
    } else {
      audio.addEventListener("loadedmetadata", scheduleOpening, { once: true });
    }

    audio.addEventListener("ended", showLogo);
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay blocked -- don't leave the user staring at a screen
      // waiting for sound that'll never come.
      showLogo();
    });
    const fallback = window.setTimeout(showLogo, MAX_SOUND_WAIT_MS);

    return () => {
      audio.removeEventListener("loadedmetadata", scheduleOpening);
      audio.removeEventListener("ended", showLogo);
      if (openTimer) window.clearTimeout(openTimer);
      window.clearTimeout(fallback);
    };
  }, [visible, prefs.enabled, prefs.introChime, replayKey]);

  function dismiss() {
    setDismissing(true);
    window.setTimeout(() => setVisible(false), FADE_MS);
  }

  function handleTap() {
    if (phase !== "logo") return; // not skippable before the reveal finishes
    dismiss();
  }

  // Temporary comparison tooling (see STYLE_KEY comment): swaps the
  // book-opening style and instantly replays the intro so the two can be
  // compared side by side without a rebuild or even a page reload.
  function handleStyleToggle(event: MouseEvent) {
    event.stopPropagation();
    const next: BookStyle = bookStyle === "flat" ? "3d" : "flat";
    setBookStyle(next);
    try {
      localStorage.setItem(STYLE_KEY, next);
    } catch {
      // ignore
    }
    setPhase("sound");
    setDismissing(false);
    setReplayKey((k) => k + 1);
  }

  if (!visible) return null;

  const bookOpen = phase !== "sound";
  const closedDeg = bookStyle === "3d" ? THREED_CLOSED_DEG : FLAT_CLOSED_DEG;
  function flapTransform(mirror: 1 | -1) {
    const angle = bookOpen ? 0 : closedDeg * mirror;
    return bookStyle === "3d" ? `rotateY(${angle}deg)` : `rotate(${angle}deg)`;
  }
  const flapStyleBase: CSSProperties = {
    transformOrigin: FLAP_ORIGIN,
    transition: `transform ${OPEN_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
    background:
      "linear-gradient(160deg, rgba(255,255,255,0.95) 0%, rgba(125,211,252,0.65) 55%, rgba(37,99,235,0.35) 100%)",
  };

  return (
    <div
      role="presentation"
      onClick={handleTap}
      className={`safe-top fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-[#0A1128] transition-opacity duration-500 ${
        phase === "logo" ? "cursor-pointer" : "cursor-default"
      } ${dismissing ? "opacity-0" : "opacity-100"}`}
    >
      <audio ref={audioRef} src={AUDIO_SRC} preload="auto" />

      <span
        aria-hidden
        className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32"
        style={{ perspective: bookStyle === "3d" ? "700px" : undefined }}
      >
        <span className="glow-orb animate-glow-pulse absolute inset-0 scale-150 rounded-full" />

        {/* Twinkling sparkles -- purely decorative, keeps the "waiting for
            the chime" moment from feeling static/dull. */}
        <span
          className="animate-intro-twinkle absolute top-[6%] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white"
          style={{ animationDelay: "0.2s" }}
        />
        <span
          className="animate-intro-twinkle absolute top-[16%] left-[32%] h-[3px] w-[3px] rounded-full bg-white"
          style={{ animationDelay: "1s" }}
        />
        <span
          className="animate-intro-twinkle absolute top-[12%] left-[66%] h-[3px] w-[3px] rounded-full bg-white"
          style={{ animationDelay: "1.7s" }}
        />

        {/* Animated book: visible through "sound"/"opening", fades out once
            the crisp real logo cross-fades in on top of it. */}
        <span
          aria-hidden
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: phase === "logo" ? 0 : 1,
            transformStyle: bookStyle === "3d" ? "preserve-3d" : undefined,
          }}
        >
          {/* Spine -- static, doesn't rotate with the flaps. */}
          <span className="absolute top-[45%] bottom-[25%] left-1/2 w-px -translate-x-1/2 bg-white/40" />
          <span
            className="absolute inset-0"
            style={{ ...flapStyleBase, clipPath: LEFT_FLAP_CLIP, transform: flapTransform(1) }}
          />
          <span
            className="absolute inset-0"
            style={{ ...flapStyleBase, clipPath: RIGHT_FLAP_CLIP, transform: flapTransform(-1) }}
          />
        </span>

        {phase === "logo" && (
          <img
            src={luminMark}
            alt="Lumin AI logo"
            className="animate-intro-in absolute inset-0 h-full w-full rounded-xl shadow-glow ring-1 ring-white/10"
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

      {/* Temporary: lets you compare both book-opening styles live -- see
          STYLE_KEY comment above. Remove once a final style is chosen. */}
      <button
        type="button"
        onClick={handleStyleToggle}
        className="absolute bottom-4 left-4 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-white/40"
      >
        Style: {bookStyle === "flat" ? "Flat" : "3D"} (tap to try{" "}
        {bookStyle === "flat" ? "3D" : "flat"})
      </button>
    </div>
  );
}
