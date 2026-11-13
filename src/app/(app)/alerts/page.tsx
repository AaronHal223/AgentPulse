import { requireAgent } from "@/lib/auth";
import { listAlerts } from "@/lib/alerts";
import { AlertsInbox } from "@/components/AlertsInbox";
import { PushToggle } from "@/components/PushToggle";

export default async function AlertsPage() {
  const agent = await requireAgent();
  const alerts = await listAlerts(agent.id);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Alerts</h1>
        <p className="mt-1 text-ink-soft">Price drops and status changes on saved homes, and new homes that score 8 or higher.</p>
      </div>
      <PushToggle />
      <AlertsInbox initial={alerts} />
    </div>
  );
}
