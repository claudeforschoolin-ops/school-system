import { MARK_LINE, MARK_WASH } from "./mark-paths";

/**
 * The symbol is drawn once, here, and referenced everywhere with <use>.
 * Colours come from CSS custom properties on `.mark`, so the same drawing
 * serves "on paper" and "on ink" without a second copy of the path data.
 */
export function MarkSprite() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
      <defs>
        <clipPath id="sanad-mark-clip">
          <rect width="64" height="64" rx="11" />
        </clipPath>
        <symbol id="sanad-mark" viewBox="0 0 64 64">
          <rect width="64" height="64" rx="11" style={{ fill: "var(--mark-tile)" }} />
          <g clipPath="url(#sanad-mark-clip)">
            <path d={MARK_WASH} style={{ fill: "var(--mark-wash)" }} />
            <path
              d={MARK_LINE}
              fillRule="evenodd"
              strokeLinejoin="round"
              style={{
                fill: "var(--mark-line)",
                stroke: "var(--mark-line)",
                strokeWidth: "var(--mark-boost)",
              }}
            />
          </g>
        </symbol>
      </defs>
    </svg>
  );
}

type MarkProps = {
  /** Rendered size in px. Omit to size with CSS (e.g. inside a lockup). */
  size?: number;
  /** "paper": ink tile for light backgrounds. "ink": pale tile for dark backgrounds. */
  tone?: "paper" | "ink";
  /** Extra line weight in 64-unit grid units. Small renders need a heavier line to stay legible. */
  boost?: number;
  className?: string;
};

export function Mark({ size, tone = "paper", boost = 0, className = "" }: MarkProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`mark ${tone === "ink" ? "mark--ink" : ""} ${className}`}
      style={boost ? ({ "--mark-boost": boost } as React.CSSProperties) : undefined}
    >
      <use href="#sanad-mark" />
    </svg>
  );
}

type LockupProps = {
  /** Wordmark font size in px. The symbol is 90% of this, the gap one fifth. */
  size?: number;
  tone?: "paper" | "ink";
  boost?: number;
  className?: string;
};

/** Primary lockup: hand-drawn symbol beside the Newsreader Semibold wordmark. */
export function Lockup({ size = 32, tone = "paper", boost = 1.0, className = "" }: LockupProps) {
  return (
    <span className={`lockup ${className}`} style={{ fontSize: size }}>
      <Mark tone={tone} boost={boost} />
      <span className="lockup-word">Sanad</span>
    </span>
  );
}
