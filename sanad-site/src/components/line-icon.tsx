/**
 * Line-and-wash icons on the brand's 64-unit grid: one ink line with round ends,
 * and a wash of Mist beneath it, shifted down and right. One idea per drawing.
 */
const WASH = "var(--color-mist)";

const ICONS = {
  document: (
    <>
      <path d="M21 15h19l11 11v31H21z" fill={WASH} />
      <path d="M16 10h20l11 11v31H16z" className="dg-line" strokeWidth="2.6" />
      <path d="M36 10v11h11" className="dg-line" strokeWidth="2.6" />
      <path d="M23 33h17M23 41h17M23 49h9" className="dg-line" strokeWidth="2.6" />
    </>
  ),
  data: (
    <>
      <path d="M17 19c0-4 8-7 18-7s18 3 18 7v31c0 4-8 7-18 7s-18-3-18-7z" fill={WASH} transform="translate(4 4)" />
      <ellipse cx="32" cy="16" rx="18" ry="7" className="dg-box" fill="none" strokeWidth="2.6" />
      <path d="M14 16v32c0 4 8 7 18 7s18-3 18-7V16" className="dg-line" strokeWidth="2.6" />
      <path d="M14 32c0 4 8 7 18 7s18-3 18-7" className="dg-line" strokeWidth="2.6" />
    </>
  ),
  security: (
    <>
      <path d="M32 8l18 6v15c0 12-8 21-18 26-10-5-18-14-18-26V14z" fill={WASH} transform="translate(4 4)" />
      <path d="M32 8l18 6v15c0 12-8 21-18 26-10-5-18-14-18-26V14z" className="dg-line" strokeWidth="2.6" />
      <path d="M23 31l7 7 12-14" className="dg-line" strokeWidth="2.8" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

export function LineIcon({ name, size = 44 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}
