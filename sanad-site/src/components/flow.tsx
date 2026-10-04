/**
 * The Sanad flow drawing: data streams curve in from the left, gather in the
 * Sanad Core, and leave for infrastructure the client controls.
 *
 * One ink line with round ends, a wash of Mist under the Core shifted down and
 * right, nothing else. Labels are plain type, not boxes.
 *
 * With `intro`, the drawing builds itself when it scrolls into view.
 */

type Geo = {
  w: number;
  h: number;
  dotX: number;
  labelEnd: number;
  cx: number;
  cy: number;
  core: number;
  font: number;
  out: "right" | "down";
  sinkX: number;
  sinkY: number;
  sinkRx: number;
  srcTop: number;
  srcBottom: number;
};

export const FLOW_WIDE: Geo = {
  w: 1200, h: 440, dotX: 330, labelEnd: 312, cx: 640, cy: 220, core: 176, font: 19,
  out: "right", sinkX: 1040, sinkY: 206, sinkRx: 46, srcTop: 46, srcBottom: 394,
};
export const FLOW_MID: Geo = {
  w: 760, h: 340, dotX: 218, labelEnd: 202, cx: 420, cy: 170, core: 124, font: 17,
  out: "right", sinkX: 656, sinkY: 160, sinkRx: 34, srcTop: 50, srcBottom: 290,
};
export const FLOW_COMPACT: Geo = {
  w: 360, h: 500, dotX: 142, labelEnd: 128, cx: 262, cy: 170, core: 88, font: 13.5,
  out: "down", sinkX: 262, sinkY: 372, sinkRx: 26, srcTop: 36, srcBottom: 304,
};

type Core = { kind: "mark" } | { kind: "label"; text: string };

type Props = {
  g: Geo;
  id: string;
  sources: readonly string[];
  core?: Core;
  intro?: boolean;
  title?: string;
};

const d = (n: number) => ({ ["--d" as string]: n });

function Packet({ path, delay }: { path: string; delay: number }) {
  return <circle r="3.6" fill="var(--color-signal)" className="dg-packet" style={{ offsetPath: `path("${path}")`, ...d(delay) }} />;
}

