import { BuyerCreate } from "@/components/BuyerCreate";
import { aiIsPrivate } from "@/lib/ai/provider";

export default function NewBuyerPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Add clients</h1>
        <p className="mt-1 text-ink-soft">Bring them in from wherever they live today. Profiles keep evolving as you tell AgentPulse more.</p>
      </div>
      {!aiIsPrivate() && (
        <p className="rounded-xl border border-amber/40 bg-amber-soft px-4 py-3 text-sm text-ink-soft">
          <strong>Test mode:</strong> AgentPulse is on a free AI plan whose provider may use what you send to improve its products. Use first names
          and leave out phone numbers, emails and anything private until the owner switches to a private plan.
        </p>
      )}
      <BuyerCreate />
    </div>
  );
}
