"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dayjs, { type Dayjs } from "dayjs";
import { RightOutlined } from "@ant-design/icons";
import { Legend, VIZ } from "@/components/dashboard/Charts";

export interface RunwayMonth { month: string; pump: number; motor: number; controller: number }
export interface RunwayStats { days30: number; days45: number; days90: number }
export interface ExpiringWarranty { SerialNo: string; Category: string; CustomerName?: string | null; EndDate: string }

type CatKey = "pump" | "motor" | "controller";

/** Categorical slots 1–3 of the app palette, in this fixed order (stacked bottom → top). Never cycled or reordered. */
const CATS: { key: CatKey; code: string; label: string; color: string }[] = [
  { key: "pump", code: "PUMP", label: "Pump", color: VIZ.blue },
  { key: "motor", code: "MOTOR", label: "Motor", color: VIZ.orange },
  { key: "controller", code: "CONTROLLER", label: "Controller", color: VIZ.aqua },
];
const catOf = (code: string) => CATS.find((c) => c.code === String(code || "").toUpperCase());

/** Same window as the "Ending in 45 days" / "Expiring ≤ 45 days" status used across the app. */
const WINDOW_DAYS = 45;
const MONTHS = 12;
const INK_SOFT = "#334155";

interface Column { key: string; date: Dayjs; label: string; values: Record<CatKey, number>; total: number }

/** The next 12 months from the viewer's local calendar (current month first), zero-filled where the API has no row. */
function buildColumns(runway: RunwayMonth[]): Column[] {
  const byMonth = new Map(runway.map((r) => [String(r.month || "").slice(0, 7), r]));
  const start = dayjs().startOf("month");
  return Array.from({ length: MONTHS }, (_, i) => {
    const date = start.add(i, "month"), key = date.format("YYYY-MM"), row = byMonth.get(key);
    const values = { pump: Number(row?.pump) || 0, motor: Number(row?.motor) || 0, controller: Number(row?.controller) || 0 };
    return { key, date, label: date.format("MMM YY"), values, total: values.pump + values.motor + values.controller };
  });
}

/** Rounded whole-number axis maximum and step, e.g. 18 → 20 / 5. */
function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw);
  return { top: Math.ceil(max / step) * step, step };
}

/** Bar with a 4px rounded top, square at the bottom. */
function roundTopPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ chart */

