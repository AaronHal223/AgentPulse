import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { MapPin, Plus } from "lucide-react";
import { requireAgent } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { budgetLabel } from "@/lib/profile";
import { timeAgo } from "@/lib/format";
import { ScoreBadge } from "@/components/ScoreBadge";

export default async function BuyersPage() {
  const agent = await requireAgent();
  const db = await getDb();
  const rows = await db
    .select({
      buyer: schema.buyers,
      matchCount: sql<number>`count(${schema.matches.id}) filter (where ${schema.matches.status} <> 'dismissed' and ${schema.matches.inArea})`.mapWith(Number),
      bestScore: sql<number | null>`max(${schema.matches.score}) filter (where ${schema.matches.status} <> 'dismissed' and ${schema.matches.inArea})`.mapWith((v) => (v == null ? null : Number(v))),
    })
    .from(schema.buyers)
    .leftJoin(schema.matches, eq(schema.matches.buyerId, schema.buyers.id))
    .where(eq(schema.buyers.agentId, agent.id))
    .groupBy(schema.buyers.id)
    .orderBy(desc(schema.buyers.active), desc(schema.buyers.updatedAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Clients</h1>
          <p className="mt-1 text-ink-soft">Every buyer and renter you&apos;re working with. Open one to chat, refine their profile and see homes.</p>
        </div>
        <Link href="/buyers/new" className="btn-primary">
          <Plus size={16} /> Add or import clients
        </Link>
      </div>

      {!rows.length ? (
        <div className="card px-6 py-14 text-center">
          <p className="font-serif text-xl font-semibold">No clients yet</p>
          <p className="mt-2 text-sm text-ink-soft">Import them from a spreadsheet, an email, or your notes.</p>
          <Link href="/buyers/new" className="btn-primary mt-5">Add clients</Link>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(({ buyer, matchCount, bestScore }) => (
            <Link key={buyer.id} href={`/buyers/${buyer.id}`} className={`card group flex gap-4 p-5 transition hover:border-ink ${buyer.active ? "" : "opacity-60"}`}>
              {bestScore ? (
                <ScoreBadge score={bestScore} />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-paper font-serif text-lg font-semibold text-ink-soft">
                  {buyer.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="truncate font-serif text-lg font-semibold group-hover:underline">{buyer.name}</h2>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${buyer.intent === "rent" ? "bg-amber-soft text-amber" : "bg-brand-soft text-brand"}`}>
                    {buyer.intent === "rent" ? "Renting" : "Buying"}
                  </span>
                </div>
                <p className="text-sm text-ink-soft">
                  {budgetLabel(buyer)}
                  {buyer.bedsMin ? ` · ${buyer.bedsMin}+ bd` : ""}
                </p>
                {buyer.areas.length > 0 && (
                  <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted">
                    <MapPin size={13} className="shrink-0" /> {buyer.areas.join(", ")}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted">
                  {matchCount} home{matchCount === 1 ? "" : "s"} · searched {timeAgo(buyer.lastSearchedAt)}
                  {!buyer.active && " · paused"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
