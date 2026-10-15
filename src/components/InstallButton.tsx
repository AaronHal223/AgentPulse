"use client";
import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

/** "Install app" button: native prompt on Android/Chrome/Edge, step-by-step help on iPhone/iPad. */
export function InstallButton({ variant = "ghost" }: { variant?: "ghost" | "brand" }) {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!deferred && !ios)) return null;

  async function install() {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
    } else {
      setHelp(true);
    }
  }

  return (
    <>
      <button onClick={install} className={variant === "brand" ? "btn-brand" : "btn-ghost !px-3 !py-1.5"}>
        <Download size={15} /> Install app
      </button>
      {help && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setHelp(false)}>
          <div className="card w-full max-w-sm p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <p className="font-serif text-lg font-semibold">Add AgentPulse to your Home Screen</p>
              <button onClick={() => setHelp(false)} className="text-muted" aria-label="Close"><X size={18} /></button>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-ink-soft">
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper"><Share size={16} /></span>
                Tap the <b className="text-ink">Share</b> button in Safari&apos;s toolbar.
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper"><SquarePlus size={16} /></span>
                Choose <b className="text-ink">Add to Home Screen</b>, then <b className="text-ink">Add</b>.
              </li>
            </ol>
            <p className="mt-4 text-xs text-muted">It opens full-screen like any other app. Using Chrome on iPhone? Open this page in Safari first.</p>
          </div>
        </div>
      )}
    </>
  );
}
