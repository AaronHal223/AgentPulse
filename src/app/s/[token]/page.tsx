import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { SharedHomeCard } from "@/components/SharedHomeCard";
import { recordView, resolveShareToken, sharedHomes } from "@/lib/share-links";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Homes picked for you",
  robots: { index: false, follow: false },
};

function Inactive() {
  return (
    <div className="card mx-auto mt-16 max-w-md px-6 py-12 text-center">
      <h1 className="font-serif text-2xl font-semibold">This link is no longer active</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Private links expire after a while, and your agent can switch one off at any time. Ask them for a new link.
      </p>
    </div>
  );
}

/** A client's private page: the homes their agent sent, with thumbs-up / thumbs-down. No login. */
export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await resolveShareToken(token);

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <Logo />
      {page ? <Homes page={page} token={token} /> : <Inactive />}
    </div>
  );
}

async function Homes({ page, token }: { page: NonNullable<Awaited<ReturnType<typeof resolveShareToken>>>; token: string }) {
  const { buyer, agent, link } = page;
  const homes = await sharedHomes(buyer.id);
  // Counting the visit is a nicety; never let it break the page.
  await recordView(link).catch(() => {});

  const agentFirst = agent.name.split(" ")[0];
  const expires = link.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric" });

  return (
    <>
      <header className="mt-6">
        <h1 className="font-serif text-3xl font-semibold">Homes for {buyer.name}</h1>
        <p className="mt-1 text-ink-soft">
          Picked by {agent.name}
          {agent.brokerage ? `, ${agent.brokerage}` : ""}. Tell {agentFirst} what you think with a thumbs-up or thumbs-down.
        </p>
      </header>

      {homes.length ? (
        <div className="mt-6 space-y-4">
          {homes.map((home) => (
            <SharedHomeCard key={home.id} home={home} token={token} agentName={agentFirst} />
          ))}
        </div>
      ) : (
        <div className="card mt-6 px-6 py-12 text-center text-sm text-ink-soft">
          {agentFirst} hasn&apos;t sent any homes yet. New ones will show up here, so keep this link.
        </div>
      )}

      <p className="mt-8 text-center text-xs text-muted">
        This page is private to you and {agentFirst}. The link works until {expires}.
      </p>
    </>
  );
}
