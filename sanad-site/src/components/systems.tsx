import { LineIcon, type IconName } from "@/components/line-icon";
import { SectionHead } from "@/components/section-head";
import { WIREFRAMES } from "@/components/wireframes";
import { systems, type ModuleSpec } from "@/content/site";

function Schema({ module }: { module: ModuleSpec }) {
  const width = Math.max(...module.schema.map(([n]) => n.length));
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="text-caption mb-2 text-ink-3">Schema</figcaption>
      <pre className="mono-block m-0 overflow-x-auto whitespace-pre-wrap break-words rounded-card border border-hairline bg-paper-deep p-4 text-ink">
        <code>
          <span className="text-sanad">type</span> {module.schemaTitle} {"{"}
          {module.schema.map(([name, type, note]) => (
            <span key={name} className="block pl-4">
              {name.padEnd(width + 1)}
              <span className="text-sanad">{type}</span>
              {note ? <span className="text-ink-3">{"  // " + note}</span> : null}
            </span>
          ))}
          {"}"}
          {module.invariant ? (
            <span className="mt-2 block text-ink-3">{"// invariant: " + module.invariant}</span>
          ) : null}
        </code>
      </pre>
    </figure>
  );
}

function Params({ params }: { params: ModuleSpec["params"] }) {
  return (
    <dl className="m-0 border-t border-hairline">
      {params.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[6.75rem_1fr] gap-x-4 border-b border-hairline py-2">
          <dt className="text-caption text-ink-3">{k}</dt>
          <dd className="mono-block m-0 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Module({ module, index }: { module: ModuleSpec; index: number }) {
  const Wireframe = WIREFRAMES[module.id];
  return (
    <article className="border-t border-hairline p-6 first:border-t-0 sm:p-8">
      <header className="flex items-baseline gap-4">
        <span className="font-mono text-[0.78rem] text-ink-3">A.{index + 1}</span>
        <div>
          <h4 className="text-title text-ink">{module.name}</h4>
          <p className="text-caption mt-1 text-ink-3">{module.summary}</p>
        </div>
      </header>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <figure className="m-0 min-w-0">
          <figcaption className="text-caption mb-2 text-ink-3">Interface wireframe</figcaption>
          <Wireframe />
        </figure>
        <div className="grid min-w-0 content-start gap-5">
          <Schema module={module} />
          <Params params={module.params} />
        </div>
      </div>
    </article>
  );
}

function Panel({
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
      className={`on-ink flex flex-col justify-between p-8 sm:p-10 lg:col-span-4 ${
        tone === "blue" ? "bg-sanad text-paper" : "bg-ink text-paper"
      }`}
    >
      <div className="lg:sticky lg:top-28">
        <p className="text-caption text-mist">Pillar {letter}</p>
        <p aria-hidden="true" className="mt-4 font-serif text-[6.5rem] font-medium leading-none text-mist sm:text-[8rem]">
          {letter}
        </p>
        <h3 className="text-heading mt-8 text-paper">{title}</h3>
        <p className="text-caption mt-3 text-mist">{kind}</p>
        <p className="text-body mt-6 max-w-[22rem] text-paper/85">{text}</p>
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
          <div className="overflow-hidden rounded-card border border-hairline lg:grid lg:grid-cols-12">
            <Panel tone="blue" letter={pillarA.letter} title={pillarA.title} kind={pillarA.kind} text={pillarA.text} />
            <div className="bg-paper lg:col-span-8">
              {pillarA.modules.map((m, i) => (
                <Module key={m.id} module={m} index={i} />
              ))}
            </div>
          </div>

          {/* Pillar B */}
          <div className="overflow-hidden rounded-card border border-hairline lg:grid lg:grid-cols-12">
            <Panel tone="ink" letter={pillarB.letter} title={pillarB.title} kind={pillarB.kind} text={pillarB.text} />
            <div className="grid bg-paper md:grid-cols-3 lg:col-span-8">
              {pillarB.items.map((item, i) => (
                <article
                  key={item.title}
                  className={`flex flex-col p-6 sm:p-8 ${i > 0 ? "border-t border-hairline md:border-l md:border-t-0" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[0.78rem] text-ink-3">B.{i + 1}</span>
                    <LineIcon name={item.icon as IconName} size={44} />
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
