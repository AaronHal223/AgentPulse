import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { requireAgent } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { clientPulses } from "@/lib/pulse-data";
import { ClientList } from "@/components/ClientList";

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
  const pulses = new Map((await clientPulses(agent.id)).map((p) => [p.buyer.id, p.pulse]));

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
        <ClientList rows={rows.map((r) => ({ ...r, pulse: pulses.get(r.buyer.id) ?? null }))} />
      )}
    </div>
  );
}
