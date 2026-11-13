"use client";

import React from "react";
import Link from "next/link";
import { Tag, Tooltip } from "antd";
import {
  AppstoreOutlined, CheckCircleFilled, ClockCircleFilled, CloseCircleFilled, ControlOutlined, SafetyCertificateFilled, StopOutlined, SwapOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { VIZ } from "@/components/dashboard/Charts";
import { formatDate } from "@/lib/utils/dateFormat";

/**
 * Serial passport: the Serial No. Search Report result for a registered serial, drawn as a product passport —
 * hero card with a warranty gauge, the lifecycle timeline, the other components of the pump set and the owner card.
 */

/* ---------- shared helpers ---------- */

/** Blue sequential ramp (100 → 700), as on the geo report. */
const RAMP = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
const RULE = "#cbd5e1";
const DAY = 24 * 60 * 60 * 1000;
const LABEL = "text-[11px] font-bold uppercase tracking-wide text-slate-500";
const CARD = "bg-white rounded-xl border border-slate-200 shadow-xs";
const CAT_TAG: Record<string, string> = { PUMP: "blue", MOTOR: "cyan", CONTROLLER: "purple" };
/** Service call statuses used across the app (Service Calls page / API). */
const CALL_TAG: Record<string, string> = {
  New: "blue", Assigned: "purple", Visited: "cyan", "In Approval": "gold", Approved: "geekblue",
  Resolved: "green", Closed: "green", Cancelled: "default",
};

const asDate = (v: unknown): dayjs.Dayjs | null => {
  if (!v) return null;
  const x = dayjs(v as string);
  return x.isValid() ? x : null;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const isFuture = (d: dayjs.Dayjs) => d.isAfter(dayjs(), "day");
function relative(d: dayjs.Dayjs) {
  const n = d.startOf("day").diff(dayjs().startOf("day"), "day");
  if (n === 0) return "today";
  const a = Math.abs(n);
  const span = a < 60 ? plural(a, "day") : a < 730 ? plural(Math.round(a / 30.44), "month") : `${(a / 365.25).toFixed(1)} years`;
  return n > 0 ? `in ${span}` : `${span} ago`;
}

/* ---------- status ---------- */

export type PassportStatus = "active" | "expiring" | "expired" | "replaced" | "void";

const STATUS: Record<PassportStatus, { label: string; color: string; badge: string; icon: React.ReactNode; hint: string }> = {
  active: { label: "Active", color: VIZ.aqua, badge: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: <CheckCircleFilled />, hint: "Warranty running — more than 45 days left" },
  expiring: { label: "Expiring", color: VIZ.yellow, badge: "border-amber-200 bg-amber-50 text-amber-800", icon: <ClockCircleFilled />, hint: "45 days or less of warranty left" },
  expired: { label: "Expired", color: VIZ.red, badge: "border-red-200 bg-red-50 text-red-700", icon: <CloseCircleFilled />, hint: "The warranty period is over" },
  replaced: { label: "Replaced", color: "#94a3b8", badge: "border-slate-200 bg-slate-100 text-slate-700", icon: <SwapOutlined />, hint: "This unit was replaced by another serial" },
  void: { label: "Void", color: "#64748b", badge: "border-slate-300 bg-slate-100 text-slate-700", icon: <StopOutlined />, hint: "Warranty set to Void by head office" },
};

/** Maps the API's warranty state (State / Label / Status) to the passport status. */
export function statusKeyOf(w: { State?: string; Label?: string; Status?: string } | null | undefined): PassportStatus {
  if (!w) return "expired";
  if (w.State === "replaced" || w.Status === "Replaced") return "replaced";
  if (w.Status === "Void" || w.Label === "Void") return "void";
  if (w.State === "expiring") return "expiring";
  if (w.State === "active") return "active";
  return "expired";
}

export function StatusBadge({ status, size = "md" }: { status: PassportStatus; size?: "sm" | "md" }) {
  const s = STATUS[status];
  return (
    <Tooltip title={s.hint}>
      <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${s.badge} ${size === "sm" ? "px-2 py-px text-[11px]" : "px-3 py-1 text-sm"}`}>
        {s.icon}{s.label}
      </span>
    </Tooltip>
  );
}

/* ---------- component icon ---------- */

function PumpGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.7S6 9.3 6 14a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
    </svg>
  );
}

export function CategoryIcon({ category }: { category?: string | null }) {
  const c = String(category || "").toUpperCase();
  if (c === "PUMP") return <span className="inline-flex"><PumpGlyph /></span>;
  if (c === "MOTOR") return <ThunderboltOutlined />;
  if (c === "CONTROLLER") return <ControlOutlined />;
  return <AppstoreOutlined />;
}

/* ---------- warranty period ---------- */

interface PeriodInput { StartDate?: unknown; EndDate?: unknown; WarrantyMonths?: unknown; ExtendedMonths?: unknown }

/** Positions on the start → end track (in %), the standard-period end when extended months exist, and day counts. */
export function periodOf(w: PeriodInput | null | undefined) {
  const start = asDate(w?.StartDate), end = asDate(w?.EndDate);
  if (!start || !end || !end.isAfter(start)) return null;
  const now = dayjs();
  const totalMs = end.valueOf() - start.valueOf();
  const months = Number(w?.WarrantyMonths || 0), ext = Number(w?.ExtendedMonths || 0);
  let baseEnd: dayjs.Dayjs | null = ext > 0 && months > 0 ? start.add(months, "month") : null;
  if (baseEnd && !(baseEnd.isAfter(start) && baseEnd.isBefore(end))) baseEnd = null;
  const pctOf = (t: dayjs.Dayjs) => Math.min(100, Math.max(0, ((t.valueOf() - start.valueOf()) / totalMs) * 100));
  const totalDays = Math.max(1, Math.round(totalMs / DAY));
  const usedDays = Math.min(totalDays, Math.max(0, now.startOf("day").diff(start.startOf("day"), "day")));
  return {
    start, end, baseEnd, months, ext, totalDays, usedDays,
    basePct: baseEnd ? pctOf(baseEnd) : 100,
    elapsedPct: pctOf(now),
    daysLeft: end.startOf("day").diff(now.startOf("day"), "day"),
  };
}

/** Headline for the gauge / today marker: "N days left", "Expired N days ago", "Replaced", "Void". */
function summaryOf(w: any, status: PassportStatus) {
  const p = periodOf(w);
  if (status === "replaced") return { big: "Replaced", unit: "", sentence: "unit replaced" };
  if (status === "void") return { big: "Void", unit: "", sentence: "warranty void" };
  if (status === "active" || status === "expiring") {
    const n = Number.isFinite(Number(w?.DaysLeft)) ? Number(w.DaysLeft) : Math.max(0, p?.daysLeft ?? 0);
    return { big: String(n), unit: n === 1 ? "day left" : "days left", sentence: `${plural(n, "day")} of warranty left` };
  }
  const ago = p ? -p.daysLeft : 0;
  return ago > 0
    ? { big: "Expired", unit: `${plural(ago, "day")} ago`, sentence: `warranty expired ${plural(ago, "day")} ago` }
    : { big: "Expired", unit: "", sentence: "warranty expired" };
}

/** Horizontal start → end track with the elapsed part filled, a "today" marker and the extended months as a lighter segment. */
export function WarrantyGauge({ warranty, status }: { warranty: any; status: PassportStatus }) {
  const p = periodOf(warranty);
  const sum = summaryOf(warranty, status);
  const color = STATUS[status].color;
  const usedPct = p ? Math.round(p.elapsedPct) : Number(warranty?.ElapsedPct || 0);
  const live = status === "active" || status === "expiring";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <div className={LABEL}>Balance warranty</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className={`${live ? "text-4xl" : "text-3xl"} font-extrabold leading-none text-slate-900 tabular-nums`}>{sum.big}</span>
            {sum.unit && <span className="text-sm font-semibold text-slate-500">{sum.unit}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-extrabold leading-none text-slate-900 tabular-nums">{usedPct}%<span className="text-xs font-semibold text-slate-500"> of period used</span></div>
          {p && <div className="text-[11px] text-slate-400 mt-1 tabular-nums">{p.usedDays} of {p.totalDays} days</div>}
        </div>
      </div>

      {p ? (
        <>
          <div className="relative pt-6 mt-3">
            <div className="relative h-3 rounded-[4px]" style={{ background: VIZ.track }}>
              {p.baseEnd && (
                <Tooltip title={`Extended warranty: +${plural(p.ext, "month")} · ${formatDate(p.baseEnd)} → ${formatDate(p.end)}`}>
                  <div className="absolute inset-y-0 right-0 rounded-r-[4px]" style={{ left: `${p.basePct}%`, background: RAMP[0] }} />
                </Tooltip>
              )}
              {p.elapsedPct > 0 && (
                <Tooltip title={`${p.usedDays} days used (${usedPct}%)`}>
                  <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${Math.min(p.elapsedPct, p.basePct)}%`, background: color }} />
                </Tooltip>
              )}
              {p.baseEnd && p.elapsedPct > p.basePct && (
                <div className="absolute inset-y-0 rounded-r-[4px]" style={{ left: `${p.basePct}%`, width: `${p.elapsedPct - p.basePct}%`, background: color, opacity: 0.5 }} />
              )}
              {p.baseEnd && <div className="absolute -inset-y-0.5 w-0.5 bg-white" style={{ left: `calc(${p.basePct}% - 1px)` }} />}
            </div>
            {p.elapsedPct < 100 && (
              <Tooltip title={<>Today · {formatDate(dayjs())}<br />{p.usedDays} days used · {plural(Math.max(0, p.daysLeft), "day")} left</>}>
                <div className={`absolute top-0 bottom-0 flex flex-col cursor-default ${p.elapsedPct < 8 ? "items-start" : p.elapsedPct > 92 ? "items-end" : "items-center"}`}
                  style={{ left: `${p.elapsedPct}%`, transform: p.elapsedPct < 8 ? "translateX(-1px)" : p.elapsedPct > 92 ? "translateX(calc(-100% + 1px))" : "translateX(-50%)" }}>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-700 leading-none whitespace-nowrap">Today</span>
                  <span className="mt-1 flex-1 w-0.5 rounded-full bg-slate-900" />
                </div>
              </Tooltip>
            )}
          </div>
          <div className="flex justify-between gap-4 mt-2 text-[11px]">
            <div><div className="font-bold uppercase tracking-wide text-slate-400 text-[10px]">Start</div><div className="font-semibold text-slate-700 tabular-nums">{formatDate(p.start)}</div></div>
            <div className="text-right"><div className="font-bold uppercase tracking-wide text-slate-400 text-[10px]">{isFuture(p.end) ? "Valid till" : "Ended"}</div><div className="font-semibold text-slate-700 tabular-nums">{formatDate(p.end)}</div></div>
          </div>
          {p.baseEnd && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />Standard {plural(p.months, "month")} · till {formatDate(p.baseEnd)}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: RAMP[0] }} />Extended +{plural(p.ext, "month")}</span>
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-slate-500 mt-3">Warranty dates are not recorded.</div>
      )}
    </div>
  );
}

