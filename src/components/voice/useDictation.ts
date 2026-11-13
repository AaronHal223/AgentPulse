"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// The browser speech API isn't in TypeScript's DOM types yet; this is the part we use.
type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const PROBLEMS: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it for AgentPulse in your browser settings.",
  "service-not-allowed": "Dictation isn't available in this browser.",
  "audio-capture": "No microphone was found.",
  network: "Dictation needs an internet connection.",
  "no-speech": "I didn't hear anything. Tap record and try again.",
};

/** Problems that mean dictation won't work here at all, so the caller should record audio instead. */
const BROKEN = new Set(["service-not-allowed", "language-not-supported"]);

/**
 * Live speech-to-text in the browser (free, nothing uploaded by us). `onText` gets each
 * finished phrase; `interim` is the phrase still being spoken.
 */
export function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const deliver = useRef(onText);
  deliver.current = onText;

  useEffect(() => {
    setSupported(recognitionClass() !== null);
    return () => recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognizer = recognitionClass();
    if (!Recognizer) return;
    const r = new Recognizer();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const phrase = e.results[i][0].transcript;
        if (e.results[i].isFinal) deliver.current(phrase.trim());
        else pending += phrase;
      }
      setInterim(pending);
    };
    r.onerror = (e) => {
      if (e.error === "aborted") return;
      setError(PROBLEMS[e.error] ?? "Dictation stopped unexpectedly. Try again, or type the note.");
      if (BROKEN.has(e.error)) setSupported(false);
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognition.current = r;
    setError("");
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Dictation couldn't start. Try again, or type the note.");
    }
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
