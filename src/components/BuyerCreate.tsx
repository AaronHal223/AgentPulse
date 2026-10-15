"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Sparkles, UserPlus } from "lucide-react";
import { api } from "./fetcher";

type Tab = "import" | "manual";

export function BuyerCreate() {
  const [tab, setTab] = useState<Tab>("import");
  return (
    <div className="card overflow-hidden">
      <div className="flex border-b border-line">
        {(
          [
            ["import", "Import or paste", Sparkles],
            ["manual", "Add one by hand", UserPlus],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-semibold ${tab === key ? "border-b-2 border-ink text-ink" : "text-muted hover:text-ink"}`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      <div className="p-5 sm:p-6">{tab === "import" ? <ImportForm /> : <ManualForm />}</div>
    </div>
  );
}

function ImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; name: string }[]>([]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 190_000) {
      setError("That file is large — split it into smaller files (about 150 clients each).");
      return;
    }
    setFileName(file.name);
    setText(await file.text());
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ buyers: { id: string; name: string }[] }>("/api/import", { body: { material: text } });
      setCreated(res.buyers);
      setText("");
      setFileName("");
      if (res.buyers.length === 1) router.push(`/buyers/${res.buyers[0].id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Paste anything about your clients — a CSV export from your CRM or website, an email or text thread, intake-form answers, call notes, or a link to a client&apos;s profile page. AgentPulse figures out who each client is and what they want.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="input font-mono text-[13px]"
        placeholder={`e.g.\nThe Patels — Raj & Meera, 2 kids + a dog. Want to buy, $500–600k, 4 bed, Haddonfield or Collingswood. Raj works at Cooper University Hospital in Camden, wants under 25 min. Must have a yard. Moving by June.`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,text/*" className="hidden" onChange={onFile} />
        <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost">
          <FileUp size={15} /> {fileName || "Upload CSV / text file"}
        </button>
        <button onClick={submit} disabled={busy || text.trim().length < 3} className="btn-primary ml-auto">
          <Sparkles size={15} /> {busy ? "Reading and building profiles…" : "Build client profiles"}
        </button>
      </div>
      {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
      {created.length > 1 && (
        <div className="rounded-lg bg-brand-soft p-4 text-sm">
          <p className="font-semibold text-ink">Created {created.length} client profiles:</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {created.map((c) => (
              <li key={c.id}>
                <a href={`/buyers/${c.id}`} className="text-brand hover:underline">{c.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ManualForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const n = (k: string) => (s(k) ? Number(s(k).replace(/[$,\s]/g, "")) : undefined);
    const body = {
      name: s("name"),
      email: s("email") || undefined,
      phone: s("phone") || undefined,
      intent: s("intent"),
      budgetMin: n("budgetMin"),
      budgetMax: n("budgetMax"),
      bedsMin: n("bedsMin"),
      areas: s("areas") ? s("areas").split(",").map((x) => x.trim()).filter(Boolean) : undefined,
      anchors: s("anchorAddress") ? [{ label: s("anchorLabel") || "Work", address: s("anchorAddress") }] : undefined,
      notesToAppend: s("notes") || undefined,
    };
    try {
      const { buyer } = await api<{ buyer: { id: string } }>("/api/buyers", { body });
      router.push(`/buyers/${buyer.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Client name</label>
        <input name="name" required className="input" placeholder="Raj & Meera Patel" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" className="input" />
      </div>
      <div>
        <label className="label">Phone</label>
        <input name="phone" className="input" />
      </div>
      <div>
        <label className="label">Looking to</label>
        <select name="intent" className="input">
          <option value="buy">Buy</option>
          <option value="rent">Rent</option>
        </select>
      </div>
      <div>
        <label className="label">Min bedrooms</label>
        <input name="bedsMin" inputMode="decimal" className="input" placeholder="3" />
      </div>
      <div>
        <label className="label">Budget from</label>
        <input name="budgetMin" inputMode="numeric" className="input" placeholder="450,000" />
      </div>
      <div>
        <label className="label">Budget up to</label>
        <input name="budgetMax" inputMode="numeric" className="input" placeholder="600,000 (or monthly rent)" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Target areas (comma-separated)</label>
        <input name="areas" className="input" placeholder="Haddonfield NJ, Collingswood NJ, 08033" />
      </div>
      <div>
        <label className="label">Important place</label>
        <input name="anchorLabel" className="input" placeholder="Work" />
      </div>
      <div>
        <label className="label">Its address</label>
        <input name="anchorAddress" className="input" placeholder="1 Cooper Plaza, Camden, NJ" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Anything else</label>
        <textarea name="notes" rows={3} className="input" placeholder="Needs a fenced yard for the dog, hates busy roads…" />
      </div>
      {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Create profile"}</button>
        <span className="ml-3 text-sm text-muted">You can keep adding details by chatting on their page.</span>
      </div>
    </form>
  );
}
