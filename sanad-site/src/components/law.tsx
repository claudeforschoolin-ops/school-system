import { CountUp } from "@/components/motion/count-up";
import { law } from "@/content/site";

/** An outcome word with the wash beneath it, shifted down and right. The wash draws in from the left. */
function Outcome({ children, delay }: { children: string; delay: number }) {
  return (
    <span className="hl" style={{ ["--d" as string]: delay }}>
      <span className="hl-text">{children}</span>
    </span>
  );
}

export function Law() {
  const { proof } = law;
  return (
    <section
      id="thirty-percent-law"
      data-section
      data-n="01"
      data-label="The 30% Law"
      aria-labelledby="law-title"
      className="border-b border-hairline py-24 lg:py-32"
    >
      <div className="wrap grid gap-14 lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:gap-16">
        <div className="reveal">
          <h2 id="law-title" className="text-heading text-ink">
            {law.heading}
          </h2>
          <p
            className="mt-10 max-w-[60rem] font-serif font-medium leading-[1.3] tracking-[-0.015em] text-ink lg:mt-12"
            style={{ fontSize: "clamp(1.875rem, 1.1rem + 2.5vw, 3.375rem)" }}
          >
            {law.narrative.map((n, i) => (
              <span key={n.outcome}>
                {n.lead}
                <span className="whitespace-nowrap">
                  <Outcome delay={500 + i * 450}>{n.outcome}</Outcome>
                  {n.end}
                </span>
                {i < law.narrative.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        </div>

        <aside
          className="reveal flex flex-col justify-between gap-12 border-t border-ink/20 pt-8 lg:min-h-[28rem] lg:border-l lg:border-t-0 lg:pl-7 lg:pt-1"
          style={{ ["--d" as string]: 200 }}
        >
          <p className="text-caption text-ink-3">
            <span className="mr-2.5 font-serif text-[1.375rem] font-medium text-sanad">{law.index}</span>
            {law.label}
          </p>
          <div>
            <p
              className="font-serif font-medium leading-none tracking-[-0.02em] text-sanad"
              style={{ fontSize: "clamp(3.5rem, 2rem + 4vw, 5.25rem)" }}
              aria-label={`At least ${proof.figure} percent`}
            >
              <CountUp to={proof.figure} prefix="≥ " suffix="%" />
            </p>
            <p className="text-title mt-3 text-[1.25rem] leading-snug text-ink">{proof.text}</p>
            <p className="text-caption mt-5 text-ink-3">{proof.caption}</p>
          </div>
        </aside>
      </div>

      {/* the full comparison, for screen readers and search */}
      <div className="sr-only">
      <table>
        <caption>Operational load before and after Sanad, by workstream</caption>
        <thead>
          <tr>
            <th scope="col">Workstream</th>
            <th scope="col">Before</th>
            <th scope="col">With Sanad</th>
          </tr>
        </thead>
        <tbody>
          {law.rows.map((r) => (
            <tr key={r.workstream}>
              <th scope="row">{r.workstream}</th>
              <td>{r.before}</td>
              <td>{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
