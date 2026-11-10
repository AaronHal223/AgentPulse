"use client";
import { useState } from "react";
import type { Buyer, Match, MatchFeedback, Message } from "@/lib/db/schema";
import { ProfilePanel } from "./ProfilePanel";
import { ChatPanel } from "./ChatPanel";
import { MatchesPanel } from "./MatchesPanel";
import { ShareLinkPanel } from "./ShareLinkPanel";

type Props = { buyer: Buyer; messages: Message[]; matches: Match[]; feedback: MatchFeedback[] };

export function BuyerWorkspace({ buyer: initialBuyer, messages, matches, feedback }: Props) {
  const [buyer, setBuyer] = useState(initialBuyer);
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-semibold">{buyer.name}</h1>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <ProfilePanel buyer={buyer} onChange={setBuyer} />
          <ShareLinkPanel buyer={buyer} />
          <ChatPanel buyer={buyer} initial={messages} onBuyer={setBuyer} />
        </div>
        <MatchesPanel buyer={buyer} initial={matches} feedback={feedback} />
      </div>
    </div>
  );
}
