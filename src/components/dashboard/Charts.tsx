"use client";

import React, { useState } from "react";

/**
 * Lightweight SVG charts for the dashboard (no chart library).
 * Colors come from the validated categorical palette; values and labels always use text ink, never series color.
 */
export const VIZ = {
  blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a", yellow: "#eda100",
  magenta: "#e87ba4", green: "#008300", violet: "#6250d6", red: "#e34948",
  grid: "#e9edf3", axis: "#94a3b8", ink: "#0f172a", muted: "#64748b", track: "#eef2f7",
};

type Tip = { x: number; y: number; title: string; rows: { label: string; value: string; color: string }[] } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs"
      style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 10px))", whiteSpace: "nowrap" }}>
      <div className="font-semibold text-slate-500 mb-1">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} />
          <b className="text-slate-900">{r.value}</b>
          <span className="text-slate-500">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: React.ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
          {i.value !== undefined && <b className="text-slate-900">{i.value}</b>}
        </span>
      ))}
    </div>
  );
}

/** Rounded "nice" axis maximum and step, e.g. 18 → 20 / 5. */
function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const finalStep = step < 1 ? 1 : step;
  return { top: Math.ceil(max / finalStep) * finalStep, step: finalStep };
}

/** Bar with 4px rounded data-end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Grouped vertical bars per category (e.g. months), one bar per series, hover shows every series for that category. */
export function GroupedBarChart({ categories, series, height = 250 }: {
  categories: string[];
  series: { name: string; color: string; values: number[] }[];
  height?: number;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, pad = { l: 36, r: 12, t: 12, b: 28 };
  const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
  const { top, step } = niceScale(Math.max(1, ...series.flatMap((s) => s.values)));
  const band = plotW / Math.max(1, categories.length);
  const barW = Math.min(26, (band * 0.6) / series.length);
  const groupW = barW * series.length + 2 * (series.length - 1);
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  return (
    <div className="relative" onMouseLeave={() => { setTip(null); setHover(null); }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${series.map((s) => s.name).join(" and ")} by month`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={10.5} fill={VIZ.muted}>{t}</text>
          </g>
        ))}
        {categories.map((cat, ci) => {
          const gx = pad.l + band * ci + (band - groupW) / 2;
          return (
            <g key={cat}>
              {hover === ci && <rect x={pad.l + band * ci + 4} y={pad.t} width={band - 8} height={plotH} rx={6} fill="#f1f5f9" />}
              {series.map((s, si) => {
                const v = s.values[ci] || 0, by = y(v);
                return <path key={s.name} d={barPath(gx + si * (barW + 2), by, barW, pad.t + plotH - by)} fill={s.color} opacity={hover === null || hover === ci ? 1 : 0.55} />;
              })}
              <text x={pad.l + band * ci + band / 2} y={H - 8} textAnchor="middle" fontSize={10.5} fill={VIZ.muted}>{cat}</text>
              <rect x={pad.l + band * ci} y={pad.t} width={band} height={plotH + pad.b} fill="transparent" tabIndex={0}
                aria-label={`${cat}: ${series.map((s) => `${s.name} ${s.values[ci] || 0}`).join(", ")}`}
                onFocus={() => setHover(ci)}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover(ci);
                  setTip({ x: ((pad.l + band * ci + band / 2) / W) * box.width, y: (y(Math.max(...series.map((s) => s.values[ci] || 0))) / H) * box.height, title: cat, rows: series.map((s) => ({ label: s.name, value: String(s.values[ci] || 0), color: s.color })) });
                }} />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Donut with a centre total, 2px surface gaps between segments, hover lifts a segment and shows its share. */
export function DonutChart({ segments, centerValue, centerLabel, size = 210 }: {
  segments: { label: string; value: number; color: string }[];
  centerValue: React.ReactNode;
  centerLabel: string;
  size?: number;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const R = 100, r = 64, C = 110;
  let angle = -Math.PI / 2;
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const sweep = total ? (s.value / total) * Math.PI * 2 : 0;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    return { ...s, a0, a1, sweep };
  });
  const point = (rad: number, a: number) => [C + rad * Math.cos(a), C + rad * Math.sin(a)];
  const arcPath = (a0: number, a1: number, lift: number) => {
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
    const large = a1 - a0 > Math.PI ? 1 : 0, Ro = R + lift;
    const [x0, y0] = point(Ro, a0), [x1, y1] = point(Ro, a1), [x2, y2] = point(r, a1), [x3, y3] = point(r, a0);
    return `M${x0},${y0} A${Ro},${Ro} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`;
  };

  return (
    <div className="relative mx-auto" style={{ width: size, maxWidth: "100%" }} onMouseLeave={() => { setTip(null); setHover(null); }}>
      <svg viewBox="0 0 220 220" className="w-full h-auto" role="img" aria-label={`${centerLabel}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
        {!arcs.length && <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={VIZ.track} strokeWidth={R - r} />}
        {arcs.map((a) => (
          <path key={a.label} d={arcPath(a.a0, a.a1, hover === a.label ? 4 : 0)} fill={a.color} stroke="#fff" strokeWidth={2} strokeLinejoin="round"
            opacity={hover && hover !== a.label ? 0.6 : 1} tabIndex={0} aria-label={`${a.label} ${a.value}`}
            onFocus={() => setHover(a.label)}
            onMouseMove={(e) => {
              const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
              const [px, py] = point(R, (a.a0 + a.a1) / 2);
              setHover(a.label);
              setTip({ x: (px / 220) * box.width, y: (py / 220) * box.height, title: a.label, rows: [{ label: `${total ? Math.round((a.value / total) * 100) : 0}% of ${centerLabel}`, value: String(a.value), color: a.color }] });
            }} />
        ))}
        <text x={C} y={C + 4} textAnchor="middle" fontSize={30} fontWeight={800} fill={VIZ.ink}>{centerValue}</text>
        <text x={C} y={C + 22} textAnchor="middle" fontSize={10.5} fill={VIZ.muted}>{centerLabel}</text>
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Horizontal ranked bars (single series): name, bar on a track, value. */
export function RankedBars({ items, color = VIZ.blue }: { items: { name: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.name} className="grid grid-cols-[minmax(0,9.5rem)_1fr_2rem] items-center gap-3 text-[13px]" title={`${i.name}: ${i.value}`}>
          <span className="truncate text-slate-700">{i.name}</span>
          <div className="h-3.5 rounded-[4px] bg-slate-100 overflow-hidden">
            <div className="h-full rounded-[4px] transition-all" style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </div>
          <b className="text-right text-slate-900">{i.value}</b>
        </div>
      ))}
    </div>
  );
}
