import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedBuyer } from "@/lib/buyers";
import { HttpError } from "@/lib/errors";
import { limit } from "@/lib/rate-limit";
import { aiHearsAudio } from "@/lib/ai/provider";
import { transcribeAudio } from "@/lib/ai/voice-notes";

export const maxDuration = 120;

// Two minutes of phone audio is well under 1 MB; this leaves room and still stops abuse.
const MAX_BASE64_CHARS = 6_000_000;

/** Phones name the same recording format in different ways; the AI wants one spelling. */
const MIME_TYPES: Record<string, string> = {
  "audio/webm": "audio/webm",
  "audio/ogg": "audio/ogg",
  "audio/mp4": "audio/m4a",
  "audio/m4a": "audio/m4a",
  "audio/x-m4a": "audio/m4a",
  "audio/aac": "audio/aac",
  "audio/mpeg": "audio/mpeg",
  "audio/wav": "audio/wav",
};

const Body = z.object({
  audio: z.string().min(1).max(MAX_BASE64_CHARS, "That recording is too long. Keep voice notes under two minutes.").regex(/^[A-Za-z0-9+/]+=*$/),
  mimeType: z.string().max(100),
});

/** Turns a recording into text, for phones whose browser can't do it on its own. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  await getOwnedBuyer(agent.id, (await params).id);
  limit([`voice:${agent.id}`], 30, 10);
  if (!aiHearsAudio()) throw new HttpError(422, "Recordings can't be transcribed right now. Type the note, or use your keyboard's microphone.");

  const body = Body.parse(await req.json());
  const mimeType = MIME_TYPES[body.mimeType.split(";")[0].trim().toLowerCase()];
  if (!mimeType) throw new HttpError(415, "That recording format isn't supported. Type the note instead.");

  const transcript = await transcribeAudio({ mimeType, base64: body.audio });
  if (!transcript) throw new HttpError(422, "I couldn't hear any words in that recording. Try again a little closer to the phone.");
  return NextResponse.json({ transcript });
});
