"use client";
import { useState } from "react";
import { Car, ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react";
import type { SharedHome } from "@/lib/share-links";
import { distanceText, factsLine, formatPrice } from "@/lib/format";
import { api } from "./fetcher";

type Reaction = "liked" | "disliked" | null;

const NOTE_LIMIT = 500;

/** One home on a client's private page, with their thumbs-up / thumbs-down and a short note. */
export function SharedHomeCard({ home, token, agentName }: { home: SharedHome; token: string; agentName: string }) {
  const [reaction, setReaction] = useState<Reaction>(home.reaction);
  const [note, setNote] = useState(home.note ?? "");
  const [savedNote, setSavedNote] = useState(home.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(next: Reaction, text: string) {
    const before = reaction;
    setReaction(next);
    setBusy(true);
    setError("");
    try {
      await api(`/api/share/${token}/reactions`, { body: { matchId: home.id, reaction: next, note: next ? text : "" } });
      setSavedNote(next ? text : "");
      if (!next) setNote("");
    } catch (err) {
      setReaction(before);
      setError(err instanceof Error ? err.message : "That didn't save. Please try again.");
    }
    setBusy(false);
  }

  const location = [home.city, home.state].filter(Boolean).join(", ");
  const distances = home.distances.filter((d) => d.minutes != null || d.miles != null);
  const react = (r: Exclude<Reaction, null>) => save(reaction === r ? null : r, note.trim());
  const button = "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:opacity-60";

  return (
    <article className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-serif text-lg font-semibold leading-snug">
          {home.address || "Listing"}
          {location && <span className="font-sans text-sm font-normal text-muted"> · {location}</span>}
        </h2>
        <span className="text-base font-bold">{formatPrice(home)}</span>
      </div>
      {factsLine(home) && <p className="mt-0.5 text-sm text-ink-soft">{factsLine(home)}</p>}

      {distances.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {distances.map((d) => (
            <span key={d.label} className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink-soft">
              <Car size={12} /> {distanceText(d)} to {d.label}
            </span>
          ))}
        </div>
      )}

      {home.blurb && <p className="mt-3 rounded-lg bg-brand-soft/60 p-3 text-sm leading-relaxed text-ink">“{home.blurb}”</p>}
      {home.summary && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{home.summary}</p>}

      <a href={home.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
        <ExternalLink size={14} /> See the full listing{home.source ? ` on ${home.source}` : ""}
      </a>

      <div className="mt-4 flex gap-2">
        <button onClick={() => react("liked")} disabled={busy} aria-pressed={reaction === "liked"} className={`${button} ${reaction === "liked" ? "border-brand bg-brand text-white" : "border-line bg-card text-ink hover:border-brand"}`}>
          <ThumbsUp size={16} /> {reaction === "liked" ? "You like it" : "I like it"}
        </button>
        <button onClick={() => react("disliked")} disabled={busy} aria-pressed={reaction === "disliked"} className={`${button} ${reaction === "disliked" ? "border-rust bg-rust text-white" : "border-line bg-card text-ink hover:border-rust"}`}>
          <ThumbsDown size={16} /> {reaction === "disliked" ? "Not for you" : "Not for me"}
        </button>
      </div>

      {reaction && (
        <div className="mt-3">
          <label className="label" htmlFor={`note-${home.id}`}>Add a short note for {agentName} (optional)</label>
          <textarea
            id={`note-${home.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_LIMIT))}
            rows={2}
            className="input"
            placeholder={reaction === "liked" ? "What do you like about it?" : "What put you off?"}
          />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={() => save(reaction, note.trim())} disabled={busy || note.trim() === savedNote} className="btn-primary">
              {busy ? "Saving…" : "Send note"}
            </button>
            {savedNote && note.trim() === savedNote && <span className="text-sm text-brand">Sent to {agentName}</span>}
          </div>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust" role="alert">{error}</p>}
    </article>
  );
}
