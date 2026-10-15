import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { requireAgent } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { BuyerWorkspace } from "@/components/BuyerWorkspace";

export default async function BuyerPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent();
  const { id } = await params;
  const db = await getDb();
  const [buyer] = await db
    .select()
    .from(schema.buyers)
    .where(and(eq(schema.buyers.id, id), eq(schema.buyers.agentId, agent.id)))
    .limit(1);
  if (!buyer) notFound();

  const [messages, matches] = await Promise.all([
    db.select().from(schema.messages).where(eq(schema.messages.buyerId, id)).orderBy(asc(schema.messages.createdAt)),
    db.select().from(schema.matches).where(eq(schema.matches.buyerId, id)).orderBy(desc(schema.matches.score)),
  ]);

  return (
    <div>
      <Link href="/buyers" className="text-sm text-muted hover:text-ink">← All clients</Link>
      <div className="mt-2">
        <BuyerWorkspace buyer={buyer} messages={messages.slice(-60)} matches={matches} />
      </div>
    </div>
  );
}
