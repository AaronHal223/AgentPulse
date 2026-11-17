"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Buyer, Match, MatchFeedback, Message } from "@/lib/db/schema";
import { ProfilePanel } from "./ProfilePanel";
import { ChatPanel } from "./ChatPanel";
import { MatchesPanel } from "./MatchesPanel";
import { ShareLinkPanel } from "./ShareLinkPanel";
import { FollowUpDraft } from "./FollowUpDraft";
import { VoiceNote } from "./VoiceNote";
import { api } from "./fetcher";

type Props = {
  buyer: Buyer;
  messages: Message[];
  matches: Match[];
  feedback: MatchFeedback[];
  canTranscribeAudio: boolean;
};

type Tab = "homes" | "profile" | "notes" | "chat";

const TABS: [Tab, string][] = [
  ["homes", "Homes"],
  ["profile", "Profile"],
  ["notes", "Notes"],
  ["chat", "Chat"],
];

export function BuyerWorkspace({ buyer: initialBuyer, messages, matches, feedback, canTranscribeAudio }: Props) {
  const router = useRouter();
  const [buyer, setBuyer] = useState(initialBuyer);
  const [voiceMessages, setVoiceMessages] = useState<Message[]>([]);
  // Phones show one section at a time; wide screens show everything side by side.
  const [tab, setTab] = useState<Tab>("homes");
  const only = (t: Tab) => (tab === t ? "" : "hidden lg:block");

  function onVoiceNoteSaved(updated: Buyer, added: Message[]) {
    setBuyer(updated);
    setVoiceMessages(added);
  }

  async function removeSample() {
    await api("/api/sample", { method: "DELETE" }).catch(() => {});
    router.push("/buyers");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl font-semibold">{buyer.name}</h1>
      {buyer.isSample && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-amber-soft px-4 py-3 text-sm text-ink-soft">
          <p className="min-w-0 flex-1">This is a practice client with made-up homes. Try Save, Reject, Send to client, the map and the tour planner. Nothing here is real.</p>
          <button onClick={removeSample} className="btn-ghost !px-3 !py-1.5">Remove sample</button>
        </div>
      )}
      <div className="sticky top-[calc(3.6rem+env(safe-area-inset-top))] z-10 -mx-4 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur lg:hidden" role="tablist" aria-label="Sections">
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-line/50 p-1">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`min-h-9 rounded-md text-sm font-semibold ${tab === key ? "bg-card text-ink shadow-sm" : "text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className={`space-y-6 ${only("profile")}`}>
            <ProfilePanel buyer={buyer} onChange={setBuyer} />
            {!buyer.isSample && <ShareLinkPanel buyer={buyer} />}
          </div>
          <div className={`space-y-6 ${only("notes")}`}>
            <VoiceNote buyer={buyer} canTranscribeAudio={canTranscribeAudio} onSaved={onVoiceNoteSaved} />
            <FollowUpDraft buyer={buyer} />
          </div>
          <div className={only("chat")}>
            <ChatPanel buyer={buyer} initial={messages} added={voiceMessages} onBuyer={setBuyer} />
          </div>
        </div>
        <div className={only("homes")}>
          <MatchesPanel buyer={buyer} initial={matches} feedback={feedback} />
        </div>
      </div>
    </div>
  );
}
