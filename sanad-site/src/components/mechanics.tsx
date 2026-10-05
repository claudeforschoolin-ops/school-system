import { CountUp } from "@/components/motion/count-up";
import { SectionHead } from "@/components/section-head";
import { mechanics } from "@/content/site";

/** The measurable claim leads, large, with the bound drawn under it. The rest follow as three plain facts. */
export function Mechanics() {
  const { hero, specs } = mechanics;
  return (
    <section id="architecture" data-section data-n="03" data-label="Architecture" aria-labelledby="mech-title" className="py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={mechanics.index} label={mechanics.label} heading={mechanics.heading} note={mechanics.audience} id="mech-title" />

        <div role="group" aria-label={hero.label} className="reveal mt-14 lg:mt-16" style={{ ["--d" as string]: 100 }}>
          <p className="text-caption text-[1.0625rem] text-ink-3">{hero.label}</p>
          <p
            className="hl hl--ink mt-1 font-serif text-[clamp(4.25rem,15vw,13.5rem)] font-medium leading-[0.9] tracking-[-0.045em]"
            style={{ ["--d" as string]: 350 }}
          >
            <span className="hl-text">
              <CountUp to={hero.value} prefix={hero.prefix} suffix={hero.suffix} duration={1700} />
            </span>
          </p>

          <div aria-hidden="true" className="relative mt-9 max-w-[62.5rem] pb-[3.75rem]">
            <div className="h-px bg-ink/20" />
            <div className="bar-grow absolute left-0 top-0 h-[3px] w-[76%] -translate-y-px bg-sanad" style={{ ["--d" as string]: 500 }} />
            <span className="tl-dot absolute left-[76%] top-0 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sanad" />
            <span className="absolute left-0 top-5 font-serif text-[1.125rem] italic text-ink-3">0 ms</span>
            <span className="absolute left-[76%] top-5 -translate-x-1/2 whitespace-nowrap font-serif text-[1.25rem] italic text-sanad">{hero.caption}</span>
          </div>

          <p className="text-body max-w-[40rem] text-[1.1875rem] sm:text-[1.3125rem]">{hero.text}</p>
        </div>

        <dl className="m-0 mt-16 grid gap-10 md:grid-cols-3 md:gap-12 lg:mt-20">
          {specs.map((s, i) => (
            <div key={s.label} className="reveal border-t border-ink/50 pt-5" style={{ ["--d" as string]: i * 140 }}>
              <dt className="text-caption text-[1.0625rem] text-ink-3">{s.label}</dt>
              <dd className="m-0 mt-2">
                <span className="block font-serif text-[2.25rem] font-medium leading-[1.05] tracking-[-0.025em] text-ink lg:text-[3.1rem]">{s.value}</span>
                <span className="text-body mt-3 block max-w-[24rem]">{s.text}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