function RunwayChart({ columns, windowCount }: { columns: Column[]; windowCount: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  const [Hc, setHc] = useState(260);
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; ci: number } | null>(null);

  // Draw at the card's real pixel size (width and the height the card row gives it) so the chart fills the space and labels keep their size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width || 0);
      const h = Math.round(entries[0]?.contentRect.height || 0);
      if (w > 0) setW(Math.max(280, w));
      if (h > 0) setHc(Math.max(220, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padL = 34, padR = 8, padT = 46;
  const plotW = W - padL - padR;
  const band = plotW / MONTHS;
  const narrow = band < 46; // month label splits onto two lines
  const padB = narrow ? 34 : 24;
  const plotH = Math.max(120, Hc - padT - padB);
  const H = padT + plotH + padB;
  const base = padT + plotH;
  const barW = Math.max(6, Math.min(20, band * 0.42));
  const maxTotal = Math.max(0, ...columns.map((c) => c.total));
  const { top, step } = niceScale(Math.max(1, maxTotal));
  const y = (v: number) => base - (v / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const empty = maxTotal === 0;

  // 45-day window: from the start of the runway (the current month only holds warranties still running today)
  // to the position of today + 45 days inside its month column.
  const windowEnd = dayjs().startOf("day").add(WINDOW_DAYS, "day");
  const endIdx = windowEnd.diff(columns[0].date, "month");
  const endPos = Math.min(MONTHS, endIdx + (windowEnd.date() - 1) / windowEnd.daysInMonth());
  const wx0 = padL, wx1 = padL + band * endPos;
  const windowLabel = W < 420 ? "45-day window" : "45-day renewal window";

  const showTip = (ci: number, svg: SVGSVGElement | null) => {
    if (!svg) return;
    const box = svg.getBoundingClientRect(), sx = box.width / W, sy = box.height / H;
    const x = (padL + band * ci + band / 2) * sx;
    setHover(ci);
    setTip({ x: Math.min(Math.max(x, 80), Math.max(80, box.width - 80)), y: (y(columns[ci].total) - 12) * sy, ci });
  };
  const clear = () => { setHover(null); setTip(null); };
  const tipCol = tip ? columns[tip.ci] : null;

  return (
    <div ref={wrapRef} className="relative flex-1 min-h-[260px]" onMouseLeave={clear}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full block" role="img"
        aria-label={`Component warranties ending per month, next 12 months: ${columns.map((c) => `${c.label} ${c.total}`).join(", ")}`}>
        {/* recessive grid + single y-axis */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth={1} />
            <text x={padL - 7} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill={VIZ.muted}>{t}</text>
          </g>
        ))}

        {/* 45-day renewal window: shaded band + bracket + label */}
        <rect x={wx0} y={22} width={Math.max(0, wx1 - wx0)} height={base - 22} fill={VIZ.yellow} opacity={0.09} />
        <path d={`M${wx0 + 0.75},28 V22 H${wx1 - 0.75} V28`} fill="none" stroke={VIZ.yellow} strokeWidth={1.5} strokeLinejoin="round" />
        <text x={wx0} y={14} fontSize={11} fill={INK_SOFT}>
          <tspan fontWeight={700}>{windowLabel}</tspan>
          <tspan fill={VIZ.muted}> · {plural(windowCount, "warranty", "warranties")}</tspan>
        </text>

        {columns.map((c, ci) => {
          const cx = padL + band * ci + band / 2, bx = cx - barW / 2;
          const present = CATS.filter((k) => c.values[k.key] > 0);
          let cursor = base;
          const segs = present.map((k, i) => {
            const h = (c.values[k.key] / top) * plotH, segTop = cursor - h;
            cursor = segTop;
            const isTop = i === present.length - 1;
            // Every segment below the top one gives up 2px at its top: the surface shows through as the gap.
            const drawH = isTop ? h : Math.max(1, h - 2);
            return { k, y: isTop ? segTop : segTop + (h - drawH), h: drawH, isTop };
          });
          const dim = hover !== null && hover !== ci;
          return (
            <g key={c.key}>
              {hover === ci && <rect x={padL + band * ci + 2} y={padT - 8} width={band - 4} height={plotH + 8} rx={6} fill={VIZ.ink} opacity={0.045} />}
              <g opacity={dim ? 0.55 : 1}>
                {segs.map((s) => s.isTop
                  ? <path key={s.k.key} d={roundTopPath(bx, s.y, barW, s.h)} fill={s.k.color} />
                  : <rect key={s.k.key} x={bx} y={s.y} width={barW} height={s.h} fill={s.k.color} />)}
              </g>
              {!empty && (
                <text x={cx} y={y(c.total) - 6} textAnchor="middle" fontSize={10.5} fontWeight={c.total ? 700 : 400} fill={c.total ? VIZ.ink : VIZ.axis}>
                  {c.total.toLocaleString("en-IN")}
                </text>
              )}
              <text x={cx} y={base + 15} textAnchor="middle" fontSize={10.5} fill={ci === 0 ? VIZ.ink : VIZ.muted} fontWeight={ci === 0 ? 600 : 400}>
                {narrow
                  ? <><tspan x={cx}>{c.date.format("MMM")}</tspan><tspan x={cx} dy={12}>{`’${c.date.format("YY")}`}</tspan></>
                  : c.label}
              </text>
              <rect x={padL + band * ci} y={padT - 8} width={band} height={plotH + 8 + padB} fill="transparent" tabIndex={0}
                aria-label={`${c.label}: ${CATS.map((k) => `${k.label} ${c.values[k.key]}`).join(", ")}, total ${c.total}`}
                onFocus={(e) => showTip(ci, e.currentTarget.ownerSVGElement)}
                onBlur={clear}
                onMouseMove={(e) => { if (tip?.ci !== ci) showTip(ci, e.currentTarget.ownerSVGElement); }} />
            </g>
          );
        })}

        {empty && (
          <text x={padL + plotW / 2} y={padT + plotH / 2 + 4} textAnchor="middle" fontSize={12} fill={VIZ.muted}>
            No warranties end in the next 12 months
          </text>
        )}
      </svg>

      {tip && tipCol && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs"
          style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 6px))", whiteSpace: "nowrap" }}>
          <div className="font-semibold text-slate-500 mb-1">{tipCol.date.format("MMMM YYYY")}</div>
          {[...CATS].reverse().map((k) => (
            <div key={k.key} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: k.color }} />
              <span className="text-slate-500 flex-1">{k.label}</span>
              <b className="text-slate-900 pl-3">{tipCol.values[k.key].toLocaleString("en-IN")}</b>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-slate-100">
            <span className="inline-block h-2 w-2" />
            <span className="text-slate-700 font-semibold flex-1">Total</span>
            <b className="text-slate-900 pl-3">{tipCol.total.toLocaleString("en-IN")}</b>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ section */

const daysLeft = (end: string) => Math.max(0, dayjs(end).startOf("day").diff(dayjs().startOf("day"), "day"));

/** Warranty Runway: when component warranties run out over the next 12 months — the renewal / AMC opportunity. */
export function WarrantyRunway({ runway, stats, soonest }: { runway: RunwayMonth[]; stats?: RunwayStats; soonest: ExpiringWarranty[] }) {
  const columns = buildColumns(runway);
  const s = { days30: stats?.days30 || 0, days45: stats?.days45 || 0, days90: stats?.days90 || 0 };
  const peak = columns.reduce<Column | null>((best, c) => (c.total > 0 && (!best || c.total > best.total) ? c : best), null);
  const yearTotal = columns.reduce((sum, c) => sum + c.total, 0);
  const tiles: { label: string; value: number; hot?: boolean }[] = [
    { label: "30 days", value: s.days30 },
    { label: "45 days", value: s.days45, hot: true },
    { label: "90 days", value: s.days90 },
  ];

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900">Warranty runway</h2>
        <span className="text-xs text-slate-400">component warranties ending · next 12 months · renewal / AMC opportunity</span>
      </header>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-6">
        {/* runway chart */}
        <div className="min-w-0 flex flex-col">
          <RunwayChart columns={columns} windowCount={s.days45} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <Legend items={CATS.map((k) => ({ label: k.label, color: k.color, value: columns.reduce((sum, c) => sum + c.values[k.key], 0).toLocaleString("en-IN") }))} />
            <span className="text-xs text-slate-500"><b className="text-slate-900">{yearTotal.toLocaleString("en-IN")}</b> ending in 12 months</span>
          </div>
        </div>

        {/* runway stats */}
        <div className="min-w-0 space-y-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Expiring in the next</div>
            <div className="grid grid-cols-3 gap-2">
              {tiles.map((t) => (
                <div key={t.label} className={`rounded-lg border px-3 py-2.5 ${t.hot ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-slate-50/70"}`}>
                  <div className="text-xl font-extrabold text-slate-900 leading-none">{t.value.toLocaleString("en-IN")}</div>
                  <div className={`text-[11px] mt-1.5 ${t.hot ? "font-semibold text-amber-800" : "text-slate-500"}`}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 px-3 py-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Busiest month</div>
            <div className="text-[13px] text-slate-700 mt-1">
              {peak
                ? <><b className="text-slate-900">Peak: {peak.label}</b> · {plural(peak.total, "warranty", "warranties")}</>
                : "No warranties end in the next 12 months"}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Soonest to expire</span>
              <Link href="/warranty/active" className="text-xs text-blue-600">all active</Link>
            </div>
            {soonest.length ? (
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {soonest.slice(0, 5).map((w, i) => {
                  const cat = catOf(w.Category), d = daysLeft(w.EndDate);
                  return (
                    <Link key={`${w.SerialNo}-${i}`} href={`/warranty/search?sn=${encodeURIComponent(w.SerialNo)}`}
                      className="group flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors"
                      title={`${w.SerialNo} · ends ${dayjs(w.EndDate).format("DD-MMM-YYYY")}`}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cat?.color || VIZ.axis }} />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[12.5px] font-semibold text-slate-900 truncate">{w.SerialNo}</div>
                        <div className="text-[11.5px] text-slate-500 truncate">{cat?.label || w.Category} · {w.CustomerName || "—"}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${d <= WINDOW_DAYS ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                        {d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`}
                      </span>
                      <RightOutlined className="text-[10px] text-slate-300 group-hover:text-slate-500" />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">No active warranties to show</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
