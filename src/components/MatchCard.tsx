"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Check, Copy, MapPinOff, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Match } from "@/lib/db/schema";
import type { RejectReason, Rescored } from "@/lib/scoring";
import { distanceText, factsLine, formatPrice } from "@/lib/format";
import { statusLabel } from "@/lib/listing-changes";
import { ScoreBadge } from "./ScoreBadge";
import { MatchActions } from "./MatchActions";
import { WhyScore } from "./WhyScore";
import { shareText } from "./share";
import { api } from "./fetcher";

type Props = {
  match: Match;
  buyerName?: string;
  /** Why it was rejected earlier, if it was. */
  rejectedFor?: string[];
  /** The client's reaction from their private page, if they left one. */
  clientReaction?: { verdict: string; note: string | null };
  /** Feedback on one home can move other homes' scores; the list updates them here. */
  onRescored?: (rescored: Rescored[]) => void;
  /** Tells the list what changed on this home (saved, rejected, sent) so its own copy stays current. */
  onUpdate?: (id: string, change: Partial<Match>) => void;
};

const message = (err: unknown) => (err instanceof Error ? err.message : "That didn't go through. Please try again.");

export function MatchCard({ match, buyerName, rejectedFor = [], clientReaction, onRescored, onUpdate }: Props) {
  const router = useRouter();
  const [status, setLocalStatus] = useState(match.status);
  const [sent, setSent] = useState(Boolean(match.sentAt));
  const [reasons, setReasons] = useState(rejectedFor);
  const [whyOpen, setWhyOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");

  function setStatus(next: string) {
    setLocalStatus(next);
    onUpdate?.(match.id, { status: next });
  }

  function applyRescored(rescored: Rescored[]) {
    if (onRescored) onRescored(rescored);
    else if (rescored.length) router.refresh();
  }

  async function setTo(next: "new" | "saved" | "dismissed", picked: RejectReason[] = []) {
    const before = { status, reasons };
    setStatus(next);
    setReasons(picked);
    setNotice("");
    try {
      const res = await api<{ rescored: Rescored[] }>(`/api/matches/${match.id}`, { method: "PATCH", body: { status: next, reasons: picked } });
      applyRescored(res.rescored);
    } catch (err) {
      setStatus(before.status);
      setReasons(before.reasons);
      setNotice(message(err));
    }
  }

  async function send() {
    setNotice("");
    const how = await shareText(`${match.blurb}\n${match.url}`);
    if (how === "cancelled") return;
    if (how === "failed") return setNotice("Couldn't open sharing on this device. Use the copy button on the blurb instead.");
    try {
      const res = await api<{ rescored: Rescored[] }>(`/api/matches/${match.id}/send`, { method: "POST" });
      setSent(true);
      setLocalStatus("saved");
      onUpdate?.(match.id, { status: "saved", sentAt: new Date() });
      applyRescored(res.rescored);
      if (how === "copied") setNotice("Copied. Paste it into a text or email to your client.");
    } catch (err) {
      setNotice(message(err));
    }
  }

  async function unsend() {
    setSent(false);
    try {
      await api(`/api/matches/${match.id}/send`, { method: "DELETE" });
      onUpdate?.(match.id, { sentAt: null });
    } catch (err) {
      setSent(true);
      setNotice(message(err));
    }
  }

  async function copyBlurb() {
    await navigator.clipboard.writeText(`${match.blurb}\n${match.url}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (status === "dismissed") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">
        <span className="truncate">
          Rejected{reasons.length ? ` (${reasons.join(", ")})` : ""}: {match.address || match.url}
        </span>
        <button onClick={() => setTo("new")} className="shrink-0 font-medium text-ink hover:underline">
          Undo
        </button>
      </div>
    );
  }

  const location = [match.city, match.state].filter(Boolean).join(", ");
  const distances = match.distances.filter((d) => d.minutes != null || d.miles != null);

  return (
    <article className="card overflow-hidden">
      <div className="flex gap-3 p-4 sm:gap-4 sm:p-5">
        <ScoreBadge score={match.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-serif text-lg font-semibold leading-snug">
              {match.address || "Listing"}
              {location && <span className="font-sans text-sm font-normal text-muted"> · {location}</span>}
            </h3>
            <span className="text-base font-bold">{formatPrice(match)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
            {factsLine(match) && <span>{factsLine(match)}</span>}
            <span className="text-muted">
              {match.listingType === "rent" ? "For rent" : "For sale"}
              {match.source ? ` · ${match.source}` : ""}
              {buyerName ? ` · for ${buyerName}` : ""}
            </span>
            {match.listingStatus !== "active" && (
              <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-semibold text-amber">{statusLabel(match.listingStatus)}</span>
            )}
          </div>

          {(distances.length > 0 || !match.inArea) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {distances.map((d) => (
                <span key={d.label} className="inline-flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-ink-soft">
                  <Car size={12} /> {distanceText(d)} to {d.label}
                </span>
              ))}
              {!match.inArea && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rust-soft px-2.5 py-1 text-xs font-medium text-rust">
                  <MapPinOff size={12} /> Outside target area
                </span>
              )}
            </div>
          )}

          {clientReaction && <ClientReactionNote {...clientReaction} />}

          <p className="mt-3 text-sm leading-relaxed text-ink-soft">{match.summary}</p>

          <div className="mt-3 rounded-lg bg-brand-soft/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-relaxed text-ink">“{match.blurb}”</p>
              <button onClick={copyBlurb} className="shrink-0 text-brand hover:text-ink" title="Copy blurb + link to send to your client" aria-label="Copy blurb and link">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {whyOpen && <WhyScore match={match} />}

          <MatchActions
            url={match.url}
            saved={status === "saved"}
            sent={sent}
            whyOpen={whyOpen}
            onToggleWhy={() => setWhyOpen((o) => !o)}
            onSave={() => setTo(status === "saved" ? "new" : "saved")}
            onSend={send}
            onUnsend={unsend}
            onReject={(picked) => setTo("dismissed", picked)}
          />
          {notice && <p className="mt-2 text-sm text-ink-soft" role="status">{notice}</p>}
        </div>
      </div>
    </article>
  );
}

function ClientReactionNote({ verdict, note }: { verdict: string; note: string | null }) {
  const liked = verdict === "liked";
  const Icon = liked ? ThumbsUp : ThumbsDown;
  return (
    <p className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${liked ? "bg-brand-soft text-brand" : "bg-rust-soft text-rust"}`}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>
        <span className="font-semibold">{liked ? "Your client likes this one." : "Your client passed on this one."}</span>
        {note && <span className="text-ink"> “{note}”</span>}
      </span>
    </p>
  );
}
