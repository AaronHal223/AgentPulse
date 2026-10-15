import { BuyerCreate } from "@/components/BuyerCreate";

export default function NewBuyerPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Add clients</h1>
        <p className="mt-1 text-ink-soft">Bring them in from wherever they live today. Profiles keep evolving as you tell AgentPulse more.</p>
      </div>
      <BuyerCreate />
    </div>
  );
}
