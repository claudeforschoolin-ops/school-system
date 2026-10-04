import { SectionHead } from "@/components/section-head";
import { how } from "@/content/site";

export function HowWeWork() {
  return (
    <section id="process" data-section data-n="05" data-label="Process" aria-labelledby="how-title" className="py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={how.index} label={how.label} heading={how.heading} lead={how.lead} id="how-title" />

        <ol className="reveal relative mt-16 grid list-none gap-12 p-0 lg:grid-cols-4 lg:gap-8">
          {/* the line: horizontal from lg, vertical below */}
          <span aria-hidden="true" className="tl-line absolute bottom-3 left-[7px] top-3 w-px bg-ink/25 lg:inset-x-0 lg:bottom-auto lg:left-0 lg:top-[7px] lg:h-px lg:w-auto" />
          {how.stages.map((st, i) => (
            <li key={st.n} className="relative flex flex-col pl-10 lg:pl-0 lg:pt-12">
              <span
                aria-hidden="true"
                className="tl-node absolute left-0 top-1 grid size-[15px] place-items-center rounded-full border border-ink bg-paper lg:top-0"
                style={{ ["--d" as string]: 300 + i * 380 }}
              >
                <span className="size-[7px] rounded-full bg-sanad" />
              </span>
              <div className="reveal flex flex-1 flex-col" style={{ ["--d" as string]: 250 + i * 330 }}>
                <p className="flex items-baseline gap-3">
                  <span className="font-serif text-[1.375rem] font-medium text-sanad">{st.n}</span>
                  <span className="text-title text-ink">{st.name}</span>
                </p>
                <p className="text-body mb-6 mt-3">{st.text}</p>
                <div className="mt-auto border-t border-hairline pt-4">
                  <p className="text-caption text-ink-3">You receive</p>
                  <p className="text-body mt-1 text-[1rem] leading-[1.55] text-ink">{st.receive}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
