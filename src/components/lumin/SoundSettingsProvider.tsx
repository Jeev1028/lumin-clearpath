import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export type SoundPrefs = {
  /** Master switch -- off silences everything below. */
  enabled: boolean;
  /** The branded chime on the intro screen. */
  introChime: boolean;
  /** Lumin's chat replies get read aloud automatically as they arrive. */
  readMessagesAloud: boolean;
  /** Short chime when a new notification/reminder comes in. */
  notificationSound: boolean;
  /** Small UI click/success/error tones (tasks, flashcards, etc). */
  uiEffects: boolean;
  /** Preferred read-aloud voice, matched by SpeechSynthesisVoice.voiceURI.
   * `null` means "auto" -- always pick the best-sounding voice available in
   * the browser (see pickBestVoice below) rather than locking to one that
   * might not exist on every device. */
  voiceURI: string | null;
};

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  enabled: true,
  introChime: true,
  readMessagesAloud: false,
  notificationSound: true,
  uiEffects: true,
  voiceURI: null,
};

const STORAGE_KEY = "clearpath:sound-prefs";

function readLocalPrefs(): SoundPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOUND_PREFS;
    return { ...DEFAULT_SOUND_PREFS, ...(JSON.parse(raw) as Partial<SoundPrefs>) };
  } catch {
    return DEFAULT_SOUND_PREFS;
  }
}

function persistLocalPrefs(prefs: SoundPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore -- worst case the prefs just don't persist across sessions
  }
}

type ToneKind = "click" | "success" | "error" | "notify";

// Short synthesized tones (Web Audio oscillators) -- no audio assets to
// ship/maintain, and they're tiny/instant regardless of network.
const TONE_NOTES: Record<ToneKind, number[]> = {
  click: [660],
  success: [523, 659, 784],
  error: [220, 180],
  notify: [784, 988],
};

/**
 * Every browser ships its own set of free, unlimited (no API key, no quota)
 * speechSynthesis voices, but quality varies wildly -- the classic offenders
 * are the old local SAPI voices (e.g. "Microsoft David/Zira Desktop" on
 * Windows), which sound flat and robotic. Browsers also usually expose much
 * better-sounding voices for free: Chrome's network "Google ..." voices,
 * Edge's "... Online (Natural)" voices, and macOS/iOS's "Enhanced"/"Premium"
 * Siri voices. This scores the available voices so we can default to the
 * best-sounding one automatically instead of whatever the OS picks first.
 */
function scoreVoice(voice: SpeechSynthesisVoice, preferredLang: string): number {
  const name = voice.name.toLowerCase();
  const langMatches = voice.lang.toLowerCase().startsWith(preferredLang.toLowerCase().slice(0, 2));
  let score = 0;
  if (langMatches) score += 10;
  if (voice.lang.toLowerCase() === preferredLang.toLowerCase()) score += 5;
  if (name.includes("natural")) score += 60;
  if (name.includes("neural")) score += 55;
  if (name.includes("premium")) score += 45;
  if (name.includes("enhanced")) score += 40;
  if (name.includes("online")) score += 15;
  if (name.includes("google")) score += 30;
  // Older, robotic local SAPI voices -- deprioritize even if nothing else matches.
  if (name.includes("desktop")) score -= 15;
  if (/\b(david|zira|mark)\b/.test(name)) score -= 15;
  return score;
}

function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  preferredLang: string,
): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) return undefined;
  return [...voices].sort((a, b) => scoreVoice(b, preferredLang) - scoreVoice(a, preferredLang))[0];
}

/**
 * speechSynthesis reads raw text -- it has no idea what markdown is, and
 * (in most engines) only pauses on punctuation it recognizes as a clause or
 * sentence break. Lumin's replies are markdown and lean on em/en dashes for
 * asides ("this -- not that"), which most voices just glide straight
 * through since a bare dash isn't a pause cue. This strips the markdown
 * formatting down to plain words and swaps anything meant to read as a
 * pause (dashes, paragraph breaks, list items) for real sentence
 * punctuation the voice will actually pause on.
 */
