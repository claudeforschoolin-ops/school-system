/**
 * Interface wireframes for the Pillar A modules. Fine ink linework, real labels
 * and plausible values, and a wash of Mist where the eye should land.
 */
import type { ReactNode } from "react";

const W = 360;
const H = 236;

function Frame({ id, title, desc, children }: { id: string; title: string; desc: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="block h-auto w-full">
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>{desc}</desc>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="7.5" fill="var(--color-paper)" className="dg-box" strokeOpacity="0.55" />
      {children}
    </svg>
  );
}

const tab = (x: number, label: string, active = false) => (
  <g key={label}>
    <text x={x} y="23" className="dg-text" fontSize="12" fontWeight={active ? 500 : 400} fillOpacity={active ? 1 : 0.55}>
      {label}
    </text>
    {active && <path d={`M${x} 32H${x + label.length * 6.4}`} stroke="var(--color-sanad)" strokeWidth="2" strokeLinecap="round" />}
  </g>
);

export function InventoryWireframe() {
  const cols = [180, 226, 272, 340];
  const rows: [string, number, number, number][] = [
    ["SKU-1042", 128, 64, 0],
    ["SKU-2210", 12, 40, 33],
    ["SKU-3087", 220, 0, 18],
    ["SKU-4410", 7, 7, 7],
    ["SKU-5002", 54, 90, 31],
  ];
  return (
    <Frame id="wf-inv" title="Inventory wireframe" desc="A stock table with one row per SKU and one column per warehouse node, with a sync status line.">
      {tab(16, "Stock", true)}
      {tab(60, "Transfers")}
      {tab(126, "Reservations")}
      <rect x="286" y="9" width="58" height="22" rx="6" className="dg-box" fill="none" />
      <text x="315" y="24" textAnchor="middle" className="dg-text" fontSize="11.5">Transfer</text>
      <path d="M0 40.5H360" className="dg-fine" />

      <g className="dg-mono" fontSize="10.5">
        <text x="16" y="62">SKU</text>
        {["WH-A", "WH-B", "WH-C", "Total"].map((h, i) => (
          <text key={h} x={cols[i]} y="62" textAnchor="end">{h}</text>
        ))}
      </g>
      <path d="M16 70.5H344" className="dg-fine" />

      {/* wash under the two empty cells */}
      <rect x="246" y="78" width="34" height="22" rx="4" fill="var(--color-mist)" />
      <rect x="198" y="128" width="34" height="22" rx="4" fill="var(--color-mist)" />

      {rows.map(([sku, a, b, c], i) => {
        const y = 94 + i * 25;
        const total = a + b + c;
        return (
          <g key={sku}>
            <text x="16" y={y} className="dg-text" fontSize="11.5" fontFamily="var(--font-mono)">{sku}</text>
            {[a, b, c, total].map((v, k) => (
              <text key={k} x={cols[k]} y={y} textAnchor="end" className="dg-text" fontSize="11.5" fontFamily="var(--font-mono)" fontWeight={k === 3 ? 600 : 400}>
                {v}
              </text>
            ))}
            {i < rows.length - 1 && <path d={`M16 ${y + 9.5}H344`} className="dg-fine" strokeOpacity="0.18" />}
          </g>
        );
      })}

      <path d="M0 205.5H360" className="dg-fine" />
      <circle cx="20" cy="221" r="3.5" fill="var(--color-signal)" />
      <text x="30" y="225" className="dg-text" fontSize="11.5">Synced 0.4 s ago</text>
      <text x="344" y="225" textAnchor="end" className="dg-mono" fontSize="10.5">5 SKUs · 3 nodes</text>
    </Frame>
  );
}

