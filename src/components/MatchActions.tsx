"use client";
import { useState } from "react";
import { Bookmark, BookmarkCheck, ExternalLink, Send, X } from "lucide-react";
import { REJECT_REASONS, type RejectReason } from "@/lib/scoring";

type Props = {
  url: string;
  saved: boolean;
  sent: boolean;
  whyOpen: boolean;
  onToggleWhy: () => void;
  onSave: () => void;
  onSend: () => void;
  onUnsend: () => void;
  onReject: (reasons: RejectReason[]) => void;
};

const pill = "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition";
const quiet = `${pill} border border-line bg-card text-ink hover:border-ink`;
const active = `${pill} bg-brand text-white`;

/** The button row under a home: view, why, save, send, reject. */
export function MatchActions(p: Props) {
  const [rejecting, setRejecting] = useState(false);

  if (rejecting) {
    return (
      <RejectReasons
        onCancel={() => setRejecting(false)}
        onConfirm={(reasons) => {
          setRejecting(false);
          p.onReject(reasons);
        }}
      />
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button onClick={p.onSave} className={p.saved ? active : quiet} aria-pressed={p.saved}>
        {p.saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
        {p.saved ? "Saved" : "Save"}
      </button>
      <button onClick={p.onSend} className={p.sent ? active : quiet}>
        <Send size={14} /> {p.sent ? "Sent" : "Send to client"}
      </button>
      <button onClick={() => setRejecting(true)} className={`${quiet} hover:!border-rust hover:text-rust`}>
        <X size={14} /> Reject
      </button>
      <a href={p.url} target="_blank" rel="noreferrer" className={quiet}>
        <ExternalLink size={14} /> View listing
      </a>
      <button onClick={p.onToggleWhy} className={quiet} aria-expanded={p.whyOpen}>
        {p.whyOpen ? "Hide details" : "Why this score"}
      </button>
      {p.sent && (
        <button onClick={p.onUnsend} className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
          Mark as not sent
        </button>
      )}
    </div>
  );
}

function RejectReasons({ onConfirm, onCancel }: { onConfirm: (reasons: RejectReason[]) => void; onCancel: () => void }) {
  const [picked, setPicked] = useState<RejectReason[]>([]);
  const toggle = (r: RejectReason) => setPicked((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  return (
    <div className="mt-4 rounded-lg bg-rust-soft/60 p-3">
      <p className="text-sm font-semibold text-ink">What put them off? <span className="font-normal text-ink-soft">Tap any that apply.</span></p>
      <div className="mt-2 flex flex-wrap gap-2">
        {REJECT_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => toggle(r)}
            aria-pressed={picked.includes(r)}
            className={`min-h-9 rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition ${picked.includes(r) ? "bg-rust text-white" : "border border-line bg-card text-ink-soft hover:border-rust"}`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => onConfirm(picked)} className={`${pill} bg-rust text-white hover:bg-ink`}>
          <X size={14} /> Reject home
        </button>
        <button onClick={onCancel} className={quiet}>Cancel</button>
      </div>
    </div>
  );
}