/* ---------- hero ---------- */

export function PassportHero({ serial, category, model, warranty, registeredOn, registeredBy, replacedFromSerial, onOpenSerial, footer }: {
  serial: string; category?: string | null; model?: any; warranty: any;
  registeredOn?: string | null; registeredBy?: string | null; replacedFromSerial?: string | null;
  onOpenSerial: (sn: string) => void; footer?: React.ReactNode;
}) {
  const status = statusKeyOf(warranty);
  const facts: { key: string; label: string; value: React.ReactNode }[] = [
    { key: "w", label: "Warranty no", value: warranty?.WarrantyNo || "—" },
    { key: "p", label: "Period", value: warranty?.WarrantyMonths != null ? `${warranty.WarrantyMonths} months${Number(warranty?.ExtendedMonths) ? ` + ${warranty.ExtendedMonths} extended` : ""}` : "—" },
    { key: "r", label: "Rating", value: model?.Hp ? `${Number(model.Hp)} HP${model?.Kw ? ` / ${Number(model.Kw)} kW` : ""}` : "—" },
    ...(registeredOn || registeredBy ? [{ key: "ro", label: "Registered on", value: `${formatDate(registeredOn)} by ${registeredBy || "—"}` }] : []),
    ...(model?.ModelCode ? [{ key: "mc", label: "Model code", value: model.ModelCode }] : []),
    ...(replacedFromSerial ? [{ key: "rf", label: "Replaced serial", value: <SerialLink sn={replacedFromSerial} onOpen={onOpenSerial} /> }] : []),
  ];

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="p-5 flex flex-wrap items-start gap-4">
        <div className="h-14 w-14 shrink-0 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-[26px]"><CategoryIcon category={category} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-blue-600">Serial passport</span>
            {category && <Tag color={CAT_TAG[category]} className="m-0 text-[10px]">{category}</Tag>}
            <Tooltip title="Found in the sticker register and registered to an installation">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><SafetyCertificateFilled />Authentic</span>
            </Tooltip>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 leading-tight mt-1 break-words">{model?.ModelName || "Model not recorded"}</h2>
          <div className="font-mono text-sm font-semibold text-slate-600 mt-0.5 break-all">{serial}</div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="px-5 pb-5"><WarrantyGauge warranty={warranty} status={status} /></div>

      <dl className="border-t border-slate-100 px-5 py-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 m-0">
        {facts.map((f) => (
          <div key={f.key} className="min-w-0">
            <dt className={LABEL}>{f.label}</dt>
            <dd className="m-0 mt-0.5 text-sm text-slate-800 break-words">{f.value}</dd>
          </div>
        ))}
      </dl>

      {footer && <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-600">{footer}</div>}
    </section>
  );
}

