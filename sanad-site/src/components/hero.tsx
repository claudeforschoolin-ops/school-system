import { Arrow } from "@/components/arrow";
import { FLOW_COMPACT, FLOW_WIDE, Flow } from "@/components/flow";
import { dossierHref, hero, systems } from "@/content/site";

const delay = (n: number) => ({ ["--d" as string]: n });
const sources = systems.pillarA.modules.flatMap((m) => m.sources);

export function Hero() {
  const words = hero.headline.split(" ");
  return (
    <section
      id="top"
      data-section
      data-n=""
      data-label="Enterprise engineering studio"
      aria-labelledby="hero-title"
      className="relative overflow-hidden border-b border-hairline"
    >
      <div className="wrap pb-16 pt-14 sm:pt-20 lg:pb-24 lg:pt-24">
        <p className="text-caption hero-in text-ink-3" style={delay(0)}>
          Enterprise engineering studio · Intelligent software for modern commerce
        </p>

        <div className="grid items-start gap-8 lg:grid-cols-12">
          <h1 id="hero-title" className="text-display mt-6 max-w-[17ch] text-ink sm:max-w-[22ch] lg:col-span-12 lg:max-w-none">
            {words.map((w, i) => (
              <span key={i}>
                <span className="word-mask">
                  <span className="word" style={{ ["--i" as string]: i }}>
                    {w}
                  </span>
                </span>
                {i < words.length - 1 ? " " : ""}
              </span>
            ))}
          </h1>
        </div>

        <div className="mt-10 grid gap-8 lg:mt-12 lg:grid-cols-12 lg:items-end lg:gap-10">
          <p className="text-body hero-in max-w-[38rem] lg:col-span-6" style={delay(900)}>
            {hero.sub}
          </p>
          <div className="hero-in flex flex-wrap items-center gap-x-8 gap-y-4 lg:col-span-5 lg:col-start-8 lg:justify-end" style={delay(1050)}>
            <a href={dossierHref} className="btn btn-solid">
              Request Technical Dossier
              <Arrow />
            </a>
            <a
              href="#thirty-percent-law"
              className="text-caption font-medium text-sanad underline decoration-sanad/30 underline-offset-4 transition-colors hover:decoration-sanad"
            >
              Read the 30% baseline
            </a>
          </div>
        </div>

        <figure className="intro m-0 mt-20 lg:mt-24">
          <div className="hidden md:block">
            <Flow g={FLOW_WIDE} id="flow-wide" sources={sources} intro />
          </div>
          <div className="mx-auto max-w-[24rem] md:hidden">
            <Flow g={FLOW_COMPACT} id="flow-compact" sources={sources} intro />
          </div>
          <figcaption className="text-caption mt-6 max-w-[34rem] text-ink-3">
            Enterprise data streams gather in the Sanad Core, then synchronize out to infrastructure the client controls.
          </figcaption>
        </figure>
      </div>

      <div className="border-t border-hairline">
        <dl className="wrap grid sm:grid-cols-2">
          {hero.perspectives.map((p, i) => (
            <div
              key={p.label}
              className={`reveal py-8 sm:py-10 ${i === 0 ? "sm:pr-10" : "border-t border-hairline sm:border-l sm:border-t-0 sm:pl-10"}`}
              style={delay(i * 140)}
            >
              <dt className="text-caption font-medium text-sanad">{p.label}</dt>
              <dd className="text-title mt-2 max-w-[30rem] leading-snug text-ink">{p.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
