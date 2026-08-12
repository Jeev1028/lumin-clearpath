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
};

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  enabled: true,
  introChime: true,
  readMessagesAloud: false,
  notificationSound: true,
  uiEffects: true,
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
};

export function useSoundSettings(): SoundSettingsContextValue {
  return useContext(SoundSettingsContext) ?? FALLBACK;
}

export function SoundSettingsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [prefs, setPrefsState] = useState<SoundPrefs>(DEFAULT_SOUND_PREFS);
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

  return (
    <SoundSettingsContext.Provider value={{ prefs, setPrefs, playTone, speak, stopSpeaking }}>
      {children}
    </SoundSettingsContext.Provider>
  );
}
