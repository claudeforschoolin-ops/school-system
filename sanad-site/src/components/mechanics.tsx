import { SectionHead } from "@/components/section-head";
import { mechanics } from "@/content/site";

export function Mechanics() {
  return (
    <section id="architecture" data-section data-n="03" data-label="Architecture" aria-labelledby="mech-title" className="border-b border-hairline py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={mechanics.index} label={mechanics.label} heading={mechanics.heading} note={mechanics.audience} id="mech-title" />

        <dl className="m-0 mt-16 grid gap-x-16 gap-y-14 md:grid-cols-2">
          {mechanics.specs.map((s, i) => (
            <div key={s.label} className="reveal border-t border-ink pt-6" style={{ ["--d" as string]: (i % 2) * 120 }}>
              <dt className="text-caption text-ink-3">{s.label}</dt>
              <dd className="m-0 mt-3">
                <span className="text-display block text-ink">{s.value}</span>
                <span className="text-body mt-4 block max-w-[28rem]">{s.text}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
