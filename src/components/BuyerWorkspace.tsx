"use client";
import { useState } from "react";
import type { Buyer, Match, Message } from "@/lib/db/schema";
import { ProfilePanel } from "./ProfilePanel";
import { ChatPanel } from "./ChatPanel";
import { MatchesPanel } from "./MatchesPanel";

export function BuyerWorkspace({ buyer: initialBuyer, messages, matches }: { buyer: Buyer; messages: Message[]; matches: Match[] }) {
  const [buyer, setBuyer] = useState(initialBuyer);
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-semibold">{buyer.name}</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <ProfilePanel buyer={buyer} onChange={setBuyer} />
          <ChatPanel buyer={buyer} initial={messages} onBuyer={setBuyer} />
        </div>
        <MatchesPanel buyer={buyer} initial={matches} />
      </div>
    </div>
  );
}
