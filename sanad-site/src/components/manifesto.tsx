import { Mark } from "@/components/brand/mark";
import { WordReveal } from "@/components/motion/word-reveal";
import { manifesto, site } from "@/content/site";

/** A page from an architectural monograph: a numeral in the margin, one ruled column of text, set on Mist. */
export function Manifesto() {
  return (
    <section id="company" data-section data-n="08" data-label="Company" aria-labelledby="manifesto-title" className="relative overflow-hidden bg-mist py-20 text-ink sm:py-28">
      <span aria-hidden="true" className="loop-line loop-drift absolute inset-x-0 top-5 text-ink/25" />
      <span aria-hidden="true" className="loop-line loop-drift absolute inset-x-0 bottom-5 text-ink/25" />

      <div className="wrap relative grid gap-12 py-10 lg:grid-cols-12 lg:gap-10">
        <div className="reveal lg:col-span-4">
          <p aria-hidden="true" className="font-serif text-[7rem] font-medium leading-[0.85] text-sanad sm:text-[10rem]">
            {manifesto.index}
          </p>
          <p className="text-caption mt-6 text-ink/70">{manifesto.label}</p>
          <div className="mt-12 hidden lg:block">
            <Mark size={56} boost={1.2} />
          </div>
        </div>

        <div className="border-ink/20 lg:col-span-8 lg:border-l lg:pl-14">
          <h2 id="manifesto-title" className="text-heading reveal max-w-[22ch] text-ink">
            {manifesto.heading}
          </h2>
          <WordReveal text={manifesto.body} className="text-body mt-10 max-w-[40rem] text-ink" />
          <p className="reveal mt-14 font-serif text-[1.375rem] italic text-ink">{site.tagline}</p>
        </div>
      </div>
    </section>
  );
}