export function UnitsWireframe() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const x0 = 70;
  const cw = 41;
  const rows = ["101", "102", "103", "201", "202"];
  type Bar = { row: number; from: number; to: number; kind: "occupied" | "turnover" | "blocked" };
  const bars: Bar[] = [
    { row: 0, from: 0, to: 3, kind: "occupied" },
    { row: 0, from: 3, to: 4, kind: "turnover" },
    { row: 0, from: 4, to: 7, kind: "occupied" },
    { row: 1, from: 0, to: 2, kind: "blocked" },
    { row: 1, from: 2, to: 6, kind: "occupied" },
    { row: 1, from: 6, to: 7, kind: "turnover" },
    { row: 2, from: 1, to: 4, kind: "occupied" },
    { row: 2, from: 4, to: 5, kind: "turnover" },
    { row: 3, from: 0, to: 1, kind: "turnover" },
    { row: 3, from: 1, to: 5, kind: "occupied" },
    { row: 4, from: 2, to: 4, kind: "blocked" },
    { row: 4, from: 4, to: 7, kind: "occupied" },
  ];
  const legend: [string, Bar["kind"]][] = [["Occupied", "occupied"], ["Turnover", "turnover"], ["Blocked", "blocked"]];
  const swatch = (kind: Bar["kind"], x: number, y: number, w: number, h: number) =>
    kind === "occupied" ? (
      <rect x={x} y={y} width={w} height={h} rx="4" fill="var(--color-signal)" />
    ) : kind === "turnover" ? (
      <rect x={x} y={y} width={w} height={h} rx="4" fill="var(--color-mist)" className="dg-box" strokeOpacity="0.5" />
    ) : (
      <rect x={x} y={y} width={w} height={h} rx="4" fill="none" className="dg-box" strokeDasharray="3 3" strokeOpacity="0.6" />
    );
  return (
    <Frame id="wf-units" title="Unit management wireframe" desc="A week timeline with one row per unit. Stays are bars that never overlap; turnover and blocked periods are marked.">
      {tab(16, "Units", true)}
      {tab(62, "Housekeeping")}
      <text x="344" y="23" textAnchor="end" className="dg-mono" fontSize="10.5">This week</text>
      <path d="M0 40.5H360" className="dg-fine" />

      {days.map((d, i) => (
        <text key={d} x={x0 + i * cw + cw / 2} y="59" textAnchor="middle" className="dg-mono" fontSize="10">{d}</text>
      ))}
      <path d="M16 67.5H344" className="dg-fine" />

      {rows.map((r, i) => (
        <g key={r}>
          <text x="16" y={91 + i * 26} className="dg-text" fontSize="11.5" fontFamily="var(--font-mono)">{r}</text>
          {i > 0 && <path d={`M16 ${74.5 + i * 26}H344`} className="dg-fine" strokeOpacity="0.15" />}
        </g>
      ))}
      {days.map((_, i) => (
        <path key={i} d={`M${x0 + i * cw} 68V204`} className="dg-fine" strokeOpacity="0.1" />
      ))}
      {bars.map((b, i) => (
        <g key={i}>{swatch(b.kind, x0 + b.from * cw + 2, 76 + b.row * 26, (b.to - b.from) * cw - 4, 18)}</g>
      ))}

      <path d="M0 212.5H360" className="dg-fine" />
      {legend.map(([label, kind], i) => (
        <g key={label}>
          {swatch(kind, 16 + i * 76, 220, 14, 10)}
          <text x={36 + i * 76} y="229" className="dg-text" fontSize="10.5" fillOpacity="0.7">{label}</text>
        </g>
      ))}
      <text x="344" y="229" textAnchor="end" className="dg-mono" fontSize="10.5">no overlaps</text>
    </Frame>
  );
}