function sanitizeForSpeech(raw: string): string {
  let text = raw;

  // Fenced/inline code -- read the content, drop the backticks/fences.
  text = text.replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*\n?/gi, ""));
  text = text.replace(/`([^`]+)`/g, "$1");

  // Images/links -- read the visible label, not the markup or URL.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Headings, blockquotes, horizontal rules, table pipes.
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^>\s?/gm, "");
  text = text.replace(/^\s*([-*_]\s*){3,}$/gm, "");
  text = text.replace(/\|/g, ", ");

  // Bold/italic emphasis markers (keep the wrapped text).
  text = text.replace(/(\*\*\*|___)(.*?)\1/g, "$2");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(?<![a-zA-Z0-9])(\*|_)(.*?)\1(?![a-zA-Z0-9])/g, "$2");

  // List markers -- drop the bullet/number, the item text still gets a
  // pause from the newline handling below.
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*\d+[.)]\s+/gm, "");

  // Dashes used as a spoken pause/aside -- em dash, en dash, or a
  // double-hyphen / spaced hyphen standing in for one -- become a comma,
  // which every voice actually pauses on. (Hyphens with no surrounding
  // space, like "well-known" or "10-20", are left alone -- those aren't
  // meant to be a pause.)
  text = text.replace(/\s*[–—]\s*/g, ", ");
  text = text.replace(/\s+--\s+/g, ", ");
  text = text.replace(/(\S)\s+-\s+(\S)/g, "$1, $2");

  // Paragraph/line breaks -> a firmer pause than a comma.
  text = text.replace(/\n{2,}/g, ". ");
  text = text.replace(/\n/g, ". ");

  // Clean up whitespace/punctuation left behind by the swaps above.
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/,(\s*,)+/g, ",");
  text = text.replace(/\.(\s*\.)+/g, ".");
  text = text.replace(/,\s*\./g, ".");
  text = text.replace(/:\s*\./g, ":");
  return text.trim();
}

type SpeakOptions = {
  /** Auto-read (triggered by a new message arriving) respects the
   * readMessagesAloud toggle; a manual tap-to-read only respects the
   * master enabled switch. */
  auto?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
};

type SoundSettingsContextValue = {
  prefs: SoundPrefs;
  setPrefs: (patch: Partial<SoundPrefs>) => void;
  playTone: (kind: ToneKind) => void;
  speak: (text: string, opts?: SpeakOptions) => void;
  stopSpeaking: () => void;
  /** All read-aloud voices the current browser offers, for a settings picker. */
  voices: SpeechSynthesisVoice[];
  /** The voiceURI that "Auto" currently resolves to, so the UI can label it. */
  recommendedVoiceURI: string | null;
};

const SoundSettingsContext = createContext<SoundSettingsContextValue | null>(null);

/** Safe no-op fallback so nothing crashes if ever rendered outside the
 * provider -- sound just silently doesn't play. */
const FALLBACK: SoundSettingsContextValue = {
  prefs: DEFAULT_SOUND_PREFS,
  setPrefs: () => {},
  playTone: () => {},
  speak: () => {},
  stopSpeaking: () => {},
  voices: [],
  recommendedVoiceURI: null,
};

export function useSoundSettings(): SoundSettingsContextValue {
  return useContext(SoundSettingsContext) ?? FALLBACK;
}

export function SoundSettingsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [prefs, setPrefsState] = useState<SoundPrefs>(DEFAULT_SOUND_PREFS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setPrefsState(readLocalPrefs());
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const raw = meta["sound_prefs"];
    let fromMeta: Partial<SoundPrefs> = {};
    if (typeof raw === "string") {
      try {
        fromMeta = JSON.parse(raw) as Partial<SoundPrefs>;
      } catch {
        // ignore malformed stored value
      }
    }
    const merged = { ...DEFAULT_SOUND_PREFS, ...readLocalPrefs(), ...fromMeta };
    setPrefsState(merged);
    persistLocalPrefs(merged);
  }, [loading, user]);

  // Voice lists load async (and can arrive late / change) in most browsers.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  // Browsers (WKWebView especially) block audio/speech until a genuine user
  // gesture happens. Warm up the AudioContext on the very first tap/keypress
  // anywhere so later sounds aren't silently dropped.
  useEffect(() => {
    function unlock() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx();
        void audioCtxRef.current?.resume();
      } catch {
        // ignore
      }
    }
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  function setPrefs(patch: Partial<SoundPrefs>) {
    setPrefsState((prev) => {
      const merged = { ...prev, ...patch };
      persistLocalPrefs(merged);
      if (user) {
        void supabase.auth.updateUser({ data: { sound_prefs: JSON.stringify(merged) } });
      }
      return merged;
    });
  }

  function playTone(kind: ToneKind) {
    if (!prefs.enabled) return;
    if (kind === "notify" ? !prefs.notificationSound : !prefs.uiEffects) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
      const ctx = audioCtxRef.current;
      void ctx.resume();
      const now = ctx.currentTime;
      TONE_NOTES[kind].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.09;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.18);
      });
    } catch {
      // ignore -- sound is a nice-to-have, never worth breaking the app over
    }
  }

  function speak(text: string, opts: SpeakOptions = {}) {
    if (!prefs.enabled) return;
    if (opts.auto && !prefs.readMessagesAloud) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const cleaned = sanitizeForSpeech(text);
    if (!cleaned) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(cleaned);
      const available = window.speechSynthesis.getVoices();
      const preferredLang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
      const chosen =
        (prefs.voiceURI && available.find((v) => v.voiceURI === prefs.voiceURI)) ||
        pickBestVoice(available, preferredLang);
      if (chosen) {
        utter.voice = chosen;
        utter.lang = chosen.lang;
      }
      utter.rate = 1;
      utter.onstart = () => opts.onStart?.();
      utter.onend = () => opts.onEnd?.();
      utter.onerror = () => opts.onEnd?.();
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore
    }
  }

  function stopSpeaking() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }

  const recommendedVoiceURI =
    pickBestVoice(voices, (typeof navigator !== "undefined" && navigator.language) || "en-US")
      ?.voiceURI ?? null;

  return (
    <SoundSettingsContext.Provider
      value={{ prefs, setPrefs, playTone, speak, stopSpeaking, voices, recommendedVoiceURI }}
    >
      {children}
    </SoundSettingsContext.Provider>
  );
}
