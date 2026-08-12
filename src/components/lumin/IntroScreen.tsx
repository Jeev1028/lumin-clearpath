import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { isInstalledApp } from "@/lib/native-app";
import luminMark from "@/assets/lumin-mark.png";

const SESSION_KEY = "clearpath:intro-seen";
const FADE_MS = 500;
// Safety net only -- normally the "ended" event moves things along.
const MAX_SOUND_WAIT_MS = 6500;
// How long before the chime actually ends the book should start opening --
// tuned by feel rather than tied to an exact beat timestamp in the audio.
const OPEN_LEAD_MS = 800;
const AUDIO_SRC = "/audio/lumin-intro.mp3";

type Phase = "sound" | "opening" | "logo";

const NAVY = "#0A1128";
const ACCENT = "#38BDF8";
const ACCENT_DEEP = "#1D4ED8";
const PAGE = "#F8FAFC";

function releaseBootCover() {
  // Sets an attribute on <html> to hide the cover via CSS (styles.css)
  // rather than ever removing the div itself -- see the comment on
  // BOOT_COVER_SCRIPT in __root.tsx for why removing a React-rendered node
  // with a raw DOM API crashes hydration app-wide.
  document.documentElement.setAttribute("data-hide-boot-cover", "true");
}

/** A closed hardcover book, viewed straight-on: thick cover, a visible
 * spine with a couple of ridge lines, and a small folded-corner page peek
 * at the top -- reads as an actual physical book, not an abstract shape. */
