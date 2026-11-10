import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAgent } from "@/lib/auth";
import { handler } from "@/lib/api";
import { getOwnedBuyer } from "@/lib/buyers";
import { HttpError } from "@/lib/errors";
import { limit } from "@/lib/rate-limit";
import { parseClock, TOUR_MAX_STOPS } from "@/lib/tour";
import { planTour } from "@/lib/tours";

const Body = z.object({
  matchIds: z.array(z.string().max(64)).max(TOUR_MAX_STOPS, `A tour can have up to ${TOUR_MAX_STOPS} homes.`),
  startTime: z.string().max(5),
  visitMinutes: z.coerce.number().int().min(10).max(120),
});

/** Works out the best driving order and time slots for a showing tour. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const agent = await apiAgent();
  const buyer = await getOwnedBuyer(agent.id, (await params).id);
  limit([`tour:${agent.id}`], 20, 10);
  const body = Body.parse(await req.json());
  const startMinutes = parseClock(body.startTime);
  if (startMinutes == null) throw new HttpError(400, "Pick a start time for the tour.");
  return NextResponse.json(await planTour(buyer, body.matchIds, { startMinutes, visitMinutes: body.visitMinutes }));
});
