import { LineIcon, type IconName } from "@/components/line-icon";
import { ModuleExplorer } from "@/components/module-explorer";
import { SectionHead } from "@/components/section-head";
import { WIREFRAMES } from "@/components/wireframes";
import { systems } from "@/content/site";

function Banner({
  tone,
  letter,
  title,
  kind,
  text,
}: {
  tone: "blue" | "ink";
  letter: string;
  title: string;
  kind: string;
  text: string;
}) {
  return (
    <div
      className={`on-ink relative overflow-hidden px-6 pb-12 pt-8 sm:px-10 sm:pb-14 sm:pt-10 ${
        tone === "blue" ? "bg-sanad" : "bg-ink"
      } text-paper`}
    >
      <span aria-hidden="true" className="loop-line loop-drift absolute inset-x-0 -bottom-1 text-mist/20" />
      <div className="relative grid items-end gap-6 lg:grid-cols-12 lg:gap-10">
        <div className="flex items-end gap-6 lg:col-span-7">
          <span aria-hidden="true" className="font-serif text-[6rem] font-medium leading-[0.8] text-mist sm:text-[8rem]">
            {letter}
          </span>
          <div className="pb-1">
            <p className="text-caption text-mist">
              {kind} · Pillar {letter}
            </p>
            <h3 className="text-heading mt-2 text-paper">{title}</h3>
          </div>
        </div>
        <p className="text-body max-w-[28rem] text-paper/85 lg:col-span-5 lg:justify-self-end">{text}</p>
      </div>
    </div>
  );
}

export function Systems() {
  const { pillarA, pillarB } = systems;
  return (
    <section id="systems" aria-labelledby="systems-title" className="border-b border-hairline py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={systems.index} label={systems.label} heading={systems.heading} lead={systems.lead} id="systems-title" />

        <div className="mt-14 space-y-8">
          {/* Pillar A */}
          <div className="reveal overflow-hidden rounded-card border border-hairline">
            <Banner tone="blue" letter={pillarA.letter} title={pillarA.title} kind={pillarA.kind} text={pillarA.text} />
            <div className="bg-paper p-6 sm:p-8 lg:p-10">
              <ModuleExplorer />
            </div>
            <div className="grid border-t border-hairline bg-paper md:grid-cols-3">
              {pillarA.modules.map((m, i) => {
                const Wireframe = WIREFRAMES[m.id];
                return (
                  <article
                    key={m.id}
                    className={`reveal p-6 sm:p-8 ${i > 0 ? "border-t border-hairline md:border-l md:border-t-0" : ""}`}
                    style={{ ["--d" as string]: i * 140 }}
                  >
                    <p className="font-mono text-[0.78rem] text-ink-3">A.{i + 1} · Interface wireframe</p>
                    <h4 className="text-body mb-4 mt-1 font-medium text-ink">{m.name}</h4>
                    <Wireframe />
                  </article>
                );
              })}
            </div>
          </div>

          {/* Pillar B */}
          <div className="reveal overflow-hidden rounded-card border border-hairline">
            <Banner tone="ink" letter={pillarB.letter} title={pillarB.title} kind={pillarB.kind} text={pillarB.text} />
            <div className="grid bg-paper md:grid-cols-3">
              {pillarB.items.map((item, i) => (
                <article
                  key={item.title}
                  className={`reveal group flex flex-col p-6 transition-colors duration-500 hover:bg-mist-soft/40 sm:p-8 ${
                    i > 0 ? "border-t border-hairline md:border-l md:border-t-0" : ""
                  }`}
                  style={{ ["--d" as string]: i * 140 }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[0.78rem] text-ink-3">B.{i + 1}</span>
                    <span className="transition-transform duration-500 group-hover:-translate-y-1">
                      <LineIcon name={item.icon as IconName} size={48} />
                    </span>
                  </div>
                  <h4 className="text-title mt-6 text-ink">{item.title}</h4>
                  <p className="text-caption mt-1 text-sanad">{item.tagline}</p>
                  <p className="text-body mt-5 text-[1rem] leading-[1.6]">{item.text}</p>
                  <dl className="mt-auto border-t border-hairline pt-5 [&:not(:first-child)]:mt-8">
                    {item.spec.map(([k, v]) => (
                      <div key={k} className="grid gap-x-3 border-b border-hairline py-2 last:border-b-0">
                        <dt className="text-caption text-ink-3">{k}</dt>
                        <dd className="mono-block m-0 text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
