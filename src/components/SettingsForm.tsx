"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./fetcher";

type Props = {
  agent: { name: string; email: string; brokerage: string; marketArea: string; tone: string; briefEmail: string; briefEnabled: boolean };
};

export function SettingsForm({ agent }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: {
          name: String(f.get("name")),
          brokerage: String(f.get("brokerage")),
          marketArea: String(f.get("marketArea")),
          tone: String(f.get("tone")),
          briefEmail: String(f.get("briefEmail")),
          briefEnabled: f.get("briefEnabled") === "on",
        },
      });
      setMsg("Saved.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't save");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="card space-y-5 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Your name</label>
          <input name="name" defaultValue={agent.name} required className="input" />
        </div>
        <div>
          <label className="label">Brokerage</label>
          <input name="brokerage" defaultValue={agent.brokerage} className="input" />
        </div>
        <div>
          <label className="label">Your market</label>
          <input name="marketArea" defaultValue={agent.marketArea} className="input" placeholder="South Jersey" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">How you write to clients</label>
          <textarea
            name="tone"
            defaultValue={agent.tone}
            rows={3}
            maxLength={600}
            className="input"
            placeholder="e.g. Friendly and brief, first names, no exclamation marks. I sign off “— Dana”."
          />
          <p className="mt-1 text-xs text-muted">Follow-up drafts are written in this voice. Paste a message you&apos;ve sent if that&apos;s easier.</p>
        </div>
      </div>
      <div className="border-t border-line pt-5">
        <p className="font-serif text-lg font-semibold">Daily brief</p>
        <p className="mt-1 text-sm text-ink-soft">
          Every morning AgentPulse searches for each active client and emails you the new homes that score 6 or higher and sit in their area. The same brief is always on your dashboard.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" name="briefEnabled" defaultChecked={agent.briefEnabled} className="h-4 w-4 accent-[#0f7a55]" />
          Email me the daily brief
        </label>
        <div className="mt-3">
          <label className="label">Send it to</label>
          <input name="briefEmail" type="email" defaultValue={agent.briefEmail} placeholder={agent.email} className="input" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save settings"}</button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </form>
  );
}
