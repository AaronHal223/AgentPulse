/**
 * Showing-tour arithmetic: the driving order that wastes the least time, and a time slot for
 * each home. Plain functions over a drive-time table; no AI, no network.
 */

export const TOUR_MIN_STOPS = 2;
export const TOUR_MAX_STOPS = 6;

export type TourSlot = {
  /** Index of the stop in the list the caller passed in. */
  stop: number;
  arrive: string; // "10:30" on a 24-hour clock
  leave: string;
  driveMinutes: number; // from the previous stop; 0 for the first
};

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((first, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [first, ...rest]));
}

export const routeMinutes = (order: number[], minutes: number[][]) =>
  order.slice(1).reduce((total, stop, i) => total + minutes[order[i]][stop], 0);

/**
 * The visiting order with the least total driving. Up to six stops is at most 720 orders,
 * so every one is tried; ties keep the order the agent picked the homes in.
 */
export function bestOrder(minutes: number[][]): number[] {
  const stops = minutes.map((_, i) => i);
  let best = stops;
  let bestTotal = routeMinutes(stops, minutes);
  for (const order of permutations(stops)) {
    const total = routeMinutes(order, minutes);
    if (total < bestTotal) [best, bestTotal] = [order, total];
  }
  return best;
}

const toClock = (minutesIntoDay: number) => {
  const wrapped = ((minutesIntoDay % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
};

/** "14:05" → 845. Null for anything that isn't a time of day. */
export function parseClock(clock: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(clock.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const roundUpTo = (n: number, step: number) => Math.ceil(n / step) * step;

/**
 * Time slots for a tour. Each arrival is the previous departure plus the drive, rounded up to
 * the next five minutes so the times are ones an agent would actually tell a client.
 */
export function schedule(order: number[], minutes: number[][], opts: { startMinutes: number; visitMinutes: number }): TourSlot[] {
  const slots: TourSlot[] = [];
  let clock = opts.startMinutes;
  order.forEach((stop, i) => {
    const driveMinutes = i === 0 ? 0 : minutes[order[i - 1]][stop];
    const arrive = i === 0 ? clock : roundUpTo(clock + driveMinutes, 5);
    clock = arrive + opts.visitMinutes;
    slots.push({ stop, arrive: toClock(arrive), leave: toClock(clock), driveMinutes });
  });
  return slots;
}
