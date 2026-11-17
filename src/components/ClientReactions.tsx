import Link from "next/link";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { ClientReaction } from "@/lib/feedback";
import { timeAgo } from "@/lib/format";

/** Dashboard list of what clients said on their private pages. */
export function ClientReactions({ reactions }: { reactions: ClientReaction[] }) {
  if (!reactions.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-xl font-semibold">What your clients said</h2>
      <ul className="card divide-y divide-line">
        {reactions.map(({ feedback, match, buyer }) => {
          const liked = feedback.verdict === "liked";
          const Icon = liked ? ThumbsUp : ThumbsDown;
          return (
            <li key={feedback.id}>
              <Link href={`/buyers/${buyer.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-paper/60">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${liked ? "bg-brand-soft text-brand" : "bg-rust-soft text-rust"}`}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{buyer.name}</span>{" "}
                  <span className="text-ink-soft">
                    {liked ? "liked" : "passed on"} {match.address || "a home"}
                    {match.city ? `, ${match.city}` : ""}
                  </span>
                  {feedback.note && <span className="mt-0.5 block text-ink-soft">“{feedback.note}”</span>}
                  <span className="mt-0.5 block text-xs text-muted">{timeAgo(feedback.createdAt)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
