import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  color = "navy",
  src,
  size = 20,
  className,
  ring,
}: {
  name: string;
  color?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("shrink-0 rounded-full object-cover", ring && "ring-2 ring-app", className)} style={style} />;
  }
  return (
    <span
      title={name}
      aria-label={name}
      className={cn("inline-grid shrink-0 select-none place-items-center rounded-full font-medium leading-none", ring && "ring-2 ring-app", className)}
      style={{ ...style, background: `var(--tag-${color ?? "navy"}-bg)`, color: `var(--tag-${color ?? "navy"}-fg)` }}
    >
      {initials(name.replace(/^(أ|م|د)\.\s*/, ""))}
    </span>
  );
}

export function AvatarStack({
  people,
  size = 20,
  max = 3,
}: {
  people: Array<{ id: string; name: string; avatarColor?: string | null; avatarUrl?: string | null }>;
  size?: number;
  max?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => (
        <Avatar key={p.id} name={p.name} color={p.avatarColor} src={p.avatarUrl} size={size} ring className={i > 0 ? "-ms-1.5" : undefined} />
      ))}
      {rest > 0 ? <span className="-ms-1 ps-1.5 text-[11px] text-fg-3 tabular">+{rest}</span> : null}
    </span>
  );
}
