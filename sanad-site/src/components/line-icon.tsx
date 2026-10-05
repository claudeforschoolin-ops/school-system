/**
 * Line-and-wash icons on the brand's 64-unit grid: one ink line with round ends,
 * and a wash of Mist beneath it, shifted down and right. One idea per drawing.
 */
const WASH = "var(--color-mist)";

/** Each icon takes the class its wash carries, so a caller can bring the wash in and out. */
const ICONS = {
  document: (w?: string) => (
    <>
      <path d="M21 15h19l11 11v31H21z" fill={WASH} className={w} />
      <path d="M16 10h20l11 11v31H16z" className="dg-line" strokeWidth="2.6" />
      <path d="M36 10v11h11" className="dg-line" strokeWidth="2.6" />
      <path d="M23 33h17M23 41h17M23 49h9" className="dg-line" strokeWidth="2.6" />
    </>
  ),
  data: (w?: string) => (
    <>
      <path d="M17 19c0-4 8-7 18-7s18 3 18 7v31c0 4-8 7-18 7s-18-3-18-7z" fill={WASH} transform="translate(4 4)" className={w} />
      <ellipse cx="32" cy="16" rx="18" ry="7" className="dg-box" fill="none" strokeWidth="2.6" />
      <path d="M14 16v32c0 4 8 7 18 7s18-3 18-7V16" className="dg-line" strokeWidth="2.6" />
      <path d="M14 32c0 4 8 7 18 7s18-3 18-7" className="dg-line" strokeWidth="2.6" />
    </>
  ),
  security: (w?: string) => (
    <>
      <path d="M32 8l18 6v15c0 12-8 21-18 26-10-5-18-14-18-26V14z" fill={WASH} transform="translate(4 4)" className={w} />
      <path d="M32 8l18 6v15c0 12-8 21-18 26-10-5-18-14-18-26V14z" className="dg-line" strokeWidth="2.6" />
      <path d="M23 31l7 7 12-14" className="dg-line" strokeWidth="2.8" />
    </>
  ),
  warehouse: (w?: string) => (
    <>
      <path d="M14 33L36 17l22 16v25H14z" fill={WASH} className={w} />
      <path d="M10 28L32 12l22 16v26H10z" className="dg-line" strokeWidth="2.6" />
      <path d="M24 54V38h16v16M24 46h16" className="dg-line" strokeWidth="2.6" />
    </>
  ),
  building: (w?: string) => (
    <>
      <path d="M20 58V14h28v44z" fill={WASH} className={w} />
      <path d="M16 54V10h28v44zM44 22h8v32" className="dg-line" strokeWidth="2.6" />
      <path d="M23 20h6M33 20h4M23 29h6M33 29h4M23 38h6M33 38h4M26 54v-8h8v8" className="dg-line" strokeWidth="2.6" />
    </>
  ),
  receipt: (w?: string) => (
    <>
      <path d="M20 14h32v44l-6-4-6 4-6-4-6 4-8-4z" fill={WASH} className={w} />
      <path d="M16 10h32v44l-6-4-6 4-6-4-6 4-8-4z" className="dg-line" strokeWidth="2.6" />
      <path d="M23 22h18M23 30h18M23 38h10" className="dg-line" strokeWidth="2.6" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

export function LineIcon({ name, size = 44, washClass, className }: { name: IconName; size?: number; washClass?: string; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      {ICONS[name](washClass)}
    </svg>
  );
}
