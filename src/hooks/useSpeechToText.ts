import { useEffect, useRef, useState } from "react";

// The Web Speech API's types aren't in lib.dom.ts yet, and the constructor
// is still vendor-prefixed in the browsers that support it (Safari/WebKit,
// Chrome). Declared narrowly here rather than pulling in a whole ambient
// types package for a handful of members.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const isSpeechToTextSupported = Boolean(getSpeechRecognitionCtor());

type Options = {
  /** Called with the finalized transcript chunk each time one is recognized. */
  onFinalResult: (text: string) => void;
  /** Called with the current in-progress (not-yet-final) transcript, or "" when there isn't one. */
  onInterimResult?: (text: string) => void;
  onError?: (message: string) => void;
};

/**
 * Thin wrapper around the browser's native SpeechRecognition API for
 * voice-to-text dictation into the chat composer. Supported in Chrome/Edge
 * (desktop + Android) and Safari 14.5+ (macOS + iOS/iPadOS) -- feature-detect
 * with `isSpeechToTextSupported` before showing any UI for it.
 */
export function useSpeechToText({ onFinalResult, onInterimResult, onError }: Options) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callbacksRef = useRef({ onFinalResult, onInterimResult, onError });
  callbacksRef.current = { onFinalResult, onInterimResult, onError };

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  function start() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacksRef.current.onError?.("Voice input isn't supported in this browser.");
      return;
    }
    if (recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          callbacksRef.current.onFinalResult(transcript);
        } else {
          interim += transcript;
        }
      }
      callbacksRef.current.onInterimResult?.(interim);
    };

    recognition.onerror = (event) => {
      // "no-speech" / "aborted" fire routinely (e.g. the user just stopped
      // talking) -- not worth surfacing as an error.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        const message =
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Microphone access was denied. Check your browser/app permissions."
            : "Voice input stopped unexpectedly.";
        callbacksRef.current.onError?.(message);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      callbacksRef.current.onInterimResult?.("");
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function stop() {
    recognitionRef.current?.stop();
  }

  function toggle() {
    if (listening) stop();
    else start();
  }

  return { listening, start, stop, toggle };
}
