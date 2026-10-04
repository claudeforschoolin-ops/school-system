import { Arrow } from "@/components/arrow";
import { Mark } from "@/components/brand/mark";
import { HeroSchematic } from "@/components/hero-schematic";
import { CountUp } from "@/components/motion/count-up";
import { dossierHref, hero, heroStats } from "@/content/site";

const delay = (n: number) => ({ ["--d" as string]: n });

export function Hero() {
  const words = hero.headline.split(" ");
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden border-b border-hairline">
      <div className="wrap pb-14 pt-14 sm:pt-20 lg:pb-20 lg:pt-24">
        <p className="text-caption hero-in text-ink-3" style={delay(0)}>
          Enterprise engineering studio · Intelligent software for modern commerce
        </p>

        <div className="grid items-start gap-8 lg:grid-cols-12">
          <h1 id="hero-title" className="text-display mt-6 max-w-[17ch] text-ink sm:max-w-[22ch] lg:col-span-9 lg:max-w-none">
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
          <div className="hero-in hidden lg:col-span-3 lg:mt-8 lg:flex lg:justify-end" style={delay(500)}>
            <Mark size={176} boost={0.4} />
          </div>
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

        <span aria-hidden="true" className="loop-line loop-drift hero-in mt-12 text-ink/30" style={delay(1200)} />

        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-12">
          <dl className="reveal m-0 self-start border-t border-ink lg:sticky lg:top-28 lg:col-span-4">
            {heroStats.map((s) => (
              <div key={s.label} className="border-b border-hairline py-5">
                <dt className="sr-only">{s.label}</dt>
                <dd className="m-0">
                  <span className="text-heading block text-ink">
                    {s.kind === "count" ? <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} /> : s.display}
                  </span>
                  <span className="text-caption mt-1 block text-ink-3">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="min-w-0 lg:col-span-8">
            <HeroSchematic />
          </div>
        </div>
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
