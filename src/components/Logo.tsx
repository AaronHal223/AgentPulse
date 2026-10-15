export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-serif text-xl font-semibold tracking-tight text-ink ${className}`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#16302b" />
        <path d="M6 18h5l3-7 4 12 3-7h5" fill="none" stroke="#5fd3a3" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      AgentPulse
    </span>
  );
}
