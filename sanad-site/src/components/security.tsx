import { LineIcon } from "@/components/line-icon";
import { SectionHead } from "@/components/section-head";
import { security } from "@/content/site";

export function Security() {
  return (
    <section id="security" data-section data-n="04" data-label="Security" aria-labelledby="security-title" className="border-b border-hairline py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={security.index} label={security.label} heading={security.heading} lead={security.lead} id="security-title" />

        <div className="mt-14 grid gap-10 lg:grid-cols-12 lg:gap-10">
          <div className="reveal lg:col-span-4">
            <LineIcon name="security" size={104} />
            <p className="text-caption mt-8 max-w-[22rem] italic text-ink-3">{security.note}</p>
          </div>
          <dl className="m-0 border-t border-ink lg:col-span-8">
            {security.rows.map(([k, v], i) => (
              <div
                key={k}
                className="reveal group grid grid-cols-[2.25rem_1fr] items-baseline gap-x-4 border-b border-hairline py-5 transition-colors duration-500 hover:bg-mist-soft/50 sm:grid-cols-[2.25rem_11rem_1fr] sm:px-2"
                style={{ ["--d" as string]: i * 90 }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="translate-y-[3px]" fill="none">
                  <circle cx="10" cy="10" r="9" stroke="var(--color-ink)" strokeOpacity="0.25" />
                  <path d="M5.5 10.5l3 3 6-7" pathLength={1} className="tick" stroke="var(--color-sanad)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ ["--d" as string]: i * 90 }} />
                </svg>
                <dt className="text-title text-ink">{k}</dt>
                <dd className="text-body m-0 col-span-2 col-start-1 mt-1 sm:col-span-1 sm:col-start-3 sm:mt-0">{v}</dd>
              </div>
            ))}
          </dl>

        </div>
      </div>
    </section>
  );
}
