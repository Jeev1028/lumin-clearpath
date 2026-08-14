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
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
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
