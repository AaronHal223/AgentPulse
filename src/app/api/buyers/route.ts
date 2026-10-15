import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { stripNulls } from "@/lib/buyers";
import { ProfilePatch, patchToUpdate } from "@/lib/profile";

export const POST = handler(async (req: Request) => {
  const agent = await apiAgent();
  const patch = ProfilePatch.parse(stripNulls(await req.json()));
  if (!patch.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const db = await getDb();
  const [buyer] = await db
    .insert(schema.buyers)
    .values({ ...patchToUpdate(null, patch), name: patch.name, agentId: agent.id })
    .returning();
  return NextResponse.json({ buyer });
});
