import { useEffect, useRef, useState } from "react";

import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { isInstalledApp } from "@/lib/native-app";
import luminMark from "@/assets/lumin-mark.png";

const SESSION_KEY = "clearpath:intro-seen";
const FADE_MS = 500;
// Safety net only -- normally the "ended" event moves things along.
const MAX_SOUND_WAIT_MS = 6500;
// How long before the chime actually ends the book should start opening --
// tuned by feel rather than tied to an exact beat timestamp in the audio.
const OPEN_LEAD_MS = 900;
const FOLD_TRANSITION_MS = 750;
const ZOOM_TRANSITION_MS = 550;
// The logo/text don't appear until the zoom-through is mostly finished, so
// they don't visibly pop in while the book is still rushing forward.
const LOGO_REVEAL_DELAY_MS = 420;
const AUDIO_SRC = "/audio/lumin-intro.mp3";

type Phase = "sound" | "opening" | "logo";

// The website's actual primary blue (--primary in styles.css) as a flat
// solid fill -- not a gradient fading toward pale cyan, which read as
// washed-out/white. The lighter accent (--accent) is used only for the
// thin page-divider line, matching how the site uses it as a secondary
// highlight color elsewhere.
const COVER_BLUE = "oklch(0.66 0.145 245)";
const DIVIDER_BLUE = "oklch(0.78 0.12 205)";
const PAGE_WHITE = "#F7FAFF";

// How far the cover swings once open -- past 90deg (edge-on) and on to
// nearly a full flip, so it visibly sweeps away to the left rather than
// stopping mid-turn. Negative because the hinge is on the LEFT edge (see
// below): a negative rotateY swings the cover's right edge away and over
// to the left, matching "opens from the right side of the screen to the
// left" rather than two symmetric doors opening outward from a center
// spine.
const OPEN_SWING_DEG = -178;

function releaseBootCover() {
  // Sets an attribute on <html> to hide the cover via CSS (styles.css)
  // rather than ever removing the div itself -- see the comment on
  // BOOT_COVER_SCRIPT in __root.tsx for why removing a React-rendered node
  // with a raw DOM API crashes hydration app-wide.
  document.documentElement.setAttribute("data-hide-boot-cover", "true");
}

/**
 * A single illustrated book: a static two-page spread (always drawn, never
 * itself animated) with one solid cover panel on top of it that's hinged
 * on its LEFT edge and swings open via a CSS rotateY -- exactly like
 * opening a real book resting spine-left, not two symmetric doors opening
 * away from a center spine. Closed, the cover exactly covers the spread
 * (so it reads as one plain solid closed book); as it swings away toward
 * the left, the pages underneath are revealed. Straight-edged rectangles
 * only, solid brand blue (not a gradient fading toward white), white pages
 * inset within, and a light-blue divider line/spine strip.
 */
