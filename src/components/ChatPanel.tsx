"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import type { Buyer, Message } from "@/lib/db/schema";
import { api } from "./fetcher";

type ChatMsg = Pick<Message, "id" | "role" | "content"> & { changed?: string[] };

const STARTERS = [
  "They just told me their budget went up to…",
  "After today's showing they said they hated…",
  "Where should they look if they want good schools and a short commute?",
];

export function ChatPanel({ buyer, initial, onBuyer }: { buyer: Buyer; initial: Message[]; onBuyer: (b: Buyer) => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [msgs, busy]);

  async function send(content: string) {
    const message = content.trim();
    if (!message || busy) return;
    setText("");
    setError("");
    setBusy(true);
    setMsgs((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: message }]);
    try {
      const res = await api<{ reply: Message; buyer: Buyer; changed: string[] }>(`/api/buyers/${buyer.id}/chat`, { body: { message } });
      setMsgs((m) => [...m, { ...res.reply, changed: res.changed }]);
      if (res.changed.length) onBuyer(res.buyer);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach AgentPulse");
    }
    setBusy(false);
  }

  return (
    <div className="card flex h-[32rem] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Sparkles size={16} className="text-brand" />
        <p className="text-sm font-semibold">Tell AgentPulse about {buyer.name.split(" ")[0]}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!msgs.length && (
          <div className="space-y-2">
            <p className="text-sm text-ink-soft">
              Share anything you learn — after a call, a showing, or a text. The profile updates itself.
            </p>
            {STARTERS.map((s) => (
              <button key={s} onClick={() => setText(s)} className="block w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-ink-soft hover:border-ink">
                {s}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-ink text-white" : "bg-paper text-ink"}`}>
              {m.content}
              {m.changed && m.changed.length > 0 && (
                <p className="mt-2 text-xs font-semibold text-brand">✓ Updated {m.changed.join(", ")}</p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="inline-flex gap-1 rounded-2xl bg-paper px-4 py-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        )}
        {error && <p className="text-sm text-rust">{error}</p>}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={2}
          placeholder="e.g. Meera's new job is at Rowan in Glassboro, so Washington Twp is now on the table"
          className="input resize-none"
        />
        <button disabled={busy || !text.trim()} className="btn-primary !h-10 !w-10 !p-0" aria-label="Send">
          <ArrowUp size={18} />
        </button>
      </form>
    </div>
  );
}
