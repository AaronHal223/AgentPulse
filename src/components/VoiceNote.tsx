"use client";
import { useState } from "react";
import { Check, Mic, Square } from "lucide-react";
import type { Buyer, Message } from "@/lib/db/schema";
import type { ProfileChange } from "@/lib/profile-changes";
import { api } from "./fetcher";
import { SuggestedChanges } from "./voice/SuggestedChanges";
import { useDictation } from "./voice/useDictation";
import { useRecorder, type Clip } from "./voice/useRecorder";

type Props = {
  buyer: Buyer;
  /** Whether the server's AI can transcribe a recording, for phones without built-in dictation. */
  canTranscribeAudio: boolean;
  onSaved: (buyer: Buyer, messages: Message[]) => void;
};

type Review = { noteId: string; changes: ProfileChange[] };

const MAX_SECONDS = 120;
const message = (err: unknown) => (err instanceof Error ? err.message : "That didn't work. Please try again.");
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Record (or type) a note after a showing; the AI suggests profile updates and the agent confirms them. */
export function VoiceNote({ buyer, canTranscribeAudio, onSaved }: Props) {
  const first = buyer.name.split(" ")[0];
  const [transcript, setTranscript] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const append = (text: string) => text && setTranscript((t) => (t.trim() ? `${t.trim()} ${text}` : text));
  const dictation = useDictation(append);
  const recorder = useRecorder(MAX_SECONDS, transcribe);

  // Built-in dictation is instant and free; recording is the fallback (iPhone home-screen apps, Firefox).
  const mic = dictation.supported ? dictation : recorder.supported && canTranscribeAudio ? recorder : null;
  const active = dictation.listening || recorder.recording;

  async function work<T>(label: string, job: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError("");
    try {
      return await job();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy("");
    }
  }

  async function transcribe(clip: Clip) {
    const res = await work("Writing down what you said…", () =>
      api<{ transcript: string }>(`/api/buyers/${buyer.id}/voice-notes/transcribe`, { body: clip }),
    );
    if (res) append(res.transcript);
  }

  async function findUpdates() {
    const res = await work("Reading your note…", () =>
      api<{ id: string; changes: ProfileChange[] }>(`/api/buyers/${buyer.id}/voice-notes`, { body: { transcript } }),
    );
    if (!res) return;
    setSaved("");
    setReview({ noteId: res.id, changes: res.changes });
    setPicked(new Set(res.changes.map((c) => c.field)));
  }

  async function confirm() {
    if (!review) return;
    const res = await work("Saving…", () =>
      api<{ buyer: Buyer; messages: Message[] }>(`/api/buyers/${buyer.id}/voice-notes/${review.noteId}/confirm`, { body: { fields: [...picked] } }),
    );
    if (!res) return;
    onSaved(res.buyer, res.messages);
    setSaved(picked.size ? `Saved to ${first}'s profile.` : "Note kept. The profile wasn't changed.");
    setReview(null);
    setTranscript("");
  }

  const toggle = (field: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(field)) next.add(field);
      return next;
    });

  const problem = error || dictation.error || recorder.error;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <Mic size={16} className="text-brand" />
        <p className="text-sm font-semibold">Voice note</p>
      </div>

      {review ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-lg bg-paper px-3 py-2 text-sm text-ink-soft">“{transcript}”</p>
          {review.changes.length ? (
            <>
              <p className="text-sm text-ink-soft">Suggested updates to {first}&apos;s profile. Untick anything that isn&apos;t right.</p>
              <SuggestedChanges changes={review.changes} picked={picked} onToggle={toggle} />
            </>
          ) : (
            <p className="text-sm text-ink-soft">Nothing in this note changes the profile. You can still keep it in the chat history.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={confirm} disabled={Boolean(busy)} className="btn-brand">
              <Check size={15} /> {busy || (picked.size ? `Save ${picked.size} update${picked.size === 1 ? "" : "s"}` : "Keep the note")}
            </button>
            <button onClick={() => setReview(null)} disabled={Boolean(busy)} className="btn-ghost">Back</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ink-soft">After a showing, say what {first} liked and didn&apos;t. You approve every change before it&apos;s saved.</p>
          {mic && (
            <button
              onClick={active ? mic.stop : mic.start}
              disabled={Boolean(busy)}
              className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60 ${active ? "bg-rust text-white" : "bg-brand-soft text-brand hover:bg-brand hover:text-white"}`}
            >
              {active ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}
              {active ? (recorder.recording ? `Stop · ${clock(recorder.seconds)} of ${clock(MAX_SECONDS)}` : "Stop") : transcript ? "Add more" : "Record a note"}
            </button>
          )}
          {dictation.listening && <p className="text-sm text-muted" aria-live="polite">{dictation.interim || "Listening…"}</p>}
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            maxLength={6000}
            className="input"
            placeholder={mic ? "Your words appear here. You can also type or fix them." : "Type the note here, or use your keyboard's microphone."}
          />
          <button onClick={findUpdates} disabled={Boolean(busy) || active || transcript.trim().length < 3} className="btn-primary w-full sm:w-auto">
            {busy || "Find profile updates"}
          </button>
          {saved && <p className="text-sm font-semibold text-brand" role="status">✓ {saved}</p>}
        </div>
      )}
      {problem && <p className="mt-3 rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust" role="alert">{problem}</p>}
    </div>
  );
}