function SerialLink({ sn, onOpen }: { sn: string; onOpen: (sn: string) => void }) {
  return (
    <a href={`/warranty/search?sn=${encodeURIComponent(sn)}`} className="font-mono font-semibold text-blue-600 hover:underline"
      onClick={(e) => { e.preventDefault(); onOpen(sn); }}>{sn}</a>
  );
}

/* ---------- lifecycle timeline ---------- */

interface LifeEvent {
  key: string; seq: number; date: dayjs.Dayjs; color: string;
  title: React.ReactNode; tag?: React.ReactNode; meta?: string; detail?: React.ReactNode; tip?: React.ReactNode;
}

export function LifecycleTimeline({ report, serial, canOpenCalls, onOpenSerial }: {
  report: any; serial: string; canOpenCalls: boolean; onOpenSerial: (sn: string) => void;
}) {
  const w = report?.warranty || {};
  const owner = report?.owner || {};
  const sticker = report?.sticker || {};
  const model = report?.model || {};
  const status = statusKeyOf(w);
  const p = periodOf(w);
  const events: LifeEvent[] = [];
  const push = (date: unknown, e: Omit<LifeEvent, "date">) => { const d = asDate(date); if (d) events.push({ ...e, date: d }); };

  push(sticker.MfgDate, { key: "mfg", seq: 0, color: RAMP[1], title: "Manufactured", detail: [model.ModelName, model.ModelCode].filter(Boolean).join(" · ") || "—" });
  push(sticker.InvoiceDate, {
    key: "inv", seq: 1, color: RAMP[1], title: "Invoiced",
    detail: [sticker.InvoiceNo && `Invoice ${sticker.InvoiceNo}`, sticker.InvoiceLocation].filter(Boolean).join(" · ") || "Factory invoice",
  });
  const place = [owner.Village, owner.District, owner.StateName].filter(Boolean).join(", ");
  const installedBy = owner.InstallRegisteredBy || owner.DealerName;
  push(owner.InstallDate, {
    key: "inst", seq: 2, color: RAMP[2], title: "Installed",
    detail: [owner.InstallNo, place, installedBy && `by ${installedBy}`, owner.SaleInvoiceNo && `invoice ${owner.SaleInvoiceNo}`].filter(Boolean).join(" · ") || "—",
  });
  push(report?.registeredOn || w.StartDate, {
    key: "reg", seq: 3, color: RAMP[3], title: report?.replacedFromSerial ? "Warranty started (replacement unit)" : "Warranty registered",
    detail: <>{[w.WarrantyNo, `by ${report?.registeredBy || "—"}`].filter(Boolean).join(" · ")}{report?.replacedFromSerial && <> · replaces <SerialLink sn={report.replacedFromSerial} onOpen={onOpenSerial} /></>}</>,
  });

  const seen = new Set<string>();
  for (const c of (report?.calls || []) as any[]) {
    const id = String(c.ComplaintId ?? c.ComplaintNo ?? "");
    if (seen.has(id)) continue;
    seen.add(id);
    const text = c.ReportedFault || c.ComplaintText || "No complaint text";
    const visits = Number(c.VisitCount || 0), jobs = Number(c.JobCardCount || 0);
    const meta = [visits ? plural(visits, "visit") : "", jobs ? plural(jobs, "job card") : "", c.ClosedOn ? `closed ${formatDate(c.ClosedOn)}` : ""].filter(Boolean).join(" · ");
    const label = `Service call ${c.ComplaintNo || ""}`.trim();
    push(c.CallDate, {
      key: `call-${id}`, seq: 4, color: VIZ.orange,
      title: canOpenCalls && c.ComplaintNo ? <Link href={`/service/complaints?q=${encodeURIComponent(c.ComplaintNo)}`} className="text-blue-700 hover:underline">{label}</Link> : label,
      tag: c.Status ? <Tag color={CALL_TAG[c.Status] || "default"} className="m-0 text-[10px] leading-4">{c.Status}</Tag> : undefined,
      meta, detail: text,
      tip: <><div className="font-semibold">{label}</div><div>{text}</div>{meta && <div className="opacity-80 mt-0.5">{meta}</div>}</>,
    });
  }

  for (const r of (report?.replacements || []) as any[]) {
    const out = r.OldSerialNo === serial;
    const other = out ? r.NewSerialNo : r.OldSerialNo;
    push(r.ReplDate, {
      key: `repl-${r.ReplNo}-${r.OldSerialNo}-${r.NewSerialNo}`, seq: 5, color: VIZ.violet,
      title: out ? "Replaced" : "Fitted as a replacement",
      detail: <>{out ? "by " : "for "}{other ? <SerialLink sn={other} onOpen={onOpenSerial} /> : "—"}{r.ReplNo ? ` · ${r.ReplNo}` : ""}</>,
      tip: `${r.ReplNo || "Replacement"}: ${r.OldSerialNo || "—"} → ${r.NewSerialNo || "—"}`,
    });
  }

  const ended = status === "replaced" || status === "void";
  if (p?.baseEnd) {
    push(p.baseEnd, { key: "std-end", seq: 6, color: "#94a3b8", title: isFuture(p.baseEnd) ? "Standard warranty ends" : "Standard warranty ended", detail: `${plural(p.months, "month")} from start · extended months follow` });
  }
  if (p) {
    push(p.end, {
      key: "end", seq: 7, color: STATUS[status].color,
      title: isFuture(p.end) ? "Warranty ends" : "Warranty ended",
      detail: ended ? `Not applicable — ${STATUS[status].label.toLowerCase()}` : p.ext ? `incl. ${plural(p.ext, "extended month")}` : `${plural(p.months, "month")} warranty`,
    });
  }

  events.sort((a, b) => a.date.valueOf() - b.date.valueOf() || a.seq - b.seq);
  type Row = { kind: "event"; e: LifeEvent; future: boolean } | { kind: "today" };
  const rows: Row[] = [];
  let todayPlaced = false;
  for (const e of events) {
    const future = isFuture(e.date);
    if (future && !todayPlaced) { rows.push({ kind: "today" }); todayPlaced = true; }
    rows.push({ kind: "event", e, future });
  }
  if (!todayPlaced) rows.push({ kind: "today" });
  const sum = summaryOf(w, status);

  return (
    <section className={CARD}>
      <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Lifecycle</h3>
          <p className="text-xs text-slate-500 mt-0.5">Everything recorded against this serial, oldest first</p>
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">{plural(events.length, "event")}</span>
      </header>
      <ol className="px-5 py-4 m-0 list-none">
        {rows.map((row, i) => {
          const first = i === 0, last = i === rows.length - 1;
          const upperDashed = row.kind === "event" && row.future;
          const lowerDashed = row.kind === "today" || (row.kind === "event" && row.future);
          const rail = (dot: React.ReactNode) => (
            <div className="relative flex justify-center">
              {!first && <span className="absolute left-1/2 -translate-x-1/2 top-0 h-[10px] border-l" style={{ borderColor: RULE, borderLeftStyle: upperDashed ? "dashed" : "solid" }} />}
              {!last && <span className="absolute left-1/2 -translate-x-1/2 top-[10px] bottom-0 border-l" style={{ borderColor: RULE, borderLeftStyle: lowerDashed ? "dashed" : "solid" }} />}
              {dot}
            </div>
          );

          if (row.kind === "today") {
            const now = dayjs();
            return (
              <li key="today" className="grid grid-cols-[16px_minmax(0,1fr)] sm:grid-cols-[88px_16px_minmax(0,1fr)] gap-x-3">
                <div className="hidden sm:block text-right pt-0.5">
                  <div className="text-xs font-bold text-blue-700">Today</div>
                  <div className="text-[10.5px] text-slate-400 tabular-nums">{formatDate(now)}</div>
                </div>
                {rail(
                  <Tooltip title={`Today · ${formatDate(now)} · ${sum.sentence}`}>
                    <span className="relative z-[1] mt-[3px] block h-3.5 w-3.5 rounded-full bg-white" style={{ border: `3px solid ${VIZ.blue}` }} />
                  </Tooltip>,
                )}
                <div className={`min-w-0 ${last ? "" : "pb-5"}`}>
                  <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5">
                    <span className="sm:hidden">{formatDate(now)} ·</span> Today · {sum.sentence}
                  </span>
                </div>
              </li>
            );
          }

          const { e, future } = row;
          return (
            <li key={e.key} className="grid grid-cols-[16px_minmax(0,1fr)] sm:grid-cols-[88px_16px_minmax(0,1fr)] gap-x-3">
              <div className="hidden sm:block text-right pt-0.5">
                <div className={`text-xs tabular-nums ${future ? "text-slate-400" : "font-semibold text-slate-700"}`}>{formatDate(e.date)}</div>
                <div className="text-[10.5px] text-slate-400">{relative(e.date)}</div>
              </div>
              {rail(
                <Tooltip title={e.tip || <><div className="font-semibold">{typeof e.title === "string" ? e.title : ""}</div><div>{formatDate(e.date)} · {relative(e.date)}</div></>}>
                  <span className="relative z-[1] mt-[4px] block h-3 w-3 rounded-full cursor-default"
                    style={future ? { border: `2px dashed ${e.color}`, background: "#fff" } : { background: e.color, boxShadow: "0 0 0 3px #fff" }} />
                </Tooltip>,
              )}
              <div className={`min-w-0 ${last ? "" : "pb-5"}`}>
                <div className="sm:hidden text-[11px] font-semibold text-slate-500 tabular-nums">{formatDate(e.date)} · {relative(e.date)}</div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={`text-sm font-semibold ${future ? "text-slate-500" : "text-slate-900"}`}>{e.title}</span>
                  {e.tag}
                  {e.meta && <span className="text-[11px] text-slate-400">{e.meta}</span>}
                </div>
                {e.detail && <div className={`text-xs truncate ${future ? "text-slate-400" : "text-slate-500"}`}>{e.detail}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ---------- pump set ---------- */

export function PumpSet({ components, serial, onOpenSerial }: { components: any[] | null | undefined; serial: string; onOpenSerial: (sn: string) => void }) {
  const list = components || [];
  return (
    <section className={CARD}>
      <header className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Pump set</h3>
        <p className="text-xs text-slate-500 mt-0.5">{list.length ? `${plural(list.length, "component")} of this installation · each has its own serial and warranty` : "Components of this installation"}</p>
      </header>
      {list.length ? (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-2.5">
          {list.map((c: any) => {
            const current = c.SerialNo === serial;
            const st = statusKeyOf(c);
            const p = periodOf(c);
            const live = st === "active" || st === "expiring";
            const days = Number(c.DaysLeft || 0);
            const tail = live ? `${plural(days, "day")} left` : STATUS[st].label;
            return (
              <button key={c.SerialNo} type="button" aria-current={current ? "true" : undefined}
                onClick={() => { if (!current && c.SerialNo) onOpenSerial(c.SerialNo); }}
                className={`w-full min-w-0 text-left rounded-lg border px-3 py-2.5 transition-all ${current ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-200 cursor-default" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm cursor-pointer"}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-7 w-7 shrink-0 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center text-sm"><CategoryIcon category={c.Category} /></span>
                  {c.Category && <Tag color={CAT_TAG[c.Category]} className="m-0 text-[10px]">{c.Category}</Tag>}
                  {current && <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600 whitespace-nowrap">This serial</span>}
                  <span className="ml-auto"><StatusBadge size="sm" status={st} /></span>
                </div>
                <div className="font-mono text-[13px] font-bold text-slate-900 mt-1.5 truncate">{c.SerialNo}</div>
                <div className="text-xs text-slate-500 truncate">{c.ModelName || "—"}</div>
                <Tooltip title={p ? `${formatDate(p.start)} → ${formatDate(p.end)} · ${Math.round(p.elapsedPct)}% used` : `Valid till ${formatDate(c.EndDate)}`}>
                  <div className="mt-2 h-1.5 rounded-[4px] overflow-hidden" style={{ background: VIZ.track }}>
                    <div className="h-full rounded-[4px]" style={{ width: `${p ? p.elapsedPct : live ? 0 : 100}%`, background: STATUS[st].color }} />
                  </div>
                </Tooltip>
                <div className="flex justify-between gap-2 mt-1 text-[11px]">
                  <span className="font-semibold text-slate-700">{tail}</span>
                  <span className="text-slate-400 tabular-nums">till {formatDate(c.EndDate)}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-6 text-xs text-slate-400">No components recorded for this installation.</div>
      )}
    </section>
  );
}

/* ---------- owner ---------- */

export function OwnerCard({ owner, children }: { owner: any; children?: React.ReactNode }) {
  const o = owner || {};
  const rows: { key: string; label: string; value: React.ReactNode }[] = [
    { key: "cu", label: "Customer", value: o.CustomerName || "—" },
    { key: "mo", label: "Mobile", value: o.Mobile ? <a href={`tel:${o.Mobile}`} className="text-slate-800 hover:text-blue-700">{o.Mobile}</a> : "—" },
    { key: "si", label: "Site", value: [o.Village, o.District, o.StateName, o.Pincode].filter(Boolean).join(", ") || "—" },
    { key: "in", label: "Installation", value: `${o.InstallNo || "—"} · ${formatDate(o.InstallDate)}` },
    ...(o.InstallRegisteredBy ? [{ key: "ib", label: "Installed by", value: o.InstallRegisteredBy }] : []),
    { key: "de", label: "Dealer", value: o.DealerName || "Direct" },
    ...(o.SaleInvoiceNo ? [{ key: "iv", label: "Sale invoice", value: `${o.SaleInvoiceNo}${o.SaleInvoiceDate ? ` · ${formatDate(o.SaleInvoiceDate)}` : ""}` }] : []),
    ...(o.BorewellDepthM ? [{ key: "bw", label: "Borewell / head", value: `${o.BorewellDepthM} m / ${o.DynamicHeadM || "—"} m` }] : []),
  ];
  return (
    <section className={CARD}>
      <header className="px-5 py-3.5 border-b border-slate-100"><h3 className="text-sm font-bold text-slate-900">Customer &amp; site</h3></header>
      <dl className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-3 m-0">
        {rows.map((r) => (
          <div key={r.key} className={`min-w-0 ${r.key === "si" || r.key === "cu" ? "col-span-2 sm:col-span-1 xl:col-span-2" : ""}`}>
            <dt className={LABEL}>{r.label}</dt>
            <dd className="m-0 mt-0.5 text-sm text-slate-800 break-words">{r.value}</dd>
          </div>
        ))}
      </dl>
      {React.Children.toArray(children).length > 0 && <div className="px-5 pb-4 flex flex-wrap gap-2">{children}</div>}
    </section>
  );
}
