/**
 * Calendar files (.ics) that Apple Calendar, Google Calendar and Outlook all open. Times are
 * written without a time zone, so they land at the same clock time on the agent's phone.
 */

export type CalendarEvent = { uid: string; title: string; start: Date; end: Date; location?: string; notes?: string };

const stamp = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapes text the way the calendar format requires. */
const text = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Long lines must be folded at 75 bytes, continuing with a space. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 75;
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 75) cut--;
    parts.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

export function toIcs(events: CalendarEvent[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AgentPulse//Showing tour//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@agentpulse`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(e.end)}`,
      `SUMMARY:${text(e.title)}`,
      ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
      ...(e.notes ? [`DESCRIPTION:${text(e.notes)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "2026-11-21" + "14:05" → that moment in the device's own time zone. */
export function atClock(day: string, clock: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = clock.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}
