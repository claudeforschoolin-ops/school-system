import { CountUp } from "@/components/motion/count-up";
import { SectionHead } from "@/components/section-head";
import { law } from "@/content/site";

export function Law() {
  const { proof } = law;
  return (
    <section id="thirty-percent-law" data-section data-n="01" data-label="The 30% Law" aria-labelledby="law-title" className="border-b border-hairline py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={law.index} label={law.label} heading={law.heading} lead={law.lead} id="law-title" />

        <table className="reveal mt-14 block w-full border-t border-ink text-left md:table">
          <caption className="sr-only">
            Operational load before and after Sanad, by workstream
          </caption>
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-hairline">
              <th scope="col" className="text-caption w-[34%] py-3 pr-8 font-normal text-ink-3">
                Workstream
              </th>
              <th scope="col" className="text-caption w-[33%] py-3 pr-8 font-normal text-ink-3">
                Before
              </th>
              <th scope="col" className="text-caption w-[33%] py-3 font-normal text-sanad">
                With Sanad
              </th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {law.rows.map((row, i) => (
              <tr key={row.workstream} className="group block border-b border-hairline py-6 transition-colors duration-500 hover:bg-mist-soft/50 md:table-row md:py-0">
                <th scope="row" className="block pb-3 text-left font-normal md:table-cell md:py-9 md:pb-9 md:pr-8 md:align-top">
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono text-[0.78rem] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-title text-ink">{row.workstream}</span>
                  </span>
                </th>
                <td className="block py-2 md:table-cell md:py-9 md:pr-8 md:align-top">
                  <span className="text-caption mb-1 block text-ink-3 md:hidden">Before</span>
                  <span className="text-heading block text-ink-3">{row.before.value}</span>
                  <span className="text-caption mt-2 block max-w-[17rem] text-ink-3">{row.before.note}</span>
                </td>
                <td className="block py-2 md:table-cell md:py-9 md:align-top">
                  <span className="text-caption mb-1 block text-sanad md:hidden">With Sanad</span>
                  <span className="text-heading block text-sanad">{row.after.value}</span>
                  <span className="text-caption mt-2 block max-w-[17rem] text-ink-2">{row.after.note}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-24 grid items-end gap-10 lg:grid-cols-12 lg:gap-12">
          <p className="text-display reveal lg:col-span-4" aria-label={`At least ${proof.figure} percent`}>
            <CountUp to={proof.figure} prefix="≥ " suffix="%" />
          </p>
          <div className="reveal lg:col-span-8" style={{ ["--d" as string]: 150 }}>
            <p className="text-title max-w-[34rem] text-ink">{proof.text}</p>
            <p className="text-caption mt-1 text-ink-3">{proof.caption}</p>
            <div className="mt-8 flex h-2.5 overflow-hidden rounded-[3px]" role="img" aria-label={`${proof.kept}. ${proof.reclaimed}.`}>
              <span className="bar-grow block w-[70%] bg-sanad" style={{ ["--d" as string]: 400 }} />
              <span className="bar-grow block flex-1 bg-mist" style={{ ["--d" as string]: 900 }} />
            </div>
            <div className="text-caption mt-3 flex justify-between text-ink-3">
              <span>{proof.kept}</span>
              <span>{proof.reclaimed}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