export function LedgerWireframe() {
  return (
    <Frame id="wf-ledger" title="POS ledger wireframe" desc="A point-of-sale receipt posts to a double-entry ledger. Debits equal credits.">
      {tab(16, "Sync", true)}
      {tab(52, "Close")}
      <text x="344" y="23" textAnchor="end" className="dg-mono" fontSize="10.5">live</text>
      <path d="M0 40.5H360" className="dg-fine" />

      {/* receipt */}
      <path d="M18 56h128v118l-8 -6l-8 6l-8 -6l-8 6l-8 -6l-8 6l-8 -6l-8 6l-8 -6l-8 6l-8 -6l-8 6l-8 -6l-8 6l-8 -6l-8 6z" fill="var(--color-mist-soft)" className="dg-box" />
      <text x="30" y="75" className="dg-text" fontSize="10.5" fontFamily="var(--font-mono)">POS #A-10441</text>
      <path d="M30 85H134" className="dg-fine" strokeOpacity="0.3" />
      {[0, 1].map((i) => (
        <g key={i}>
          <path d={`M30 ${99 + i * 16}H${74 + i * 14}`} className="dg-fine" strokeOpacity="0.6" />
        </g>
      ))}
      <text x="134" y="102" textAnchor="end" className="dg-text" fontSize="10.5" fontFamily="var(--font-mono)">24.00</text>
      <text x="134" y="118" textAnchor="end" className="dg-text" fontSize="10.5" fontFamily="var(--font-mono)">18.50</text>
      <path d="M30 128H134" className="dg-fine" strokeOpacity="0.3" />
      <text x="30" y="143" className="dg-mono" fontSize="10">VAT</text>
      <text x="134" y="143" textAnchor="end" className="dg-text" fontSize="10.5" fontFamily="var(--font-mono)">4.25</text>
      <text x="30" y="160" className="dg-text" fontSize="11" fontWeight={600}>Total</text>
      <text x="134" y="160" textAnchor="end" className="dg-text" fontSize="11" fontFamily="var(--font-mono)" fontWeight={600}>46.75</text>

      {/* post */}
      <path d="M154 114H180" className="dg-line" />
      <path d="M174 109l6 5-6 5" className="dg-line" />
      <path d="M154 114H180" stroke="var(--color-signal)" strokeWidth="2.4" strokeLinecap="round" className="dg-flow" fill="none" />

      {/* ledger */}
      <g className="dg-mono" fontSize="10">
        <text x="190" y="64">Account</text>
        <text x="290" y="64" textAnchor="end">Dr</text>
        <text x="344" y="64" textAnchor="end">Cr</text>
      </g>
      <path d="M190 72.5H344" className="dg-fine" />
      {[
        ["1100 Cash", "46.75", ""],
        ["4000 Sales", "", "42.50"],
        ["2200 VAT", "", "4.25"],
      ].map(([a, dr, cr], i) => (
        <g key={a}>
          <text x="190" y={94 + i * 26} className="dg-text" fontSize="11">{a}</text>
          <text x="290" y={94 + i * 26} textAnchor="end" className="dg-text" fontSize="11" fontFamily="var(--font-mono)">{dr || "·"}</text>
          <text x="344" y={94 + i * 26} textAnchor="end" className="dg-text" fontSize="11" fontFamily="var(--font-mono)">{cr || "·"}</text>
          <path d={`M190 ${102.5 + i * 26}H344`} className="dg-fine" strokeOpacity="0.15" />
        </g>
      ))}
      <rect x="190" y="148" width="154" height="26" rx="5" fill="var(--color-mist)" />
      <text x="198" y="165" className="dg-text" fontSize="10.5" fontFamily="var(--font-mono)">Σ Dr = Σ Cr</text>
      <text x="336" y="165" textAnchor="end" className="dg-text" fontSize="10.5" fontFamily="var(--font-mono)" fontWeight={600}>46.75</text>

      <path d="M0 205.5H360" className="dg-fine" />
      <circle cx="20" cy="221" r="3.5" fill="var(--color-signal)" />
      <text x="30" y="225" className="dg-text" fontSize="11.5">Balanced, posted once</text>
      <text x="344" y="225" textAnchor="end" className="dg-mono" fontSize="10.5">idempotent</text>
    </Frame>
  );
}

export const WIREFRAMES = {
  inventory: InventoryWireframe,
  units: UnitsWireframe,
  ledger: LedgerWireframe,
} as const;