function ClosedBookIllustration({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 200 240" className={className} style={style} aria-hidden>
      <rect
        x="45"
        y="15"
        width="130"
        height="210"
        rx="12"
        fill={ACCENT}
        stroke={NAVY}
        strokeWidth="6"
      />
      <rect
        x="45"
        y="15"
        width="26"
        height="210"
        rx="12"
        fill={ACCENT_DEEP}
        stroke={NAVY}
        strokeWidth="6"
      />
      <line
        x1="52"
        y1="72"
        x2="65"
        y2="72"
        stroke={NAVY}
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="52"
        y1="122"
        x2="65"
        y2="122"
        stroke={NAVY}
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="52"
        y1="172"
        x2="65"
        y2="172"
        stroke={NAVY}
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="80"
        y1="19"
        x2="150"
        y2="19"
        stroke={NAVY}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M148,15 L178,15 L178,45 Z"
        fill={PAGE}
        stroke={NAVY}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A book spread wide open: two curved covers splayed left and right, with
 * lighter "pages" visible inset within each, and a spine crease down the
 * middle -- the classic open-book silhouette. */
function OpenBookIllustration({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 400 260" className={className} style={style} aria-hidden>
      <path
        d="M200,60 C150,15 70,10 30,45 L30,190 C70,225 150,228 200,195 Z"
        fill={ACCENT}
        stroke={NAVY}
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <path
        d="M200,60 C250,15 330,10 370,45 L370,190 C330,225 250,228 200,195 Z"
        fill={ACCENT}
        stroke={NAVY}
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <path
        d="M200,76 C162,44 104,40 50,65 L50,178 C104,201 162,204 200,180 Z"
        fill={PAGE}
        opacity="0.95"
      />
      <path
        d="M200,76 C238,44 296,40 350,65 L350,178 C296,201 238,204 200,180 Z"
        fill={PAGE}
        opacity="0.95"
      />
      <line x1="200" y1="62" x2="200" y2="192" stroke={NAVY} strokeWidth="3" opacity="0.3" />
    </svg>
  );
}

/**
 * Full-screen animated "Lumin AI" intro, shown only inside the installed
 * app (iOS/Android) -- never on the plain website. Sequence: a big
 * illustrated closed book sits under a pulsing glow while the chime plays,
 * cross-fades into a wide open-book illustration timed to finish right
 * around when the chime ends, then the whole book scene rushes forward and
 * fades out (a brief flash sells "passing through" the pages) as the crisp
 * real logo (at its own normal size -- NOT scaled up to match the much
 * bigger book) + text cross-fades in on top, at which point the screen
 * becomes tappable to continue.
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
  // in the DOM), play the chime, schedule the book-opening crossfade to
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
  }, [visible, prefs.enabled, prefs.introChime]);

  function dismiss() {
    setDismissing(true);
    window.setTimeout(() => setVisible(false), FADE_MS);
  }

  function handleTap() {
    if (phase !== "logo") return; // not skippable before the reveal finishes
    dismiss();
  }

  if (!visible) return null;

  const bookOpen = phase !== "sound";

  return (
    <div
      role="presentation"
      onClick={handleTap}
      className={`safe-top fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-[#0A1128] transition-opacity duration-500 ${
        phase === "logo" ? "cursor-pointer" : "cursor-default"
      } ${dismissing ? "opacity-0" : "opacity-100"}`}
    >
      <audio ref={audioRef} src={AUDIO_SRC} preload="auto" />

      {/* Brief bright flash right as the book is "passed through", timed
          to the same moment the book scene below rushes forward and the
          logo appears -- sells the sense of emerging on the other side. */}
      {phase === "logo" && (
        <span
          aria-hidden
          className="animate-intro-flash pointer-events-none absolute inset-0 bg-white"
        />
      )}

      {/* Shared crossfade area: the big book scene and the normal-size
          crisp logo occupy the same spot but are sized completely
          independently of each other -- the book is huge, the logo stays
          its original modest size. */}
      <div className="relative flex h-72 w-72 items-center justify-center sm:h-96 sm:w-96">
        {/* Big book scene -- visible through "sound"/"opening". At "logo"
            it rushes forward and fades out (scaling way up, not down) so
            it reads as the camera diving through the open pages, rather
            than the book simply shrinking away. */}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center transition-all duration-[550ms] ease-[cubic-bezier(0.55,0,1,0.45)]"
          style={{
            opacity: phase === "logo" ? 0 : 1,
            transform: phase === "logo" ? "scale(2.6)" : "scale(1)",
            pointerEvents: phase === "logo" ? "none" : undefined,
          }}
        >
          <span className="relative h-full w-full">
            <span className="glow-orb animate-glow-pulse absolute inset-0 scale-125 rounded-full" />

            {/* Twinkling sparkles -- purely decorative, keeps the "waiting
                for the chime" moment from feeling static/dull. */}
            <span
              className="animate-intro-twinkle absolute top-[10%] left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-white"
              style={{ animationDelay: "0.2s" }}
            />
            <span
              className="animate-intro-twinkle absolute top-[20%] left-[28%] h-1.5 w-1.5 rounded-full bg-white"
              style={{ animationDelay: "1s" }}
            />
            <span
              className="animate-intro-twinkle absolute top-[16%] left-[70%] h-1.5 w-1.5 rounded-full bg-white"
              style={{ animationDelay: "1.7s" }}
            />

            {/* Closed book: visible while waiting for the chime, fades and
                settles out as the open book crossfades in on top of it. */}
            <ClosedBookIllustration
              className="absolute inset-0 m-auto h-full w-full max-w-[62%] transition-all duration-500 ease-out"
              style={{
                opacity: bookOpen ? 0 : 1,
                transform: bookOpen ? "scale(0.9)" : "scale(1)",
              }}
            />

            {/* Open book: fades and grows in once the chime is about to
                finish, taking over from the closed book above. */}
            <OpenBookIllustration
              className="absolute inset-0 m-auto h-full w-full max-w-[85%] transition-all duration-500 ease-out"
              style={{
                opacity: bookOpen ? 1 : 0,
                transform: bookOpen ? "scale(1)" : "scale(0.85)",
              }}
            />
          </span>
        </span>

        {/* Crisp final logo -- its own normal size, independent of the
            (much bigger) book scene above. */}
        {phase === "logo" && (
          <span className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
            <img
              src={luminMark}
              alt="Lumin AI logo"
              className="animate-intro-in relative h-full w-full rounded-xl shadow-glow ring-1 ring-white/10"
            />
          </span>
        )}
      </div>

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
