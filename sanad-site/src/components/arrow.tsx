export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true" className={`arrow ${className}`} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 5h13M10 1l4 4-4 4" />
    </svg>
  );
}
