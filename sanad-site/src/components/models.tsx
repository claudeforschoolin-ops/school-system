import { SectionHead } from "@/components/section-head";
import { models } from "@/content/site";

export function Models() {
  const [a, b] = models.columns;
  return (
    <section id="models" data-section data-n="06" data-label="Engagement" aria-labelledby="models-title" className="bg-mist-soft py-24 lg:py-32">
      <div className="wrap">
        <SectionHead index={models.index} label={models.label} heading={models.heading} id="models-title" />

        <div className="reveal mt-16">
          <div className="hidden md:grid md:grid-cols-[11rem_1fr_1fr]">
            <div />
            <div className="on-ink rounded-t-card bg-sanad px-6 py-5 text-paper">
              <p className="text-caption text-mist">{a.kind}</p>
              <p className="text-title mt-1">{a.title}</p>
            </div>
            <div className="on-ink rounded-t-card bg-ink px-6 py-5 text-paper">
              <p className="text-caption text-mist">{b.kind}</p>
              <p className="text-title mt-1">{b.title}</p>
            </div>
          </div>
          {models.rows.map(([label, ta, tb], i) => (
            <div
              key={label}
              className="reveal grid border-t border-ink/15 transition-colors duration-500 first:border-t-0 hover:bg-paper/50 md:grid-cols-[11rem_1fr_1fr] md:first:border-t-0"
              style={{ ["--d" as string]: i * 80 }}
            >
              <p className="text-caption px-6 pt-5 font-medium text-ink-3 md:py-6">{label}</p>
              <p className="text-body px-6 pb-2 pt-2 md:py-6">
                <span className="text-caption mb-1 block font-medium text-sanad md:hidden">{a.title}</span>
                {ta}
              </p>
              <p className="text-body px-6 pb-5 pt-2 md:py-6">
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
