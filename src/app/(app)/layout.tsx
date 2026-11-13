import { requireAgent } from "@/lib/auth";
import { unreadAlertCount } from "@/lib/alerts";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const agent = await requireAgent();
  // The count is decoration; a database blip here must not take the whole page down.
  const unreadAlerts = await unreadAlertCount(agent.id).catch(() => 0);
  return <AppShell agent={agent} unreadAlerts={unreadAlerts}>{children}</AppShell>;
}