export function Flow({ g, id, sources, core = { kind: "mark" }, intro = false, title = "Data routing into Sanad Core" }: Props) {
  const n = sources.length;
  const ys = sources.map((_, i) =>
    n <= 2 ? g.cy + (i === 0 ? -1 : 1) * (g.srcBottom - g.srcTop) * 0.26 : g.srcTop + ((g.srcBottom - g.srcTop) * i) / (n - 1),
  );
  const coreW = core.kind === "mark" ? g.core : g.core * 1.5;
  const coreH = core.kind === "mark" ? g.core : g.core * 0.78;
  const left = g.cx - coreW / 2;
  const right = g.cx + coreW / 2;
  const top = g.cy - coreH / 2;
  const bottom = g.cy + coreH / 2;
  const pop = intro ? "dg-pop" : "";
  const draw = intro ? "dg-draw" : "";

  const curves = ys.map((y) => {
    const span = left - g.dotX;
    return `M${g.dotX} ${y}C${g.dotX + span * 0.55} ${y} ${left - span * 0.45} ${g.cy} ${left - 4} ${g.cy}`;
  });

  const cylH = g.sinkRx * 1.15;
  const cylRy = g.sinkRx * 0.3;
  const cylTop = g.sinkY - cylH / 2;
  const sinkLeft = g.sinkX - g.sinkRx;
  const out =
    g.out === "right"
      ? `M${right + 4} ${g.cy}C${right + (sinkLeft - right) * 0.45} ${g.cy - 9} ${right + (sinkLeft - right) * 0.6} ${g.sinkY + 9} ${sinkLeft - 10} ${g.sinkY}`
      : `M${g.cx} ${bottom + 4}C${g.cx + 9} ${bottom + (cylTop - bottom) * 0.45} ${g.cx - 9} ${bottom + (cylTop - bottom) * 0.6} ${g.cx} ${cylTop - cylRy - 8}`;

  const small = g.font < 16;
  const labelFont = small ? 12.5 : 15.5;

  return (
    <svg viewBox={`0 0 ${g.w} ${g.h}`} role="img" aria-labelledby={`${id}-t ${id}-d`} className="block h-auto w-full overflow-visible">
      <title id={`${id}-t`}>{title}</title>
      <desc id={`${id}-d`}>
        {sources.join(", ")} feed the Sanad Core, which synchronizes to a client-controlled database inside the
        client&apos;s own infrastructure.
      </desc>

      {/* streams in */}
      {curves.map((c, i) => (
        <g key={i}>
          <path d={c} pathLength={1} className={`dg-line ${draw}`} style={{ strokeWidth: 1.5, ...d(300 + i * 130) }} />
          <Packet path={c} delay={1800 + i * 560} />
        </g>
      ))}
      {sources.map((s, i) => (
        <g key={s} className={pop} style={d(100 + i * 130)}>
          <text x={g.labelEnd} y={(ys[i] as number) + g.font * 0.34} textAnchor="end" fontFamily="var(--font-sans)" fontSize={g.font} fill="var(--color-ink-2)">
            {s}
          </text>
          <circle cx={g.dotX} cy={ys[i] as number} r="4" fill="var(--color-ink)" />
        </g>
      ))}

      {/* the core: wash settles under it */}
      <g className={pop} style={d(500)}>
        <rect
          className={intro ? "dg-wash" : ""}
          x={left + g.core * 0.07}
          y={top + g.core * 0.07}
          width={coreW}
          height={coreH}
          rx={g.core * 0.17}
          fill="var(--color-mist)"
        />
        {core.kind === "mark" ? (
          <g className="mark-vars">
            <use href="#sanad-mark" x={left} y={top} width={coreW} height={coreH} />
          </g>
        ) : (
          <>
            <rect x={left} y={top} width={coreW} height={coreH} rx={g.core * 0.14} fill="var(--color-paper)" className="dg-box" style={{ strokeWidth: 1.5 }} />
            <text x={g.cx} y={g.cy + g.font * 0.45} textAnchor="middle" fontFamily="var(--font-serif)" fontWeight={500} fontSize={g.font * 1.7} fill="var(--color-ink)">
              {core.text}
            </text>
          </>
        )}
        {g.out === "right" && (
          <text x={g.cx} y={bottom + 42} textAnchor="middle" fontFamily="var(--font-serif)" fontWeight={500} fontSize={g.font * 1.1} fill="var(--color-ink)">
            Sanad Core
          </text>
        )}
      </g>

      {/* stream out */}
      <path d={out} pathLength={1} className={`dg-line ${draw}`} style={{ strokeWidth: 1.5, ...d(1600) }} />
      <Packet path={out} delay={3000} />

      {/* client-controlled infrastructure */}
      <g className={pop} style={d(1900)}>
        <g transform="translate(7 7)" fill="var(--color-mist)">
          <path d={`M${g.sinkX - g.sinkRx} ${cylTop}V${cylTop + cylH}A${g.sinkRx} ${cylRy} 0 0 0 ${g.sinkX + g.sinkRx} ${cylTop + cylH}V${cylTop}Z`} />
          <ellipse cx={g.sinkX} cy={cylTop} rx={g.sinkRx} ry={cylRy} />
        </g>
        <g className="dg-box" style={{ strokeWidth: 1.5 }}>
          <ellipse cx={g.sinkX} cy={cylTop} rx={g.sinkRx} ry={cylRy} fill="var(--color-paper)" />
          <path fill="none" d={`M${g.sinkX - g.sinkRx} ${cylTop}V${cylTop + cylH}A${g.sinkRx} ${cylRy} 0 0 0 ${g.sinkX + g.sinkRx} ${cylTop + cylH}V${cylTop}`} />
          <path fill="none" d={`M${g.sinkX - g.sinkRx} ${cylTop + cylH / 2}A${g.sinkRx} ${cylRy} 0 0 0 ${g.sinkX + g.sinkRx} ${cylTop + cylH / 2}`} />
        </g>
        <text x={g.sinkX} y={cylTop + cylH + cylRy + 30} textAnchor="middle" fontFamily="var(--font-sans)" fontSize={labelFont} fill="var(--color-ink-2)">
          Client-controlled
        </text>
        <text x={g.sinkX} y={cylTop + cylH + cylRy + 30 + labelFont * 1.4} textAnchor="middle" fontFamily="var(--font-sans)" fontSize={labelFont} fill="var(--color-ink-3)">
          infrastructure
        </text>
      </g>
    </svg>
  );
}
