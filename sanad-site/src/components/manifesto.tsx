import { Mark } from "@/components/brand/mark";
import { manifesto, site } from "@/content/site";

/** A page from an architectural monograph: one column, ruled on both sides, set on Mist. */
export function Manifesto() {
  return (
    <section id="company" aria-labelledby="manifesto-title" className="relative overflow-hidden bg-mist py-16 text-ink sm:py-24">
      <span aria-hidden="true" className="loop-line absolute inset-x-0 top-6 opacity-30" />
      <span aria-hidden="true" className="loop-line absolute inset-x-0 bottom-6 opacity-30" />

      <div className="wrap relative">
        <div className="mx-auto max-w-[46rem] border-x border-ink/20 bg-mist px-6 py-14 text-center sm:px-16 sm:py-20">
          <div className="text-caption flex items-baseline justify-between text-ink/70">
            <span>{manifesto.label}</span>
            <span className="font-serif text-[1.375rem] font-medium text-sanad">{manifesto.index}</span>
          </div>

          <h2 id="manifesto-title" className="text-heading mx-auto mt-14 max-w-[20ch] text-ink">
            {manifesto.heading}
          </h2>
          <p className="text-body mx-auto mt-8 max-w-[36rem] text-ink/90">{manifesto.body}</p>

          <div className="mt-14 flex flex-col items-center gap-4">
            <Mark size={40} boost={1.4} />
            <p className="font-serif text-[1.375rem] italic text-ink">{site.tagline}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
