"use client";
import { useState } from "react";
import { Mail } from "lucide-react";
import { api } from "./fetcher";

export function EmailBriefButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      const r = await api<{ sent: number; to: string }>("/api/brief/send", { method: "POST" });
      setMsg(r.sent ? `Sent ${r.sent} home${r.sent === 1 ? "" : "s"} to ${r.to}` : "Nothing new to send — every good match has already been emailed.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't send");
    }
    setBusy(false);
  }
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button onClick={send} disabled={busy} className="btn-ghost">
        <Mail size={15} /> {busy ? "Sending…" : "Email me the brief"}
      </button>
      {msg && <p className="max-w-xs text-xs text-muted sm:text-right">{msg}</p>}
    </div>
  );
}
