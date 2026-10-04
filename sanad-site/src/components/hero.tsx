import { HeroSchematic } from "@/components/hero-schematic";
import { dossierHref, hero } from "@/content/site";

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="border-b border-hairline">
      <div className="wrap grid gap-14 py-14 sm:py-20 lg:grid-cols-12 lg:gap-12 lg:py-24">
        <div className="lg:col-span-6">
          <p className="text-caption text-ink-3">Enterprise engineering studio · Intelligent software for modern commerce</p>
          <h1 id="hero-title" className="text-display mt-6 text-ink">
            {hero.headline}
          </h1>
          <p className="text-body mt-8 max-w-[35rem]">{hero.sub}</p>

          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a
              href={dossierHref}
              className="text-caption rounded-control border border-ink bg-ink px-5 py-2.5 font-medium text-paper transition-colors hover:bg-paper hover:text-ink"
            >
              Request Technical Dossier
            </a>
            <a href="#thirty-percent-law" className="text-caption font-medium text-sanad underline decoration-sanad/30 underline-offset-4 transition-colors hover:decoration-sanad">
              Read the 30% baseline
            </a>
          </div>

        </div>

        <div className="lg:col-span-6 lg:pt-2">
          <HeroSchematic />
        </div>
      </div>

      <div className="border-t border-hairline">
        <dl className="wrap grid sm:grid-cols-2">
          {hero.perspectives.map((p, i) => (
            <div
              key={p.label}
              className={`py-8 sm:py-10 ${i === 0 ? "sm:pr-10" : "border-t border-hairline sm:border-l sm:border-t-0 sm:pl-10"}`}
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
