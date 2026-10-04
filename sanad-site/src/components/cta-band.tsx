import { Arrow } from "@/components/arrow";
import { MARK_LINE, MARK_WASH } from "@/components/brand/mark-paths";
import { cta, dossierHref, site } from "@/content/site";

export function CtaBand() {
  return (
    <section aria-labelledby="cta-title" className="on-ink relative overflow-hidden bg-sanad text-paper">
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        className="pointer-events-none absolute -right-[9vw] top-[-9rem] hidden w-[clamp(30rem,52vw,62rem)] lg:block"
      >
        <path d={MARK_WASH} fill="var(--color-signal)" />
        <path d={MARK_LINE} fill="var(--color-paper)" fillRule="evenodd" />
      </svg>
      <span aria-hidden="true" className="loop-line loop-drift absolute bottom-8 left-0 hidden w-[48vw] text-mist/25 lg:block" />
      <div className="wrap relative py-28 sm:py-36">
        <h2 id="cta-title" className="text-display reveal max-w-[16ch] text-paper">
          {cta.line}
        </h2>
        <div className="reveal mt-10 flex flex-wrap items-center gap-x-8 gap-y-4" style={{ ["--d" as string]: 200 }}>
          <a href={dossierHref} className="btn btn-paper">
            Request Technical Dossier
            <Arrow />
          </a>
          <a href={`mailto:${site.email}`} className="text-body text-paper underline decoration-paper/30 underline-offset-[6px] transition-colors hover:decoration-paper">
            or write to {site.email}
          </a>
        </div>
      </div>
    </section>
  );
}
