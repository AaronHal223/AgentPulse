"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, KeyRound, Mail, Trash2 } from "lucide-react";
import { api } from "./fetcher";

type Open = "" | "password" | "email" | "delete";

const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong. Please try again.");

/** Settings card for the login itself: password, email, a copy of your data, deleting the account. */
export function AccountPanel({ email: initialEmail }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>("");
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const show = (next: Open) => {
    setOpen(open === next ? "" : next);
    setError("");
    setDone("");
  };

  async function submit(e: React.FormEvent<HTMLFormElement>, job: (fields: Record<string, string>) => Promise<string>) {
    e.preventDefault();
    const fields = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError("");
    try {
      setDone(await job(fields));
      setOpen("");
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
  }

  const changePassword = (f: Record<string, string>) =>
    api("/api/account/password", { body: { current: f.current, next: f.next } }).then(() => "Password changed. Other devices were logged out.");

  const changeEmail = async (f: Record<string, string>) => {
    const res = await api<{ email: string }>("/api/account/email", { body: { password: f.password, email: f.email } });
    setEmail(res.email);
    router.refresh();
    return "Email changed. Use the new one to log in.";
  };

  const deleteAccount = async (f: Record<string, string>) => {
    await api("/api/account", { method: "DELETE", body: { password: f.password } });
    window.location.href = "/";
    return "";
  };

  const row = "flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-paper/60";
  const form = "space-y-3 border-t border-line bg-paper/40 px-4 py-4";
  const problem = error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust" role="alert">{error}</p>;

  return (
    <section className="space-y-3">
      <h2 className="font-serif text-xl font-semibold">Your account</h2>
      {done && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-ink-soft" role="status">✓ {done}</p>}
      <div className="card divide-y divide-line overflow-hidden">
        <div>
          <button onClick={() => show("password")} className={row} aria-expanded={open === "password"}>
            <KeyRound size={16} className="text-brand" /> Change password
          </button>
          {open === "password" && (
            <form onSubmit={(e) => submit(e, changePassword)} className={form}>
              <div>
                <label className="label" htmlFor="current">Current password</label>
                <input id="current" name="current" type="password" required className="input" autoComplete="current-password" />
              </div>
              <div>
                <label className="label" htmlFor="next">New password</label>
                <input id="next" name="next" type="password" required minLength={10} className="input" autoComplete="new-password" />
                <p className="mt-1 text-xs text-muted">At least 10 characters.</p>
              </div>
              {problem}
              <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Change password"}</button>
            </form>
          )}
        </div>

        <div>
          <button onClick={() => show("email")} className={row} aria-expanded={open === "email"}>
            <Mail size={16} className="text-brand" />
            <span className="min-w-0 flex-1">
              Change login email <span className="block truncate font-normal text-muted">{email}</span>
            </span>
          </button>
          {open === "email" && (
            <form onSubmit={(e) => submit(e, changeEmail)} className={form}>
              <div>
                <label className="label" htmlFor="new-email">New email</label>
                <input id="new-email" name="email" type="email" required className="input" autoComplete="email" />
              </div>
              <div>
                <label className="label" htmlFor="email-password">Your password</label>
                <input id="email-password" name="password" type="password" required className="input" autoComplete="current-password" />
              </div>
              {problem}
              <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Change email"}</button>
            </form>
          )}
        </div>

        <a href="/api/account/export" download className={row}>
          <Download size={16} className="text-brand" />
          <span>
            Download my data <span className="block font-normal text-muted">Clients, homes, notes and chats in one file.</span>
          </span>
        </a>

        <div>
          <button onClick={() => show("delete")} className={`${row} text-rust`} aria-expanded={open === "delete"}>
            <Trash2 size={16} /> Delete my account
          </button>
          {open === "delete" && (
            <form onSubmit={(e) => submit(e, deleteAccount)} className={form}>
              <p className="text-sm text-ink-soft">
                This removes your account and every client, home, note and link, for good. It can&apos;t be undone. Download your data first if you want a copy.
              </p>
              <div>
                <label className="label" htmlFor="delete-password">Type your password to confirm</label>
                <input id="delete-password" name="password" type="password" required className="input" autoComplete="current-password" />
              </div>
              {problem}
              <button disabled={busy} className="rounded-lg bg-rust px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? "Deleting…" : "Delete everything"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