function BookIllustration({ open, className }: { open: boolean; className?: string }) {
  return (
    <span className={className} style={{ perspective: "1400px" }}>
      <svg
        viewBox="0 0 400 260"
        className="h-full w-full"
        style={{
          transformStyle: "preserve-3d",
          filter: `drop-shadow(0 0 24px ${COVER_BLUE.replace(")", " / 0.5)")}) drop-shadow(0 18px 30px rgba(0,0,0,0.4))`,
        }}
        aria-hidden
      >
        {/* Static two-page spread -- always drawn in its "open" shape; the
            cover panel below is what actually animates. */}
        <rect x="32" y="38" width="168" height="184" fill={COVER_BLUE} />
        <rect x="200" y="38" width="168" height="184" fill={COVER_BLUE} />
        <rect x="56" y="54" width="120" height="152" fill={PAGE_WHITE} />
        <rect x="224" y="54" width="120" height="152" fill={PAGE_WHITE} />
        <line x1="200" y1="38" x2="200" y2="222" stroke={DIVIDER_BLUE} strokeWidth="5" />

        {/* Cover -- hinged on its left edge (matching the spine), swings
            open toward the left. Exactly covers the spread above when
            closed (rotateY 0deg), so the closed state reads as one plain
            solid book. */}
        <g
          style={{
            transformOrigin: "32px 130px",
            transformStyle: "preserve-3d",
            transform: `rotateY(${open ? OPEN_SWING_DEG : 0}deg)`,
            transition: `transform ${FOLD_TRANSITION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
          }}
        >
          <rect x="32" y="38" width="336" height="184" fill={COVER_BLUE} />
          <rect x="32" y="38" width="14" height="184" fill={DIVIDER_BLUE} />
        </g>
      </svg>
    </span>
  );
}
/**
 * Full-screen animated "Lumin AI" intro, shown only inside the installed
 * app (iOS/Android) -- never on the plain website. Sequence: a big
 * illustrated book sits closed under a pulsing glow while the chime plays,
 * folds open on a hinge animation timed to finish right around when the
 * chime ends, then the whole book scene rushes forward and fades out (a
 * brief flash sells "passing through" the pages) as the crisp real logo (at
 * its own normal size -- NOT scaled up to match the much bigger book) +
 * text cross-fades in on top a beat later, at which point the screen
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
  // in the DOM), play the chime, schedule the book-opening fold to finish
  // right around when the chime ends, and reveal the crisp final logo once
  // it actually does (or immediately, if sound is off/unavailable -- the
  // opening animation is an enhancement on top of the sound-synced
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
  const showLogoContent = phase === "logo";

  return (
    <div
      role="presentation"
      onClick={handleTap}
      className={`safe-top fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-[#0A1128] transition-opacity duration-500 ${
        showLogoContent ? "cursor-pointer" : "cursor-default"
      } ${dismissing ? "opacity-0" : "opacity-100"}`}
    >
      <audio ref={audioRef} src={AUDIO_SRC} preload="auto" />

      {/* Brief bright flash right as the book is "passed through", timed
          to the same moment the book scene below rushes forward -- sells
          the sense of emerging on the other side, just before the logo
          itself appears a beat later. */}
      {showLogoContent && (
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
          className="absolute inset-0 flex items-center justify-center transition-all ease-[cubic-bezier(0.55,0,1,0.45)]"
          style={{
            transitionDuration: `${ZOOM_TRANSITION_MS}ms`,
            opacity: showLogoContent ? 0 : 1,
            transform: showLogoContent ? "scale(2.6)" : "scale(1)",
            pointerEvents: showLogoContent ? "none" : undefined,
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

            <BookIllustration open={bookOpen} className="absolute inset-0 m-auto h-full w-full" />
          </span>
        </span>

        {/* Crisp final logo -- its own normal size, independent of the
            (much bigger) book scene above, and deliberately delayed so it
            doesn't appear until the zoom-through above is nearly done. */}
        {showLogoContent && (
          <span className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
            <img
              src={luminMark}
              alt="Lumin AI logo"
              className="animate-intro-in relative h-full w-full rounded-xl shadow-glow ring-1 ring-white/10"
              style={{ animationDelay: `${LOGO_REVEAL_DELAY_MS}ms`, animationFillMode: "both" }}
            />
          </span>
        )}
      </div>

      {showLogoContent && (
        <>
          <div
            className="animate-intro-text-in text-center"
            style={{
              animationDelay: `${LOGO_REVEAL_DELAY_MS + 150}ms`,
              animationFillMode: "both",
            }}
          >
            <p className="font-display text-2xl font-semibold tracking-tight text-white">
              Lumin AI
            </p>
            <p className="mt-1 text-sm text-white/50">by ClearPath</p>
          </div>
          <p
            className="animate-intro-text-in absolute bottom-8 text-xs text-white/30"
            style={{
              animationDelay: `${LOGO_REVEAL_DELAY_MS + 600}ms`,
              animationFillMode: "both",
            }}
          >
            Tap to continue
          </p>
        </>
      )}
    </div>
  );
}
