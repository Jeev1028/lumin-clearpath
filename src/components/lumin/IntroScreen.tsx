import { useEffect, useRef, useState } from "react";

import { useSoundSettings } from "@/components/lumin/SoundSettingsProvider";
import { isInstalledApp } from "@/lib/native-app";
import luminMark from "@/assets/lumin-mark.png";
import introBookClosed from "@/assets/intro-book-closed.webp";
import introBookOpen from "@/assets/intro-book-open.webp";

const SESSION_KEY = "clearpath:intro-seen";
const FADE_MS = 500;
// Safety net only -- normally the "ended" event moves things along.
const MAX_SOUND_WAIT_MS = 6500;
// How long before the chime actually ends the book should start opening --
// tuned by feel rather than tied to an exact beat timestamp in the audio.
const OPEN_LEAD_MS = 900;
// The closed-book photo genuinely flips open (real CSS 3D rotateY, not a
// flat crossfade) hinged near its actual spine (~23% in from the left edge
// of the image), rotating toward the viewer -- past 90deg so it fully
// disappears via backfaceVisibility rather than stopping mid-turn. A subtle
// brightness dip on the same timing sells it turning away from the light.
const FLIP_MS = 750;
const FLIP_DEG = 115;
const FLIP_HINGE_X = "23%";
// The open book sits behind the flipping cover the whole time (fixes an
// earlier bug where it was rendered on *top* of the cover, hiding the
// flip entirely) and is kept invisible at first, only fading in partway
// through the flip -- so the flip itself is unmistakably the first thing
// you see, and the pages arrive as a result of it, not simultaneously.
const OPEN_REVEAL_DELAY_MS = 320;
const OPEN_REVEAL_MS = 450;
const ZOOM_TRANSITION_MS = 550;
// The logo/text don't appear until the zoom-through is mostly finished, so
// they don't visibly pop in while the book is still rushing forward.
const LOGO_REVEAL_DELAY_MS = 420;
const AUDIO_SRC = "/audio/lumin-intro.mp3";

type Phase = "sound" | "opening" | "logo";

function releaseBootCover() {
  // Sets an attribute on <html> to hide the cover via CSS (styles.css)
  // rather than ever removing the div itself -- see the comment on
  // BOOT_COVER_SCRIPT in __root.tsx for why removing a React-rendered node
  // with a raw DOM API crashes hydration app-wide.
  document.documentElement.setAttribute("data-hide-boot-cover", "true");
}

/**
 * Full-screen animated "Lumin AI" intro, shown only inside the installed
 * app (iOS/Android) -- never on the plain website. Sequence: a big
 * illustrated closed-book photo sits under a pulsing glow while the chime
 * plays, then genuinely flips open (real CSS 3D rotation, hinged near its
 * spine -- backgrounds already removed from both images, see src/assets)
 * timed to finish right around when the chime ends, revealing the matching
 * open-book photo underneath. The whole book scene then rushes forward and
 * fades out (a brief flash sells "passing through" the pages) as the crisp
 * real logo (at its own size, independent of the book) + text cross-fades
 * in on top a beat later, at which point the screen becomes tappable to
 * continue.
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

  // Preload the logo + both book images as soon as the intro decides to
  // show (during the "sound" phase, well before each is needed) so they're
  // already cached by the time each phase renders them -- otherwise the
  // browser only starts fetching an image right as it first mounts,
  // causing a blank flash first.
  useEffect(() => {
    if (!visible) return;
    for (const src of [luminMark, introBookClosed, introBookOpen]) {
      const preloadImg = new Image();
      preloadImg.src = src;
    }
  }, [visible]);

  // Step 2: once actually visible (so the <audio> element genuinely exists
  // in the DOM), play the chime, schedule the book-opening flip to
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
          its own modest size. */}
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

            {/* Open book -- sits BEHIND the flipping cover (rendered
                first/below in DOM order -- swapping this was the actual
                fix for the earlier "flip happens behind image 2" bug: the
                later element in DOM order paints on top). Starts invisible
                and only fades in partway through the flip, once there's
                actually something for it to be revealing. */}
            <img
              src={introBookOpen}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-contain transition-opacity ease-out"
              style={{
                transitionDuration: `${OPEN_REVEAL_MS}ms`,
                transitionDelay: bookOpen ? `${OPEN_REVEAL_DELAY_MS}ms` : "0ms",
                opacity: bookOpen ? 1 : 0,
              }}
            />

            {/* Closed book -- the real cover, hinged near its actual spine
                and flipped open with a genuine 3D rotation (not a
                crossfade). Rendered last/on top so it visibly covers the
                open book while shut and visibly lifts away from in front
                of it, rather than the flip being hidden underneath
                anything. backfaceVisibility hidden matters here specifically
                because this is a photo with readable text -- without it,
                past 90deg you'd see the image mirrored/backwards instead of
                it just disappearing as it turns away. */}
            <span className="absolute inset-0" style={{ perspective: "1500px" }}>
              <img
                src={introBookClosed}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-contain transition-transform ease-[cubic-bezier(0.5,0,0.35,1)]"
                style={{
                  transitionDuration: `${FLIP_MS}ms`,
                  transformOrigin: `${FLIP_HINGE_X} 50%`,
                  transform: `rotateY(${bookOpen ? FLIP_DEG : 0}deg)`,
                  backfaceVisibility: "hidden",
                  filter: `brightness(${bookOpen ? 0.45 : 1})`,
                  transitionProperty: "transform, filter",
                }}
              />
            </span>
          </span>
        </span>

        {/* Crisp final logo -- sized independently of the book scene
            above (much bigger than the original reveal size), and
            deliberately delayed so it doesn't appear until the
            zoom-through above is nearly done. */}
        {showLogoContent && (
          <span className="relative flex h-44 w-44 items-center justify-center sm:h-60 sm:w-60">
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
