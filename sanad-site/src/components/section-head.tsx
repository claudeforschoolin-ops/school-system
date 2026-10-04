type Props = {
  index: string;
  label: string;
  heading: string;
  lead?: string;
  /** Quiet caption line under the heading, e.g. who the section is for. */
  note?: string;
  id?: string;
};

/** Folio number and label on the left, heading and lead on the right: a monograph's running order. */
export function SectionHead({ index, label, heading, lead, note, id }: Props) {
  return (
    <header className="reveal grid gap-5 lg:grid-cols-12 lg:gap-10">
      <p className="text-caption flex items-baseline gap-3 self-start lg:col-span-4 lg:pt-3">
        <span className="font-serif text-[1.375rem] font-medium text-sanad">{index}</span>
        <span className="text-ink-3">{label}</span>
      </p>
      <div className="lg:col-span-8">
        <h2 id={id} className="text-heading max-w-[28ch] text-ink">
          {heading}
        </h2>
        {lead ? <p className="text-body mt-5 max-w-[40rem]">{lead}</p> : null}
        {note ? <p className="text-caption mt-4 text-ink-3">{note}</p> : null}
      </div>
    </header>
  );
}
