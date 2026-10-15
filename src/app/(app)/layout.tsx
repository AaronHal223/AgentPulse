import { requireAgent } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const agent = await requireAgent();
  return <AppShell agent={agent}>{children}</AppShell>;
}
