import { requireAgent } from "@/lib/auth";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const agent = await requireAgent();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Settings</h1>
        <p className="mt-1 text-ink-soft">Your details and how the daily brief reaches you.</p>
      </div>
      <SettingsForm
        agent={{
          name: agent.name,
          email: agent.email,
          brokerage: agent.brokerage ?? "",
          marketArea: agent.marketArea ?? "",
          briefEmail: agent.briefEmail ?? "",
          briefEnabled: agent.briefEnabled,
        }}
      />
    </div>
  );
}
