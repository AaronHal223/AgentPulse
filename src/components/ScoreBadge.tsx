export function ScoreBadge({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const tone =
    score >= 8 ? "bg-brand-soft text-brand ring-brand/30" : score >= 6 ? "bg-amber-soft text-amber ring-amber/30" : "bg-rust-soft text-rust ring-rust/30";
  const dims = size === "lg" ? "h-14 w-14 text-xl" : "h-11 w-11 text-base";
  return (
    <div className={`flex ${dims} shrink-0 flex-col items-center justify-center rounded-xl font-bold ring-1 ${tone}`} title={`Fit score ${score} out of 10`}>
      <span className="leading-none">{score}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wider opacity-70">/10</span>
    </div>
  );
}
