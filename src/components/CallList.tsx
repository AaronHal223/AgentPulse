import Link from "next/link";
import { Phone } from "lucide-react";
import type { ClientPulse } from "@/lib/pulse-data";
import type { CallReason } from "@/lib/pulse";
import { PulseMeter } from "./PulseMeter";

/** Dashboard list of clients worth a call today, with the reason for each. */
export function CallList({ clients }: { clients: (ClientPulse & { call: CallReason })[] }) {
  if (!clients.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-xl font-semibold">Who to call today</h2>
      <ul className="card divide-y divide-line">
        {clients.map(({ buyer, pulse, call }) => (
          <li key={buyer.id} className="flex items-center gap-3 px-4 py-3">
            <Link href={`/buyers/${buyer.id}`} className="min-w-0 flex-1 text-sm hover:underline">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="font-semibold">{buyer.name}</span>
                <PulseMeter pulse={pulse} />
              </span>
              <span className="mt-0.5 block text-ink-soft">{call.reason}</span>
            </Link>
            {buyer.phone && (
              <a href={`tel:${buyer.phone.replace(/[^\d+]/g, "")}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand hover:bg-brand hover:text-white" aria-label={`Call ${buyer.name}`}>
                <Phone size={16} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
