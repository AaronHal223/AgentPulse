import Link from "next/link";
import { redirect } from "next/navigation";
import { Car, MessageSquareText, Search, Sunrise } from "lucide-react";
import { currentAgent } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { ScoreBadge } from "@/components/ScoreBadge";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: MessageSquareText,
    title: "Profiles that evolve",
    body: "Tell AgentPulse about a client in plain words — after a call, after a showing. It builds and keeps refining their profile: budget, must-haves, deal-breakers, and the places they need to be near.",
  },
  {
    icon: Search,
    title: "The whole web, searched for you",
    body: "It searches Zillow, Redfin, Realtor.com, rental sites and local brokerages, reads the listings, and writes you a summary and a ready-to-send blurb for each home.",
  },
  {
    icon: Car,
    title: "Scored 1–10, with drive times",
    body: "Every home gets an honest fit score for that specific client, a check on whether it really sits in their area, and drive minutes to work, school or family.",
  },
  {
    icon: Sunrise,
    title: "A daily brief",
    body: "Each morning, the best new homes for every client land on your dashboard and in your inbox.",
  },
];

export default async function Home() {
  if (await currentAgent()) redirect("/dashboard");

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost">Log in</Link>
          <Link href="/signup" className="btn-primary">Get started</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">For real estate agents</p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.08] font-semibold sm:text-6xl">
            Know which homes fit each client before they ask.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
            AgentPulse is an AI assistant that learns every client you work with, hunts the web for homes and rentals that fit them, and tells you how well each one fits — and how far it is from the places that matter to them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-brand !px-6 !py-3 text-base">Create your workspace</Link>
            <Link href="/login" className="btn-ghost !px-6 !py-3 text-base">I have an account</Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-brand-soft/70 blur-2xl" />
          <div className="card p-5 shadow-xl shadow-ink/5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">This morning · for the Patel family</p>
            <div className="mt-4 flex gap-4">
              <ScoreBadge score={9} size="lg" />
              <div>
                <p className="font-serif text-lg font-semibold">412 Maple Ave · Haddonfield, NJ</p>
                <p className="text-sm text-ink-soft">$589,000 · 4 bd · 2.5 ba · Colonial</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium text-ink-soft">
                  <span className="rounded-full bg-paper px-2.5 py-1">14 min / 6.2 mi to Work</span>
                  <span className="rounded-full bg-paper px-2.5 py-1">4 min / 1.1 mi to School</span>
                </div>
              </div>
            </div>
            <p className="mt-4 rounded-lg bg-brand-soft/60 p-3 text-sm leading-relaxed">
              “A fenced yard for Biscuit, a walk to Central Elementary, and a finished basement for Raj’s office — this one checks every box under budget.”
            </p>
            <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
              <ScoreBadge score={6} />
              <div className="text-sm">
                <p className="font-semibold">88 Kings Hwy · Cherry Hill</p>
                <p className="text-muted">$615,000 · over budget, no yard</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title}>
              <f.icon className="text-brand" size={22} />
              <h2 className="mt-3 font-serif text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted">© {new Date().getFullYear()} AgentPulse AI</footer>
    </div>
  );
}
