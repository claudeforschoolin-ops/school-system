import type { ModuleSpec } from "@/content/site";

export function Schema({ module }: { module: ModuleSpec }) {
  const width = Math.max(...module.schema.map(([n]) => n.length));
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="text-caption mb-2 text-ink-3">Schema</figcaption>
      <pre className="mono-block m-0 overflow-x-auto whitespace-pre-wrap break-words rounded-card border border-hairline bg-paper-deep p-4 text-ink">
        <code>
          <span className="text-sanad">type</span> {module.schemaTitle} {"{"}
          {module.schema.map(([name, type, note]) => (
            <span key={name} className="block pl-4">
              {name.padEnd(width + 1)}
              <span className="text-sanad">{type}</span>
              {note ? <span className="text-ink-3">{"  // " + note}</span> : null}
            </span>
          ))}
          {"}"}
          {module.invariant ? (
            <span className="mt-2 block text-ink-3">{"// invariant: " + module.invariant}</span>
          ) : null}
        </code>
      </pre>
    </figure>
  );
}

export function Params({ params }: { params: ModuleSpec["params"] }) {
  return (
    <div className="min-w-0">
      <p className="text-caption mb-2 text-ink-3">Parameters</p>
      <dl className="m-0 border-t border-hairline">
        {params.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6.75rem_1fr] gap-x-4 border-b border-hairline py-2">
            <dt className="text-caption text-ink-3">{k}</dt>
            <dd className="mono-block m-0 text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
