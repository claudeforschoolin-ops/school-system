import { SectionHead } from "@/components/section-head";
import { mechanics } from "@/content/site";

export function Mechanics() {
  const { trace } = mechanics;
  return (
    <section id="architecture" aria-labelledby="mech-title" className="border-b border-hairline py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={mechanics.index} label={mechanics.label} heading={mechanics.heading} note={mechanics.audience} id="mech-title" />

        <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-10">
          <dl className="m-0 min-w-0 border-t border-ink lg:col-span-6">
            {mechanics.specs.map((s, i) => (
              <div key={s.label} className="reveal border-b border-hairline py-7" style={{ ["--d" as string]: i * 110 }}>
                <dt className="text-caption text-ink-3">{s.label}</dt>
                <dd className="m-0 mt-1">
                  <span className="text-heading block text-ink">{s.value}</span>
                  <span className="text-body mt-2 block max-w-[32rem]">{s.text}</span>
                </dd>
              </div>
            ))}
          </dl>

          <figure className="reveal m-0 min-w-0 lg:sticky lg:top-28 lg:col-span-6 lg:self-start">
            <div className="on-ink overflow-hidden rounded-card bg-ink text-paper">
              <div className="flex items-baseline justify-between gap-4 border-b border-paper/15 px-5 py-3 sm:px-6">
                <figcaption className="text-caption font-medium text-paper">{trace.title}</figcaption>
                <span className="text-caption text-paper/55">{trace.note}</span>
              </div>
              <div className="overflow-x-auto px-5 py-5 sm:px-6" role="img" aria-label={`${trace.title}. ${trace.note}`}>
                <div className="mono-block sm:min-w-[30rem]">
                  {trace.lines.map((l, i) =>
                    l[0] === "gap" ? (
                      <div key={i} className="h-3" />
                    ) : l[0] === "comment" ? (
                      <div key={i} className="text-paper/45">
                        {l[1]}
                      </div>
                    ) : (
                      <div key={i} className="grid grid-cols-[5.2rem_7.6rem_1fr] gap-x-3 sm:grid-cols-[5.4rem_4.4rem_8rem_1fr]">
                        <span className="text-mist">{l[1]}</span>
                        <span className="hidden text-paper/55 sm:block">{l[2]}</span>
                        <span className="text-paper">{l[3]}</span>
                        <span className="text-mist/80">{l[4]}</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
              <div className="border-t border-paper/15 px-5 py-3 sm:px-6">
                <p className="text-caption text-paper/55">
                  Target: state changes under 100 ms across terminals, with no dependency on the network.
                </p>
              </div>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
