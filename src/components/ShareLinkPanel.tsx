"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import type { Buyer } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";
import { shareText } from "./share";
import { api } from "./fetcher";

type LinkInfo = { url: string | null; expiresAt: string; lastViewedAt: string | null; viewCount: number };
type Res = { link: LinkInfo | null };

const message = (err: unknown) => (err instanceof Error ? err.message : "That didn't work. Please try again.");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Lets the agent make, copy and switch off a client's private page link. */
export function ShareLinkPanel({ buyer }: { buyer: Buyer }) {
  const first = buyer.name.split(" ")[0];
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Res>(`/api/buyers/${buyer.id}/share`)
      .then((res) => setLink(res.link))
      .catch((err) => setError(message(err)))
      .finally(() => setLoaded(true));
  }, [buyer.id]);

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    try {
      setLink((await api<Res>(`/api/buyers/${buyer.id}/share`, { method })).link);
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
  }

  function revoke() {
    if (confirm(`Switch off ${first}'s link? They won't be able to open their page until you make a new one.`)) call("DELETE");
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url).catch(() => setError("Couldn't copy. Press and hold the link to copy it."));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-brand" />
        <p className="text-sm font-semibold">{first}&apos;s private page</p>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        A link only {first} gets. It shows the homes you send them, and they can give each a thumbs-up or thumbs-down. No login.
      </p>

      {!loaded && <p className="mt-3 text-sm text-muted">Checking for a link…</p>}

      {loaded && !link && (
        <button onClick={() => call("POST")} disabled={busy} className="btn-brand mt-4 w-full sm:w-auto">
          {busy ? "Making the link…" : "Create private link"}
        </button>
      )}

      {link && (
        <div className="mt-4 space-y-3">
          {link.url ? (
            <div className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{link.url}</span>
              <button onClick={() => copy(link.url!)} className="shrink-0 text-brand hover:text-ink" aria-label="Copy link">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          ) : (
            <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber">The link still works, but it can&apos;t be shown again. Make a new one to copy it.</p>
          )}
          <p className="text-xs text-muted">
            Works until {day(link.expiresAt)} · {link.viewCount ? `opened ${link.viewCount} time${link.viewCount === 1 ? "" : "s"}, last ${timeAgo(link.lastViewedAt)}` : "not opened yet"}
          </p>
          <div className="flex flex-wrap gap-2">
            {link.url && (
              <button onClick={() => shareText(`Here are the homes I picked for you: ${link.url}`)} className="btn-brand !px-3 !py-1.5">
                <Share2 size={14} /> Send link
              </button>
            )}
            <button onClick={() => call("POST")} disabled={busy} className="btn-ghost !px-3 !py-1.5">New link</button>
            <button onClick={revoke} disabled={busy} className="btn-ghost !px-3 !py-1.5 hover:!border-rust hover:text-rust">Switch off</button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
    </div>
  );
}
