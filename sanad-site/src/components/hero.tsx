import { Arrow } from "@/components/arrow";
import { MARK_LINE, MARK_WASH } from "@/components/brand/mark-paths";
import { dossierHref, hero } from "@/content/site";

const delay = (n: number) => ({ ["--d" as string]: n });

/**
 * The head from the symbol, drawn large and cropped by the page: the wash settles,
 * then the single ink line is drawn down it. On wide screens it sits behind the right
 * side of the hero; on narrow screens it follows the text and is cropped from below.
 */
function HeadArt() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative mt-14 h-[25rem] overflow-hidden sm:h-[30rem] lg:absolute lg:inset-0 lg:mt-0 lg:h-auto"
    >
      <svg
        viewBox="0 0 64 64"
        className="absolute -right-24 top-0 w-[34rem] max-w-none sm:-right-16 sm:w-[40rem] lg:-top-[30px] lg:-right-[11.8vw] lg:w-[clamp(34rem,69vw,80rem)]"
      >
        <path className="head-wash" d={MARK_WASH} fill="var(--color-mist)" />
        <path className="head-line" d={MARK_LINE} fill="var(--color-ink)" fillRule="evenodd" />
      </svg>
    </div>
  );
}

export function Hero() {
  const words = hero.headline.split(" ");
  return (
    <>
      <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden bg-sanad text-paper">
        <div className="wrap relative z-10 pb-4 pt-14 sm:pt-20 lg:flex lg:min-h-[48rem] lg:items-center lg:py-20">
          <div className="lg:max-w-[38rem]">
            <p className="text-caption hero-in text-paper/65" style={delay(0)}>
              Enterprise engineering studio · Intelligent software for modern commerce
            </p>
            <h1 id="hero-title" className="text-display mt-6 max-w-[15ch] text-paper">
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
            <p className="text-body hero-in mt-8 max-w-[32rem] text-paper/85" style={delay(900)}>
              {hero.sub}
            </p>
            <div className="hero-in mt-10 flex flex-wrap items-center gap-x-8 gap-y-4" style={delay(1050)}>
              <a href={dossierHref} className="btn btn-paper">
                Request Technical Dossier
                <Arrow />
              </a>
              <a
                href="#thirty-percent-law"
                className="text-caption font-medium text-paper underline decoration-paper/45 underline-offset-4 transition-colors hover:decoration-paper"
              >
                Read the 30% baseline
              </a>
            </div>
          </div>
        </div>

        <HeadArt />
        <span aria-hidden="true" className="loop-line loop-drift absolute bottom-9 left-0 hidden w-[51vw] text-mist/30 lg:block" />
      </section>

      <div className="border-b border-hairline">
        <dl className="wrap grid sm:grid-cols-2">
          {hero.perspectives.map((p, i) => (
            <div
              key={p.label}
              className={`reveal py-9 sm:py-12 ${i === 0 ? "sm:pr-10" : "border-t border-hairline sm:border-l sm:border-t-0 sm:pl-10"}`}
              style={delay(i * 140)}
            >
              <dt className="text-caption font-medium text-sanad">{p.label}</dt>
              <dd className="text-title mt-2 max-w-[30rem] leading-snug text-ink">{p.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
