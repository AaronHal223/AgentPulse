"use client";
import { useState } from "react";
import type { Buyer, Match, MatchFeedback, Message } from "@/lib/db/schema";
import { ProfilePanel } from "./ProfilePanel";
import { ChatPanel } from "./ChatPanel";
import { MatchesPanel } from "./MatchesPanel";
import { ShareLinkPanel } from "./ShareLinkPanel";
import { VoiceNote } from "./VoiceNote";

type Props = {
  buyer: Buyer;
  messages: Message[];
  matches: Match[];
  feedback: MatchFeedback[];
  canTranscribeAudio: boolean;
};

const SECTIONS = [
  ["homes", "Homes"],
  ["profile", "Profile"],
  ["voice-note", "Voice note"],
  ["chat", "Chat"],
] as const;

// Leaves room for the sticky header when jumping to a section.
const ANCHOR = "scroll-mt-20";

export function BuyerWorkspace({ buyer: initialBuyer, messages, matches, feedback, canTranscribeAudio }: Props) {
  const [buyer, setBuyer] = useState(initialBuyer);
  const [voiceMessages, setVoiceMessages] = useState<Message[]>([]);

  function onVoiceNoteSaved(updated: Buyer, added: Message[]) {
    setBuyer(updated);
    setVoiceMessages(added);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-semibold">{buyer.name}</h1>
      {/* On a phone the page is one long column; these jump straight to a section. */}
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden" aria-label="Sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-line bg-card px-3.5 py-1.5 text-sm font-medium text-ink-soft">
            {label}
          </a>
        ))}
      </nav>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section id="profile" className={ANCHOR}>
            <ProfilePanel buyer={buyer} onChange={setBuyer} />
          </section>
          <ShareLinkPanel buyer={buyer} />
          <section id="voice-note" className={ANCHOR}>
            <VoiceNote buyer={buyer} canTranscribeAudio={canTranscribeAudio} onSaved={onVoiceNoteSaved} />
          </section>
          <section id="chat" className={ANCHOR}>
            <ChatPanel buyer={buyer} initial={messages} added={voiceMessages} onBuyer={setBuyer} />
          </section>
        </div>
        <section id="homes" className={ANCHOR}>
          <MatchesPanel buyer={buyer} initial={matches} feedback={feedback} />
        </section>
      </div>
    </div>
  );
}
