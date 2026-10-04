import { Arrow } from "@/components/arrow";
import { cta, dossierHref, site } from "@/content/site";

export function CtaBand() {
  return (
    <section aria-labelledby="cta-title" className="on-ink relative overflow-hidden bg-sanad text-paper">
      <span aria-hidden="true" className="loop-line loop-drift absolute inset-x-0 top-6 text-mist/25" />
      <span aria-hidden="true" className="loop-line loop-drift absolute inset-x-0 bottom-6 text-mist/25" />
      <div className="wrap relative py-24 sm:py-32">
        <h2 id="cta-title" className="text-display reveal max-w-[20ch] text-paper">
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
