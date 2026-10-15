"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "./fetcher";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(`/api/auth/${mode}`, { body });
      const next = params.get("next");
      router.push(next && next.startsWith("/") ? next : mode === "signup" ? "/buyers/new" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" && (
        <>
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" name="name" required className="input" autoComplete="name" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="brokerage">Brokerage <span className="normal-case text-muted/70">(optional)</span></label>
              <input id="brokerage" name="brokerage" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="marketArea">Your market <span className="normal-case text-muted/70">(optional)</span></label>
              <input id="marketArea" name="marketArea" className="input" placeholder="South Jersey" />
            </div>
          </div>
        </>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : 1}
          className="input"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </div>
      {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
      <button disabled={busy} className="btn-primary w-full !py-2.5">
        {busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"}
      </button>
      <p className="text-center text-sm text-muted">
        {mode === "signup" ? (
          <>Already have an account? <Link href="/login" className="font-semibold text-ink hover:underline">Log in</Link></>
        ) : (
          <>New to AgentPulse? <Link href="/signup" className="font-semibold text-ink hover:underline">Create an account</Link></>
        )}
      </p>
    </form>
  );
}
