import { SectionHead } from "@/components/section-head";
import { law } from "@/content/site";

export function Law() {
  const { bars } = law;
  return (
    <section id="thirty-percent-law" aria-labelledby="law-title" className="border-b border-hairline py-20 lg:py-28">
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

        <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="reveal min-w-0 lg:col-span-5">
            <p className="text-caption text-ink-3">{law.definition.caption}</p>
            <div className="mt-3 overflow-x-auto rounded-card border border-hairline bg-mist-soft p-5">
              <div className="mono-block min-w-max text-ink">
                {law.definition.lines.map((l) => (
                  <div key={l.code} className="mb-3 last:mb-0">
                    <div>{l.code}</div>
                    <div className="font-sans text-[0.8125rem] text-ink-3">{l.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <figure className="reveal m-0 min-w-0 lg:col-span-7" style={{ ["--d" as string]: 150 }} aria-label={`${bars.caption}: baseline 100, with Sanad at most 70`}>
            <figcaption className="text-caption flex items-baseline justify-between text-ink-3">
              <span>{bars.caption}</span>
              <span className="font-mono text-[0.72rem]">baseline = 100</span>
            </figcaption>
            <div className="mt-4 grid grid-cols-[6.5rem_1fr] items-center gap-x-4 gap-y-4">
              <span className="text-caption text-ink-3">{bars.baseline.label}</span>
              <div className="bar-grow flex h-11 items-center justify-end rounded-control border border-ink bg-mist-soft px-3">
                <span className="font-mono text-[0.8rem] text-ink">{bars.baseline.value}</span>
              </div>

              <span className="text-caption font-medium text-sanad">{bars.sanad.label}</span>
              <div className="flex h-11">
                <div
                  className="bar-grow flex items-center justify-end rounded-l-control bg-sanad px-3"
                  style={{ width: `${bars.sanad.value}%`, ["--d" as string]: 500 }}
                >
                  <span className="font-mono text-[0.8rem] text-paper">{bars.sanad.note}</span>
                </div>
                <div className="flex flex-1 items-center justify-center rounded-r-control border border-dashed border-ink/40 px-2">
                  <span className="text-caption truncate text-ink-3">
                    <span className="max-sm:hidden">{bars.reclaimed}</span>
                    <span className="sm:hidden">≥ 30%</span>
                  </span>
                </div>
              </div>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
