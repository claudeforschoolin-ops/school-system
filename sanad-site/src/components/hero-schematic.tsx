/**
 * Hero schematic: how enterprise data streams route into the Sanad Core modules,
 * and synchronize out to client-controlled infrastructure.
 *
 * Fine ink linework on paper, with the brand's Mist wash sitting under the Core,
 * shifted down and right. Two geometries share one drawing routine: a wide sheet
 * and a compact one, so labels stay readable on phones instead of shrinking.
 */

type Row = { module: string; sub: string; sources: [string, string]; short: [string, string] };

const ROWS: Row[] = [
  {
    module: "Ledger",
    sub: "double-entry",
    sources: ["Point of sale", "Payment gateways"],
    short: ["POS", "Payments"],
  },
  {
    module: "Inventory",
    sub: "stock · nodes",
    sources: ["Warehouse scanners", "3PL & logistics"],
    short: ["Scanners", "3PL"],
  },
  {
    module: "Units",
    sub: "stays · availability",
    sources: ["Booking channels", "Property systems"],
    short: ["Bookings", "Property"],
  },
];

type Geo = {
  w: number;
  h: number;
  coreY: number;
  coreH: number;
  firstModTop: number;
  pitch: number;
  modH: number;
  srcW: number;
  srcH: number;
  srcGap: number;
  busX: number;
  coreX: number;
  coreW: number;
  modX: number;
  modW: number;
  outBusX: number;
  clientX: number;
  font: number;
  monoFont: number;
  compact: boolean;
};

const WIDE: Geo = {
  w: 640,
  h: 440,
  coreY: 52,
  coreH: 372,
  firstModTop: 108,
  pitch: 100,
  modH: 84,
  srcW: 172,
  srcH: 38,
  srcGap: 10,
  busX: 200,
  coreX: 232,
  coreW: 196,
  modX: 248,
  modW: 164,
  outBusX: 452,
  clientX: 480,
  font: 15,
  monoFont: 12,
  compact: false,
};

const COMPACT: Geo = {
  w: 340,
  h: 400,
  coreY: 40,
  coreH: 344,
  firstModTop: 92,
  pitch: 96,
  modH: 72,
  srcW: 94,
  srcH: 34,
  srcGap: 8,
  busX: 112,
  coreX: 132,
  coreW: 116,
  modX: 140,
  modW: 100,
  outBusX: 262,
  clientX: 276,
  font: 12.5,
  monoFont: 10,
  compact: true,
};

