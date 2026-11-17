"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import type { Welcome } from "@/lib/welcome";
import { api } from "./fetcher";

/** Getting-started steps for a new agent. Steps tick themselves off; the card can be closed. */
export function WelcomeChecklist({ welcome, firstName }: { welcome: Welcome; firstName: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (hidden) return null;

  const done = welcome.steps.filter((s) => s.done).length;

  async function close() {
    setHidden(true);
    await api("/api/account/welcome", { method: "POST" }).catch(() => {});
  }

  async function trySample() {
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: string }>("/api/sample", { method: "POST" });
      router.push(`/buyers/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the sample client. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section className="card border-brand/40 p-5" aria-label="Getting started">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold">Welcome, {firstName}. Here&apos;s how to get going.</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {done} of {welcome.steps.length} done. Each step takes a minute or two.
          </p>
        </div>
        <button onClick={close} className="text-muted hover:text-ink" aria-label="Hide getting started">
          <X size={18} />
        </button>
      </div>

      <ol className="mt-4 space-y-1">
        {welcome.steps.map((step, i) => (
          <li key={step.key}>
            <Link href={step.href} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-paper/70">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.done ? "bg-brand text-white" : "border border-line text-ink-soft"}`}>
                {step.done ? <Check size={13} /> : i + 1}
              </span>
              <span className="min-w-0 text-sm">
                <span className={`block font-semibold ${step.done ? "text-muted line-through" : ""}`}>{step.label}</span>
                {!step.done && <span className="block text-ink-soft">{step.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {!welcome.hasSample && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <p className="min-w-0 flex-1 text-sm text-ink-soft">Not ready to add a real client? Practice on a made-up one first.</p>
          <button onClick={trySample} disabled={busy} className="btn-ghost">{busy ? "Setting up…" : "Try a sample client"}</button>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
    </section>
  );
}
