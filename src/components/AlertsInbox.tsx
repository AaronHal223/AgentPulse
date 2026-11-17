"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, Bell, RotateCcw, Sparkles, Tag } from "lucide-react";
import type { AlertWithClient } from "@/lib/alerts";
import { timeAgo } from "@/lib/format";
import { api } from "./fetcher";

const LOOK = {
  price_drop: { icon: ArrowDownRight, tone: "bg-brand-soft text-brand" },
  back_on_market: { icon: RotateCcw, tone: "bg-brand-soft text-brand" },
  status_change: { icon: Tag, tone: "bg-amber-soft text-amber" },
  new_match: { icon: Sparkles, tone: "bg-brand-soft text-brand" },
} as const;

const lookOf = (kind: string) => LOOK[kind as keyof typeof LOOK] ?? { icon: Bell, tone: "bg-paper text-ink-soft" };

type Props = { initial: AlertWithClient[]; title?: string; moreHref?: string };

/** The agent's alerts. Opening one marks it read; used on the Alerts page and the dashboard. */
export function AlertsInbox({ initial, title, moreHref }: Props) {
  const router = useRouter();
  const [alerts, setAlerts] = useState(initial);
  const [error, setError] = useState("");
  const unread = alerts.filter((a) => !a.readAt).length;

  async function markRead(ids?: string[]) {
    const before = alerts;
    const now = new Date();
    setError("");
    setAlerts((list) => list.map((a) => (!ids || ids.includes(a.id) ? { ...a, readAt: a.readAt ?? now } : a)));
    try {
      await api("/api/alerts", { method: "PATCH", body: ids ? { ids } : {} });
      router.refresh(); // updates the unread count in the navigation
    } catch {
      setAlerts(before);
      setError("Couldn't mark those as read. Please try again.");
    }
  }

  if (!alerts.length) {
    if (title) return null;
    return (
      <div className="card px-6 py-12 text-center">
        <Bell className="mx-auto text-brand" size={26} />
        <p className="mt-3 font-serif text-xl font-semibold">No alerts yet</p>
        <p className="mt-2 text-sm text-ink-soft">Save homes for your clients. AgentPulse re-checks them every morning and tells you what changed.</p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {title ? <h2 className="font-serif text-xl font-semibold">{title}</h2> : <p className="text-sm text-muted">{unread ? `${unread} unread` : "All caught up"}</p>}
        <div className="flex items-center gap-4 text-sm font-semibold">
          {unread > 0 && (
            <button onClick={() => markRead()} className="text-brand hover:underline">
              Mark all read
            </button>
          )}
          {moreHref && <Link href={moreHref} className="text-brand hover:underline">All alerts →</Link>}
        </div>
      </div>
      {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
      <ul className="card divide-y divide-line">
        {alerts.map((a) => {
          const { icon: Icon, tone } = lookOf(a.kind);
          return (
            <li key={a.id}>
              <Link
                href={`/buyers/${a.buyerId}`}
                onClick={() => !a.readAt && markRead([a.id])}
                className="flex items-start gap-3 px-4 py-3 hover:bg-paper/60"
              >
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className={`block ${a.readAt ? "text-ink-soft" : "font-semibold text-ink"}`}>{a.title}</span>
                  <span className="block text-ink-soft">{a.body}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {a.buyerName} · {timeAgo(a.createdAt)}
                  </span>
                </span>
                {!a.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
