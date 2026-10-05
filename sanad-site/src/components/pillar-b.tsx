import { Arrow } from "@/components/arrow";
import { LineIcon, type IconName } from "@/components/line-icon";
import { systems } from "@/content/site";

const { letter, title, heading, cta, items } = systems.pillarB;

/** The bespoke offer, set on Ink so it answers Pillar A's paper. Three open columns, one promise each. */
export function PillarB() {
  return (
    <div className="on-ink relative overflow-hidden rounded-[10px] bg-ink px-6 pb-24 pt-10 text-paper sm:px-10 sm:pt-12 lg:px-14 lg:pb-28">
      <div className="reveal flex items-end gap-4 sm:gap-5">
        <span aria-hidden="true" className="font-serif text-[3.5rem] font-medium leading-[0.8] text-mist sm:text-[4.5rem]">
          {letter}
        </span>
        <h3 className="font-serif text-[1.375rem] font-medium leading-tight text-paper sm:text-[1.875rem]">
          <span className="sr-only">Pillar {letter}: </span>
          {title}
        </h3>
      </div>

      <div className="reveal mt-8 flex flex-col gap-6 sm:mt-10 sm:flex-row sm:items-center sm:justify-between sm:gap-10" style={{ ["--d" as string]: 120 }}>
        <h4 className="max-w-[18ch] font-serif text-[2.25rem] font-medium leading-[1.05] tracking-[-0.015em] text-paper sm:max-w-none sm:text-[2.875rem]">
          {heading}
        </h4>
        <a href={cta.href} className="btn btn-paper shrink-0 self-start">
          {cta.label} <Arrow />
        </a>
      </div>

      <ul className="m-0 mt-12 grid list-none gap-0 p-0 sm:mt-14 lg:grid-cols-3">
        {items.map((item, i) => (
          <li
            key={item.title}
            className="reveal flex flex-col border-t border-paper/20 py-8 first:border-t-0 first:pt-0 lg:min-h-[26rem] lg:border-l lg:border-t-0 lg:px-9 lg:py-0 lg:first:border-l-0 lg:first:pl-0 lg:last:pr-0"
            style={{ ["--d" as string]: 240 + i * 140 }}
          >
            <LineIcon
              name={item.icon as IconName}
              size={72}
              washClass="fill-signal"
              className="[&_.dg-box]:stroke-paper [&_.dg-line]:stroke-paper"
            />
            <h5 className="mt-7 font-serif text-[1.75rem] font-medium leading-[1.08] tracking-[-0.02em] text-paper sm:text-[2.25rem] lg:text-[1.75rem] xl:text-[2.25rem]">
              {item.title}
            </h5>
            <p className="mt-4 font-serif text-[1.375rem] italic leading-[1.3] text-mist sm:text-[1.5625rem] lg:text-[1.25rem] xl:text-[1.5625rem]">{item.tagline}</p>
            <p className="mt-10 font-serif text-[2rem] font-medium leading-[1.08] tracking-[-0.02em] text-paper sm:text-[2.25rem] lg:mt-auto lg:pt-10 lg:text-[1.875rem] xl:text-[2.75rem]">
              {item.guarantee}
            </p>
          </li>
        ))}
      </ul>

      <span aria-hidden="true" className="loop-line loop-drift absolute inset-x-0 -bottom-1.5 text-mist/30" />
    </div>
  );
}
