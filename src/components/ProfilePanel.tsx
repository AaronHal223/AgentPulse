"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import type { Buyer } from "@/lib/db/schema";
import { budgetLabel } from "@/lib/profile";
import { api } from "./fetcher";

function Chips({ items, tone = "paper" }: { items: string[]; tone?: "paper" | "brand" | "rust" }) {
  const cls = { paper: "bg-paper text-ink-soft", brand: "bg-brand-soft text-brand", rust: "bg-rust-soft text-rust" }[tone];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{i}</span>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}

export function ProfilePanel({ buyer, onChange }: { buyer: Buyer; onChange: (b: Buyer) => void }) {
  const [editing, setEditing] = useState(false);

  if (editing) return <ProfileEditor buyer={buyer} onDone={(b) => { if (b) onChange(b); setEditing(false); }} />;

  const facts = [
    buyer.bedsMin ? `${buyer.bedsMin}+ beds` : null,
    buyer.bathsMin ? `${buyer.bathsMin}+ baths` : null,
    buyer.sqftMin ? `${buyer.sqftMin.toLocaleString()}+ sqft` : null,
    ...buyer.propertyTypes,
  ].filter(Boolean) as string[];

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${buyer.intent === "rent" ? "bg-amber-soft text-amber" : "bg-brand-soft text-brand"}`}>
            {buyer.intent === "rent" ? "Renting" : "Buying"}
          </span>
          <p className="mt-2 font-serif text-xl font-semibold">{budgetLabel(buyer)}</p>
          {(buyer.email || buyer.phone) && (
            <p className="mt-0.5 text-sm text-muted">{[buyer.email, buyer.phone].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <button onClick={() => setEditing(true)} className="btn-ghost !px-3 !py-1.5">
          <Pencil size={14} /> Edit
        </button>
      </div>

      {buyer.aiSummary && <p className="mt-4 text-sm leading-relaxed text-ink-soft">{buyer.aiSummary}</p>}

      <div className="mt-5 space-y-4">
        {facts.length > 0 && <Row label="Home"><Chips items={facts} /></Row>}
        {buyer.areas.length > 0 && <Row label="Target areas"><Chips items={buyer.areas} /></Row>}
        {buyer.anchors.length > 0 && (
          <Row label={`Important places${buyer.maxDriveMinutes ? ` · max ${buyer.maxDriveMinutes} min drive` : ""}`}>
            <ul className="space-y-1">
              {buyer.anchors.map((a) => (
                <li key={a.label + a.address}>
                  <span className="font-semibold">{a.label}:</span> <span className="text-ink-soft">{a.address}</span>
                </li>
              ))}
            </ul>
          </Row>
        )}
        {buyer.mustHaves.length > 0 && <Row label="Must-haves"><Chips items={buyer.mustHaves} tone="brand" /></Row>}
        {buyer.niceToHaves.length > 0 && <Row label="Nice-to-haves"><Chips items={buyer.niceToHaves} /></Row>}
        {buyer.dealBreakers.length > 0 && <Row label="Deal-breakers"><Chips items={buyer.dealBreakers} tone="rust" /></Row>}
        {buyer.timeline && <Row label="Timeline">{buyer.timeline}</Row>}
        {buyer.notes && (
          <Row label="Notes">
            <p className="whitespace-pre-line text-ink-soft">{buyer.notes}</p>
          </Row>
        )}
        {!buyer.active && <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber">Paused — not included in daily searches.</p>}
      </div>
    </div>
  );
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const commas = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function ProfileEditor({ buyer, onDone }: { buyer: Buyer; onDone: (b?: Buyer) => void }) {
  const router = useRouter();
  const [anchors, setAnchors] = useState(buyer.anchors.length ? buyer.anchors : [{ label: "", address: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const n = (k: string) => (s(k) ? Number(s(k).replace(/[$,\s]/g, "")) : "");
    const body = {
      name: s("name"),
      email: s("email"),
      phone: s("phone"),
      intent: s("intent"),
      budgetMin: n("budgetMin"),
      budgetMax: n("budgetMax"),
      bedsMin: n("bedsMin"),
      bathsMin: n("bathsMin"),
      sqftMin: n("sqftMin"),
      maxDriveMinutes: n("maxDriveMinutes"),
      propertyTypes: commas(s("propertyTypes")),
      areas: commas(s("areas")),
      anchors: anchors.filter((a) => a.address.trim()).map((a) => ({ ...a, label: a.label.trim() || "Place" })),
      mustHaves: lines(s("mustHaves")),
      niceToHaves: lines(s("niceToHaves")),
      dealBreakers: lines(s("dealBreakers")),
      timeline: s("timeline"),
      notes: s("notes"),
      active: f.get("active") === "on",
    };
    // Empty numbers mean "clear it".
    const payload = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v === "" && !["name", "intent"].includes(k) ? null : v]));
    try {
      const res = await api<{ buyer: Buyer }>(`/api/buyers/${buyer.id}`, { method: "PATCH", body: payload });
      onDone(res.buyer);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${buyer.name} and all their homes? This can't be undone.`)) return;
    await api(`/api/buyers/${buyer.id}`, { method: "DELETE" });
    router.push("/buyers");
    router.refresh();
  }

  const field = (name: string, label: string, value: string | number | null | undefined, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label">{label}</label>
      <input name={name} defaultValue={value ?? ""} className="input" {...props} />
    </div>
  );
  const area = (name: string, label: string, value: string, hint?: string) => (
    <div>
      <label className="label">{label}{hint && <span className="ml-1 normal-case text-muted/70">{hint}</span>}</label>
      <textarea name={name} defaultValue={value} rows={3} className="input" />
    </div>
  );

  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <p className="font-serif text-lg font-semibold">Edit profile</p>
      {field("name", "Name", buyer.name, { required: true })}
      <div className="grid grid-cols-2 gap-3">
        {field("email", "Email", buyer.email)}
        {field("phone", "Phone", buyer.phone)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Looking to</label>
          <select name="intent" defaultValue={buyer.intent} className="input">
            <option value="buy">Buy</option>
            <option value="rent">Rent</option>
          </select>
        </div>
        {field("timeline", "Timeline", buyer.timeline)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field("budgetMin", "Budget from", buyer.budgetMin, { inputMode: "numeric" })}
        {field("budgetMax", "Budget up to", buyer.budgetMax, { inputMode: "numeric" })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {field("bedsMin", "Min beds", buyer.bedsMin, { inputMode: "decimal" })}
        {field("bathsMin", "Min baths", buyer.bathsMin, { inputMode: "decimal" })}
        {field("sqftMin", "Min sqft", buyer.sqftMin, { inputMode: "numeric" })}
      </div>
      {field("propertyTypes", "Property types (comma-separated)", buyer.propertyTypes.join(", "))}
      {field("areas", "Target areas (comma-separated)", buyer.areas.join(", "))}
      <div>
        <label className="label">Important places</label>
        <div className="space-y-2">
          {anchors.map((a, i) => (
            <div key={i} className="flex gap-2">
              <input value={a.label} onChange={(e) => setAnchors(anchors.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="input !w-28" placeholder="Work" />
              <input value={a.address} onChange={(e) => setAnchors(anchors.map((x, j) => (j === i ? { label: x.label, address: e.target.value } : x)))} className="input" placeholder="Address" />
              <button type="button" onClick={() => setAnchors(anchors.filter((_, j) => j !== i))} className="px-1 text-muted hover:text-rust" aria-label="Remove place">×</button>
            </div>
          ))}
          <button type="button" onClick={() => setAnchors([...anchors, { label: "", address: "" }])} className="text-sm font-semibold text-brand hover:underline">
            + Add place
          </button>
        </div>
      </div>
      {field("maxDriveMinutes", "Max drive to those places (minutes)", buyer.maxDriveMinutes, { inputMode: "numeric" })}
      {area("mustHaves", "Must-haves", buyer.mustHaves.join("\n"), "one per line")}
      {area("niceToHaves", "Nice-to-haves", buyer.niceToHaves.join("\n"), "one per line")}
      {area("dealBreakers", "Deal-breakers", buyer.dealBreakers.join("\n"), "one per line")}
      {area("notes", "Notes", buyer.notes ?? "")}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={buyer.active} className="h-4 w-4 accent-[#0f7a55]" />
        Include in daily searches
      </label>
      {error && <p className="rounded-lg bg-rust-soft px-3 py-2 text-sm text-rust">{error}</p>}
      <div className="flex items-center gap-2">
        <button disabled={busy} className="btn-primary">{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => onDone()} className="btn-ghost">Cancel</button>
        <button type="button" onClick={remove} className="ml-auto inline-flex items-center gap-1 text-sm text-muted hover:text-rust">
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </form>
  );
}
