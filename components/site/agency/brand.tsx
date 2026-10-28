/** The business's logo, or — when it hasn't uploaded one — a wordmark: a small browser-window mark and its name. */
export function Wordmark({ name, logo, className = "" }: { name: string; logo: string | null; className?: string }) {
  if (logo) return <img src={logo} alt={name} className={`h-9 max-w-[200px] object-contain ${className}`} />;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--ac)" />
        <path d="M1 10h30" stroke="var(--on-ac)" strokeOpacity=".35" />
        <circle cx="6" cy="5.6" r="1.4" fill="var(--lime)" />
        <path d="M7.5 15.5l3 9 3.5-7 3.5 7 3-9" fill="none" stroke="var(--on-ac)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23.5 24.5h3" stroke="var(--lime)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[1.125rem] font-semibold tracking-[-0.02em]">{name}</span>
    </span>
  );
}
