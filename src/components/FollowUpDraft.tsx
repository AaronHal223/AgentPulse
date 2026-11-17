"use client";
import { useState } from "react";
import { Check, Copy, MessageSquareText, Send } from "lucide-react";
import type { Buyer } from "@/lib/db/schema";
import { api } from "./fetcher";
import { shareText } from "./share";

type Channel = "text" | "email";
type Draft = { subject: string | null; body: string };

const CHANNELS: [Channel, string][] = [
  ["text", "Text"],
  ["email", "Email"],
];

/** Opens the phone's own Messages or Mail app with the draft filled in; the agent presses send there. */
function composerLink(channel: Channel, buyer: Buyer, draft: Draft): string | null {
  const body = encodeURIComponent(draft.body);
  if (channel === "email") return `mailto:${buyer.email ?? ""}?subject=${encodeURIComponent(draft.subject ?? "")}&body=${body}`;
  return buyer.phone ? `sms:${buyer.phone.replace(/[^\d+]/g, "")}?&body=${body}` : null;
}

/** AI-written follow-up about the newest matches. The agent edits it and sends it themselves. */
export function FollowUpDraft({ buyer }: { buyer: Buyer }) {
  const first = buyer.name.split(" ")[0];
  const [channel, setChannel] = useState<Channel>("text");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");

  async function write() {
    setBusy(true);
    setNotice("");
    try {
      setDraft(await api<Draft>(`/api/buyers/${buyer.id}/follow-up`, { body: { channel } }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't write a draft. Please try again.");
    }
    setBusy(false);
  }

  const fullText = (d: Draft) => (d.subject ? `${d.subject}\n\n${d.body}` : d.body);

  async function copy(d: Draft) {
    try {
      await navigator.clipboard.writeText(fullText(d));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice("Couldn't copy. Press and hold the text to copy it.");
    }
  }

  async function share(d: Draft) {
    if ((await shareText(fullText(d))) === "copied") setNotice("Copied. Paste it into a message to your client.");
  }

  function switchTo(next: Channel) {
    setChannel(next);
    setDraft(null);
    setNotice("");
  }

  const link = draft && composerLink(channel, buyer, draft);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <MessageSquareText size={16} className="text-brand" />
        <p className="text-sm font-semibold">Follow-up draft</p>
      </div>
      <p className="mt-2 text-sm text-ink-soft">A short message to {first} about their newest matches, in your voice. Nothing is sent until you send it yourself.</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-line p-0.5">
          {CHANNELS.map(([key, label]) => (
            <button key={key} onClick={() => switchTo(key)} aria-pressed={channel === key} className={`rounded-md px-3 py-1.5 text-sm font-medium ${channel === key ? "bg-ink text-white" : "text-ink-soft"}`}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={write} disabled={busy} className="btn-brand !px-3 !py-1.5">
          {busy ? "Writing…" : draft ? "Write another" : "Write a draft"}
        </button>
      </div>

      {draft && (
        <div className="mt-3 space-y-2">
          {draft.subject != null && (
            <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className="input font-semibold" aria-label="Subject" />
          )}
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={channel === "email" ? 9 : 5} className="input" aria-label="Message" />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => copy(draft)} className="btn-ghost !px-3 !py-1.5">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
            </button>
            {link ? (
              <a href={link} className="btn-primary !px-3 !py-1.5">
                <Send size={14} /> Open in {channel === "email" ? "Mail" : "Messages"}
              </a>
            ) : (
              <button onClick={() => share(draft)} className="btn-primary !px-3 !py-1.5">
                <Send size={14} /> Share…
              </button>
            )}
          </div>
        </div>
      )}
      {notice && <p className="mt-3 text-sm text-ink-soft" role="status">{notice}</p>}
    </div>
  );
}
