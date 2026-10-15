"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, Sunrise, Users } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Brief", icon: Sunrise },
  { href: "/buyers", label: "Clients", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(href + "/");
}

/** Top navigation on tablets and desktops. */
export function NavLinks() {
  const isActive = useActive();
  return (
    <nav className="hidden gap-1 sm:flex">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${isActive(l.href) ? "bg-ink text-white" : "text-ink-soft hover:bg-line/60"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Bottom tab bar on phones, like a native app. */
export function TabBar() {
  const isActive = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="grid grid-cols-3">
        {links.map((l) => {
          const active = isActive(l.href);
          return (
            <Link key={l.href} href={l.href} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${active ? "text-ink" : "text-muted"}`}>
              <l.icon size={21} strokeWidth={active ? 2.4 : 1.8} />
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
