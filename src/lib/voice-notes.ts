import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Agent, Buyer, Message } from "./db/schema";
import { applyProfilePatch } from "./buyers";
import { HttpError } from "./errors";
import { ProfilePatch } from "./profile";
import { describeChanges, pickFields, type ProfileChange } from "./profile-changes";
import { suggestProfileUpdates } from "./ai/voice-notes";

/** Saves a voice note with the AI's suggested profile changes. The profile itself is untouched. */
export async function createVoiceNote(agent: Agent, buyer: Buyer, transcript: string): Promise<{ id: string; changes: ProfileChange[] }> {
  const proposal = await suggestProfileUpdates(agent, buyer, transcript);
  const db = await getDb();
  const [note] = await db
    .insert(schema.voiceNotes)
    .values({ buyerId: buyer.id, transcript, proposal })
    .returning({ id: schema.voiceNotes.id });
  return { id: note.id, changes: describeChanges(buyer, proposal) };
}

/**
 * Applies the suggestions the agent ticked, once. The note and what was saved go into the
 * chat history so later conversations know about the showing.
 */
export async function confirmVoiceNote(buyer: Buyer, noteId: string, fields: string[]): Promise<{ buyer: Buyer; messages: Message[] }> {
  const db = await getDb();
  const [note] = await db
    .select()
    .from(schema.voiceNotes)
    .where(and(eq(schema.voiceNotes.id, noteId), eq(schema.voiceNotes.buyerId, buyer.id)))
    .limit(1);
  if (!note) throw new HttpError(404, "Voice note not found.");
  if (note.appliedAt) throw new HttpError(409, "This note was already saved to the profile.");

  const accepted = pickFields(ProfilePatch.parse(note.proposal), fields);
  const changes = describeChanges(buyer, accepted);
  // Claim the note first so a double tap can't apply it twice.
  const claimed = await db
    .update(schema.voiceNotes)
    .set({ appliedAt: new Date(), appliedFields: changes.map((c) => c.field) })
    .where(and(eq(schema.voiceNotes.id, note.id), isNull(schema.voiceNotes.appliedAt)))
    .returning({ id: schema.voiceNotes.id });
  if (!claimed.length) throw new HttpError(409, "This note was already saved to the profile.");

  const updated = changes.length ? (await applyProfilePatch(buyer, accepted)).buyer : buyer;
  const labels = [...new Set(changes.map((c) => c.label.toLowerCase()))];
  const outcome = labels.length ? `Saved from your voice note: ${labels.join(", ")}.` : "Kept your voice note. The profile didn't need changing.";
  const messages = await db
    .insert(schema.messages)
    .values([
      { buyerId: buyer.id, role: "user", content: `Voice note: ${note.transcript}` },
      // A later timestamp keeps the pair in order when the chat is loaded by time.
      { buyerId: buyer.id, role: "assistant", content: outcome, createdAt: new Date(Date.now() + 1) },
    ])
    .returning();
  return { buyer: updated, messages };
}
