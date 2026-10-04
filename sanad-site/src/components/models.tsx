import { SectionHead } from "@/components/section-head";
import { models } from "@/content/site";

export function Models() {
  const [a, b] = models.columns;
  return (
    <section id="models" data-section data-n="06" data-label="Engagement" aria-labelledby="models-title" className="border-b border-hairline py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={models.index} label={models.label} heading={models.heading} id="models-title" />

        <div className="reveal mt-14 overflow-hidden rounded-card border border-hairline">
          <div className="hidden md:grid md:grid-cols-[11rem_1fr_1fr]">
            <div className="bg-paper" />
            <div className="on-ink bg-sanad px-6 py-5 text-paper">
              <p className="text-caption text-mist">{a.kind}</p>
              <p className="text-title mt-1">{a.title}</p>
            </div>
            <div className="on-ink bg-ink px-6 py-5 text-paper">
              <p className="text-caption text-mist">{b.kind}</p>
              <p className="text-title mt-1">{b.title}</p>
            </div>
          </div>
          {models.rows.map(([label, ta, tb], i) => (
            <div
              key={label}
              className="reveal grid border-t border-hairline bg-paper transition-colors duration-500 first:border-t-0 hover:bg-mist-soft/40 md:grid-cols-[11rem_1fr_1fr] md:first:border-t"
              style={{ ["--d" as string]: i * 80 }}
            >
              <p className="text-caption px-6 pt-5 font-medium text-ink-3 md:py-6">{label}</p>
              <p className="text-body px-6 pb-2 pt-2 md:border-l md:border-hairline md:py-6">
                <span className="text-caption mb-1 block font-medium text-sanad md:hidden">{a.title}</span>
                {ta}
              </p>
              <p className="text-body px-6 pb-5 pt-2 md:border-l md:border-hairline md:py-6">
                <span className="text-caption mb-1 block font-medium text-ink md:hidden">{b.title}</span>
                {tb}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
