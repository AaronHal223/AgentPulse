import Link from "next/link";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";
import type { Agent } from "@/lib/db/schema";

export function AppShell({ agent, children }: { agent: Agent; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-8">
          <Link href="/dashboard" aria-label="AgentPulse home">
            <Logo />
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{agent.name}</span>
            <form action="/api/auth/logout" method="post">
              <button className="text-sm font-medium text-muted hover:text-ink">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}