function Diagram({ g, id }: { g: Geo; id: string }) {
  const centers = ROWS.map((_, i) => g.firstModTop + i * g.pitch + g.modH / 2);
  const midY = centers[1] as number;
  const clientW = g.w - g.clientX;
  const dbCx = g.clientX + clientW / 2;
  const dbRx = g.compact ? 17 : 28;
  const dbRy = g.compact ? 6 : 9;
  const dbTop = g.compact ? 170 : 168;
  const dbH = g.compact ? 40 : 52;

  return (
    <svg
      viewBox={`0 0 ${g.w} ${g.h}`}
      role="img"
      aria-labelledby={`${id}-t ${id}-d`}
      className="block h-auto w-full"
    >
      <title id={`${id}-t`}>Data routing into Sanad Core</title>
      <desc id={`${id}-d`}>
        Six enterprise data sources feed three Sanad Core modules: Ledger, Inventory and Units. The
        modules synchronize to a client-controlled database inside the client&apos;s own infrastructure.
      </desc>
      <defs>
        <pattern id={`${id}-grid`} width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0H0V32" fill="none" stroke="#161616" strokeOpacity="0.055" strokeWidth="1" />
        </pattern>
        <marker
          id={`${id}-ah`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="9"
          markerHeight="9"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M1.5 1.5L8 5L1.5 8.5" className="dg-line" />
        </marker>
      </defs>

      <rect width={g.w} height={g.h} fill={`url(#${id}-grid)`} />

      <text x="0" y="20" className="dg-mono" fontSize={g.monoFont}>
        {g.compact ? "DATA STREAMS" : "ENTERPRISE DATA STREAMS"}
      </text>

      {/* Mist wash under the Core, shifted down and right */}
      <rect
        x={g.coreX + 9}
        y={g.coreY + 9}
        width={g.coreW}
        height={g.coreH}
        rx="8"
        fill="var(--color-mist)"
      />
      <rect x={g.coreX} y={g.coreY} width={g.coreW} height={g.coreH} rx="8" fill="var(--color-paper)" className="dg-box" />
      <text
        x={g.coreX + 16}
        y={g.coreY + (g.compact ? 26 : 30)}
        fontFamily="var(--font-serif)"
        fontWeight={500}
        fontSize={g.compact ? 16 : 20}
        fill="#161616"
      >
        Sanad Core
      </text>
      {!g.compact && (
        <text x={g.coreX + 16} y={g.coreY + 48} className="dg-mono" fontSize={g.monoFont}>
          deterministic APIs
        </text>
      )}

      {/* Client-controlled infrastructure */}
      <rect
        x={g.clientX}
        y={g.coreY}
        width={clientW}
        height={g.coreH}
        rx="8"
        fill="var(--color-paper)"
        className="dg-box"
        strokeDasharray="4 5"
      />
      {g.compact ? (
        <>
          <text x={dbCx} y={g.coreY + 24} textAnchor="middle" className="dg-text" fontSize="11.5" fontWeight={500}>
            Client
          </text>
          <text x={dbCx} y={g.coreY + 39} textAnchor="middle" className="dg-mono" fontSize="10">
            infra
          </text>
        </>
      ) : (
        <>
          <text x={g.clientX + 16} y={g.coreY + 30} className="dg-text" fontSize="14" fontWeight={500}>
            Client-controlled
          </text>
          <text x={g.clientX + 16} y={g.coreY + 48} className="dg-mono" fontSize={g.monoFont}>
            infrastructure
          </text>
        </>
      )}

      {/* database cylinder */}
      <g className="dg-box">
        <ellipse cx={dbCx} cy={dbTop} rx={dbRx} ry={dbRy} fill="var(--color-mist-soft)" />
        <path fill="none" d={`M${dbCx - dbRx} ${dbTop}V${dbTop + dbH}A${dbRx} ${dbRy} 0 0 0 ${dbCx + dbRx} ${dbTop + dbH}V${dbTop}`} />
        <path fill="none" d={`M${dbCx - dbRx} ${dbTop + dbH / 2}A${dbRx} ${dbRy} 0 0 0 ${dbCx + dbRx} ${dbTop + dbH / 2}`} />
      </g>
      <text
        x={dbCx}
        y={dbTop + dbH + (g.compact ? 24 : 30)}
        textAnchor="middle"
        className="dg-text"
        fontSize={g.compact ? 11.5 : 13}
      >
        {g.compact ? "Database" : "Client database"}
      </text>
      {!g.compact && (
        <text x={dbCx} y={dbTop + dbH + 46} textAnchor="middle" className="dg-mono" fontSize={g.monoFont}>
          synchronized
        </text>
      )}

      {/* audit log: a ruled sheet */}
      {!g.compact && (
        <g>
          <rect x={g.clientX + 18} y={g.coreY + 276} width={clientW - 36} height="68" rx="6" className="dg-fine" fill="var(--color-paper)" />
          <path d={`M${g.clientX + 32} ${g.coreY + 296}H${g.clientX + clientW - 50}M${g.clientX + 32} ${g.coreY + 310}H${g.clientX + clientW - 70}M${g.clientX + 32} ${g.coreY + 324}H${g.clientX + clientW - 56}`} className="dg-fine" />
          <text x={g.clientX + 18} y={g.coreY + 364} className="dg-mono" fontSize={g.monoFont}>
            audit log
          </text>
        </g>
      )}

      {ROWS.map((row, i) => {
        const cy = centers[i] as number;
        const top = cy - g.modH / 2;
        const s1 = cy - g.srcGap / 2 - g.srcH / 2;
        const s2 = cy + g.srcGap / 2 + g.srcH / 2;
        const labels = g.compact ? row.short : row.sources;
        const rightEdge = g.srcW;
        const into = `M${rightEdge} ${s1}H${g.busX}V${cy}H${g.modX}`;
        const merge = `M${rightEdge} ${s2}H${g.busX}V${cy}`;
        const out = i === 1 ? `M${g.modX + g.modW} ${cy}H${g.clientX}` : `M${g.modX + g.modW} ${cy}H${g.outBusX}V${midY}`;
        return (
          <g key={row.module}>
            {[s1, s2].map((sy, k) => (
              <g key={k}>
                <rect x="0" y={sy - g.srcH / 2} width={g.srcW} height={g.srcH} rx="6" fill="var(--color-paper)" className="dg-box" />
                <text x="12" y={sy + g.font * 0.35} className="dg-text" fontSize={g.font}>
                  {labels[k]}
                </text>
              </g>
            ))}

            <path d={into} className="dg-line" markerEnd={`url(#${id}-ah)`} />
            <path d={merge} className="dg-line" />
            <path d={out} className="dg-line" markerEnd={i === 1 ? `url(#${id}-ah)` : undefined} />
            <path d={into} className="dg-flow" stroke="var(--color-signal)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d={merge} className="dg-flow" stroke="var(--color-signal)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d={out} className="dg-flow" stroke="var(--color-signal)" strokeWidth="2.4" strokeLinecap="round" fill="none" />

            <rect x={g.modX} y={top} width={g.modW} height={g.modH} rx="6" fill="var(--color-paper)" className="dg-box" />
            <circle cx={g.modX + 14} cy={top + (g.compact ? 20 : 24)} r="3.5" fill="var(--color-signal)" />
            <text x={g.modX + 26} y={top + (g.compact ? 24 : 28.5)} className="dg-text" fontSize={g.compact ? 14 : 16} fontWeight={500}>
              {row.module}
            </text>
            <text x={g.modX + 14} y={top + g.modH - (g.compact ? 16 : 20)} className="dg-mono" fontSize={g.monoFont}>
              {g.compact ? row.sub.split(" · ")[0] : row.sub}
            </text>
          </g>
        );
      })}

      {/* bus into the client box */}
      <path d={`M${g.outBusX} ${centers[0]}V${centers[2]}`} className="dg-line" />
    </svg>
  );
}

export function HeroSchematic() {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-card border border-hairline bg-paper">
        <div className="text-caption flex items-center justify-between border-b border-hairline px-4 py-2.5 text-ink-3">
          <span className="font-mono text-[0.72rem] tracking-wide">FIG. 1</span>
          <span>Data routing into Sanad Core</span>
        </div>
        <div className="p-3 sm:p-4">
          <div className="hidden sm:block">
            <Diagram g={WIDE} id="hs-wide" />
          </div>
          <div className="sm:hidden">
            <Diagram g={COMPACT} id="hs-compact" />
          </div>
        </div>
      </div>
      <figcaption className="text-caption mt-3 max-w-[34rem] text-ink-3">
        Enterprise data streams route into the Sanad Core modules, then synchronize out to infrastructure the
        client controls.
      </figcaption>
    </figure>
  );
}
