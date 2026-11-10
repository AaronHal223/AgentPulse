"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type Clip = { audio: string; mimeType: string };

const FORMATS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // In pieces, because one giant call overflows the argument limit on phones.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Records a short audio clip from the microphone, for phones that can't turn speech into
 * text themselves. Stops on its own after `maxSeconds`.
 */
export function useRecorder(maxSeconds: number, onClip: (clip: Clip) => void) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const deliver = useRef(onClip);
  deliver.current = onClip;

  const stop = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
    return stop;
  }, [stop]);

  const start = useCallback(async () => {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("The microphone is blocked. Allow it for AgentPulse in your browser settings, or type the note.");
      return;
    }
    const mimeType = FORMATS.find((f) => MediaRecorder.isTypeSupported(f));
    const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const blob = new Blob(chunks, { type: rec.mimeType });
      if (!blob.size) return setError("Nothing was recorded. Try again.");
      deliver.current({ audio: toBase64(new Uint8Array(await blob.arrayBuffer())), mimeType: rec.mimeType });
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setRecording(true);
    ticker.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= maxSeconds) stop();
        return s + 1;
      });
    }, 1000);
  }, [maxSeconds, stop]);

  return { supported, recording, seconds, error, start, stop };
}
