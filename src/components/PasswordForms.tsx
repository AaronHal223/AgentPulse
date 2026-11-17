"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "./fetcher";

const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong. Please try again.");

/** "Forgot password": asks for the email and sends a reset link. */
export function ForgotForm() {
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/forgot", { body: { email } });
      setSentTo(email);
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-sm text-ink-soft">
        <p className="rounded-lg bg-brand-soft px-3 py-2">
          If <strong>{sentTo}</strong> has an account, a reset link is on its way. It works for one hour. Check your spam folder too.
        </p>
        <Link href="/login" className="btn-ghost w-full">Back to log in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
      <button disabled={busy} className="btn-primary w-full !py-2.5">{busy ? "Sending…" : "Email me a reset link"}</button>
      <p className="text-center text-sm text-muted">
        Remembered it? <Link href="/login" className="font-medium text-ink hover:underline">Log in</Link>
      </p>
    </form>
  );
}

/** Chooses a new password from an emailed link, then goes straight into the app. */
export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/reset", { body: { token, password } });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input id="password" name="password" type="password" required minLength={10} className="input" autoComplete="new-password" />
        <p className="mt-1 text-xs text-muted">At least 10 characters.</p>
      </div>
      {error && (
        <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust">
          {error} <Link href="/forgot" className="font-semibold underline">Get a new link</Link>
        </p>
      )}
      <button disabled={busy} className="btn-primary w-full !py-2.5">{busy ? "Saving…" : "Save and log in"}</button>
    </form>
  );
}
