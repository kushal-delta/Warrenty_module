"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { VIZ } from "@/components/dashboard/Charts";

/** One row of the service dashboard API's `daily` series (days without calls are not sent). */
export type DailyCalls = { day: string; calls: number; warranty: number };

type Day = { key: string; date: Date; col: number; row: number; calls: number; warranty: number };
type Band = { from: number; to: number; color: string };
type Tip = { d: Day; x: number; y: number; below: boolean; align: "start" | "center" | "end" };

/** One-hue sequential ramp, light → dark = fewer → more calls; zero days stay neutral. */
const RAMP = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
const ZERO = "#eef2f7";
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Calendar geometry (SVG user units; the SVG scales to the card width through its viewBox).
const WEEKS = 53, CELL = 12, GAP = 2, STEP = CELL + GAP, LEFT = 30, TOP = 18;
const W = LEFT + WEEKS * STEP - GAP, H = TOP + 7 * STEP - GAP;

const pad2 = (v: number) => String(v).padStart(2, "0");
/** Local calendar-day key (never UTC slicing of a timestamp). */
const keyOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
/** Monday = 0 … Sunday = 6. */
const dowOf = (d: Date) => (d.getDay() + 6) % 7;
const longDate = (d: Date) => `${DOW[dowOf(d)]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
const num = (v: number) => v.toLocaleString("en-IN");
const plural = (v: number, one: string, many = `${one}s`) => `${num(v)} ${v === 1 ? one : many}`;
const fmt1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** Spreads k colours over the ramp so the busiest band is always the darkest. */
function rampIndexes(k: number) {
  if (k <= 1) return [2];
  return Array.from({ length: k }, (_, i) => Math.round((i * (RAMP.length - 1)) / (k - 1)));
}

/** Up to five count bands from the quintiles of the non-zero days (like GitHub's contribution graph). */
function makeBands(values: number[]): Band[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const tops = new Set<number>();
  for (let i = 1; i < RAMP.length; i++) tops.add(v[Math.floor(((v.length - 1) * i) / RAMP.length)]);
  tops.add(v[v.length - 1]);
  const sorted = Array.from(tops).sort((a, b) => a - b);
  const idx = rampIndexes(sorted.length);
  let prev = 0;
  return sorted.map((to, i) => {
    const band = { from: prev + 1, to, color: RAMP[idx[i]] };
    prev = to;
    return band;
  });
}

function buildModel(daily: DailyCalls[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // First column starts on the Monday 52 weeks before the Monday of this week → 53 week columns ending today.
  const start = addDays(today, -(dowOf(today) + (WEEKS - 1) * 7));
  const byDay = new Map<string, DailyCalls>();
  for (const r of daily) {
    // The API sends 'YYYY-MM-DD' (a SQL date with no time part), so the first ten characters are the calendar day.
    const key = String(r?.day ?? "").slice(0, 10);
    if (key) byDay.set(key, r);
  }

  const days: Day[] = [];
  for (let i = 0; ; i++) {
    const date = addDays(start, i);
    if (date.getTime() > today.getTime()) break;
    const key = keyOf(date), r = byDay.get(key);
    days.push({ key, date, col: Math.floor(i / 7), row: i % 7, calls: Number(r?.calls) || 0, warranty: Number(r?.warranty) || 0 });
  }

  const total = days.reduce((s, d) => s + d.calls, 0);
  const warranty = days.reduce((s, d) => s + d.warranty, 0);
  let busiest = null as Day | null;
  for (const d of days) if (d.calls > 0 && (!busiest || d.calls >= busiest.calls)) busiest = d; // ties → most recent

  const sums = [0, 0, 0, 0, 0, 0, 0], counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) { sums[d.row] += d.calls; counts[d.row] += 1; }
  const weekdayAvg = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));
  const topWeekday = total ? weekdayAvg.indexOf(Math.max(...weekdayAvg)) : -1;

  let lastIdx = -1;
  for (let i = days.length - 1; i >= 0; i--) if (days[i].calls > 0) { lastIdx = i; break; }
  // Current streak: consecutive days with calls ending today (or yesterday, while today has none yet).
  let i = days.length - 1, streak = 0;
  if (i >= 0 && days[i].calls === 0) i--;
  while (i >= 0 && days[i].calls > 0) { streak++; i--; }

  // Month labels above the column holding each month's 1st; the leading partial month only when there is room.
  const months: { col: number; label: string }[] = [];
  for (const d of days) if (d.date.getDate() === 1 && d.col <= WEEKS - 2) months.push({ col: d.col, label: MON[d.date.getMonth()] });
  if (days.length && (!months.length || months[0].col >= 3)) months.unshift({ col: 0, label: MON[days[0].date.getMonth()] });

  return {
    today, todayKey: keyOf(today), start, days, total, warranty, busiest, weekdayAvg, topWeekday, streak, months,
    daysSinceLast: lastIdx < 0 ? -1 : days.length - 1 - lastIdx,
    bands: makeBands(days.map((d) => d.calls)),
  };
}

/** Bar with 4px rounded data-end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Mon–Sun average calls per day, single colour, value label on every bar. */
function WeekdayBars({ values }: { values: number[] }) {
  const BW = 300, BH = 132, padT = 18, padB = 20, padX = 4;
  const plotH = BH - padT - padB, band = (BW - padX * 2) / 7, barW = Math.min(26, band * 0.58);
  const max = Math.max(0, ...values) || 1;
  return (
    <svg viewBox={`0 0 ${BW} ${BH}`} className="block h-auto w-full" role="img"
      aria-label={`Average calls per weekday: ${values.map((v, i) => `${DOW[i]} ${fmt1(v)}`).join(", ")}`}>
      <line x1={padX} x2={BW - padX} y1={padT + plotH + 0.5} y2={padT + plotH + 0.5} stroke={VIZ.axis} strokeWidth={1} />
      {values.map((v, i) => {
        const h = (v / max) * plotH, x = padX + band * i + (band - barW) / 2, y = padT + plotH - h;
        return (
          <g key={DOW[i]}>
            <path d={barPath(x, y, barW, h)} fill={VIZ.blue} />
            <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={VIZ.ink}>{fmt1(v)}</text>
            <text x={x + barW / 2} y={BH - 5} textAnchor="middle" fontSize={10.5} fill={VIZ.muted}>{DOW[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 truncate text-lg font-extrabold leading-tight text-slate-900">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500" title={detail}>{detail}</div>
    </div>
  );
}

/**
 * Service pulse: GitHub-style calendar of service calls booked per day over the last 12 months,
 * with plain-language pulse stats and the weekday pattern.
 */
export function ServicePulse({ daily }: { daily?: DailyCalls[] | null }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const m = useMemo(() => buildModel(Array.isArray(daily) ? daily : []), [daily]);
  const open = tip !== null;

  // The tooltip is fixed-positioned (so the scroll container cannot clip it): hide it on scroll / resize / tap elsewhere.
  useEffect(() => {
    if (!open) return;
    const hide = () => setTip(null);
    const onDown = (e: PointerEvent) => { if (!svgRef.current?.contains(e.target as Node)) hide(); };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const show = (e: React.MouseEvent<SVGRectElement>, d: Day) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2, vw = window.innerWidth;
    const below = r.top < 80;
    setTip({ d, x, y: below ? r.bottom : r.top, below, align: x < 130 ? "start" : x > vw - 130 ? "end" : "center" });
  };
  const colorOf = (calls: number) => (calls > 0 ? m.bands.find((b) => calls <= b.to)?.color ?? RAMP[RAMP.length - 1] : ZERO);

  const avg = m.days.length ? m.total / m.days.length : 0;
  const legend = [{ color: ZERO, label: "0" }, ...m.bands.map((b) => ({ color: b.color, label: b.from === b.to ? `${b.from}` : `${b.from}–${b.to}` }))];

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-100 px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Service pulse</h2>
          <p className="mt-0.5 text-xs text-slate-500">When service calls come in: calls booked each day over the last 12 months</p>
        </div>
        <span className="text-xs text-slate-400">{plural(m.total, "call")} · {num(m.warranty)} in warranty</span>
      </header>

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---- Calendar heatmap ---- */}
        <div className="min-w-0">
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" onMouseLeave={() => setTip(null)}
                aria-label={`Service calls per day from ${longDate(m.start)} to ${longDate(m.today)}: ${plural(m.total, "call")}${m.busiest ? `, busiest day ${longDate(m.busiest.date)} with ${plural(m.busiest.calls, "call")}` : ""}`}>
                {m.months.map((mo) => (
                  <text key={mo.col} x={LEFT + mo.col * STEP} y={TOP - 6} fontSize={10} fill={VIZ.muted}>{mo.label}</text>
                ))}
                {[0, 2, 4].map((r) => (
                  <text key={r} x={LEFT - 6} y={TOP + r * STEP + CELL - 2} textAnchor="end" fontSize={9.5} fill={VIZ.muted}>{DOW[r]}</text>
                ))}
                {m.days.map((d) => {
                  const isToday = d.key === m.todayKey, isHover = tip?.d.key === d.key;
                  return (
                    <rect key={d.key} x={LEFT + d.col * STEP} y={TOP + d.row * STEP} width={CELL} height={CELL} rx={2}
                      fill={colorOf(d.calls)} stroke={isToday ? VIZ.ink : isHover ? "#475569" : undefined} strokeWidth={isToday || isHover ? 1.5 : undefined}
                      className="cursor-pointer" onMouseEnter={(e) => show(e, d)} onClick={(e) => show(e, d)} />
                  );
                })}
              </svg>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <span className="text-[11px] text-slate-400">
              {m.total ? "Hover or tap a day for details · today is outlined" : "No service calls booked in the last 12 months"}
            </span>
            <div className="flex items-start gap-1.5 text-[10.5px] text-slate-500" aria-label="Colour scale: calls per day">
              <span className="mr-0.5 leading-3">Less</span>
              {legend.map((s) => (
                <span key={s.color} className="flex min-w-[22px] flex-col items-center gap-1">
                  <span className="block h-3 w-3 rounded-[2px]" style={{ background: s.color }} />
                  <span className="whitespace-nowrap leading-none">{s.label}</span>
                </span>
              ))}
              <span className="ml-0.5 leading-3">More</span>
            </div>
          </div>
        </div>

        {/* ---- Pulse stats + weekday pattern ---- */}
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="grid grid-cols-2 gap-2.5 self-start">
            <Stat label="Busiest day" value={m.busiest ? plural(m.busiest.calls, "call") : "—"} detail={m.busiest ? longDate(m.busiest.date) : "No calls yet"} />
            <Stat label="Busiest weekday" value={m.topWeekday >= 0 ? DOW_LONG[m.topWeekday] : "—"}
              detail={m.topWeekday >= 0 ? `${fmt1(m.weekdayAvg[m.topWeekday])} calls on average` : "No calls yet"} />
            <Stat label="Average per day" value={fmt1(avg)} detail={`${plural(m.total, "call")} over ${num(m.days.length)} days`} />
            <Stat label={m.streak > 0 ? "Current streak" : "Quiet for"}
              value={m.streak > 0 ? plural(m.streak, "day") : m.daysSinceLast >= 0 ? plural(m.daysSinceLast, "day") : "—"}
              detail={m.daysSinceLast < 0 ? "No calls in the period" : m.daysSinceLast === 0 ? "Last call booked today" : m.daysSinceLast === 1 ? "Last call booked yesterday" : `Last call ${m.daysSinceLast} days ago`} />
          </div>
          <div className="min-w-0 rounded-lg border border-slate-100 px-3 pb-2 pt-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Weekday pattern</span>
              <span className="text-[11px] text-slate-400">avg calls per day</span>
            </div>
            <div className="mt-1"><WeekdayBars values={m.weekdayAvg} /></div>
          </div>
        </div>
      </div>

      {tip && (
        <div className="pointer-events-none fixed z-50 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: tip.x, top: tip.y,
            transform: `translate(${tip.align === "start" ? "-12px" : tip.align === "end" ? "calc(-100% + 12px)" : "-50%"}, ${tip.below ? "8px" : "calc(-100% - 8px)"})`,
          }}>
          <div className="font-semibold text-slate-900">
            {longDate(tip.d.date)}{tip.d.key === m.todayKey && <span className="font-normal text-slate-400"> · today</span>}
          </div>
          <div className="mt-0.5 text-slate-600">
            {tip.d.calls ? <><b className="text-slate-900">{plural(tip.d.calls, "call")}</b> · {num(tip.d.warranty)} in warranty</> : "No calls booked"}
          </div>
        </div>
      )}
    </section>
  );
}
