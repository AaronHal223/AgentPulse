"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Brief" },
  { href: "/buyers", label: "Clients" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex gap-1">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-ink text-white" : "text-ink-soft hover:bg-line/60"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
