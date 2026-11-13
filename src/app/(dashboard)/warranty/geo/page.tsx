"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Empty, Segmented, Table, Tooltip } from "antd";
import { AimOutlined, CloseOutlined, GlobalOutlined, ReloadOutlined, RiseOutlined, SafetyCertificateOutlined, ToolOutlined } from "@ant-design/icons";
import axios from "axios";
import { RankedBars, VIZ } from "@/components/dashboard/Charts";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { PageLoader } from "@/components/common/Loader";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";
import { reportFormError } from "@/lib/utils/formErrors";
import { ExportExcelButton } from "@/components/common/ReportTools";
import { exportExcel as exportWorkbook } from "@/lib/utils/excelExport";
import { IndiaMap, MAP_STATES, shapesForStateCode } from "@/components/warranty/IndiaMap";

interface StateRow { StateId: string; StateCode?: string; StateName: string; ShortName?: string; Sets: number; Warranties: number; ActiveWarranties: number; Customers: number; Dealers: number; Calls: number }
interface DistrictRow { District: string; Sets: number; Customers: number }
/** Totals of one map shape (a shape can hold more than one master state, e.g. J&K + Ladakh). */
interface ShapeAgg { id: string; name: string; rows: StateRow[]; Sets: number; Warranties: number; ActiveWarranties: number; Customers: number; Dealers: number; Calls: number }

type MetricKey = "sets" | "active" | "calls" | "intensity";
const METRICS: Record<MetricKey, { label: string; short: string; hint: string; value: (a: Pick<ShapeAgg, "Sets" | "ActiveWarranties" | "Calls">) => number; decimals: number }> = {
  sets: { label: "Pump sets", short: "sets", hint: "Registered pump sets (installations) per state", value: (a) => a.Sets, decimals: 0 },
  active: { label: "Active warranties", short: "active", hint: "Component warranties still running today", value: (a) => a.ActiveWarranties, decimals: 0 },
  calls: { label: "Service calls", short: "calls", hint: "Service calls booked per state", value: (a) => a.Calls, decimals: 0 },
  intensity: { label: "Calls / 100 sets", short: "per 100", hint: "Service calls per 100 installed sets — darker = heavier service load", value: (a) => (a.Sets ? (a.Calls * 100) / a.Sets : 0), decimals: 1 },
};

/** One-hue sequential ramp (blue 100 → 700): light = fewer, dark = more. States without data stay neutral. */
const RAMP = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
const NO_DATA = "#e5e9f0";
const levelOf = (v: number, max: number) => (v <= 0 || max <= 0 ? -1 : Math.min(RAMP.length - 1, Math.ceil((RAMP.length * v) / max) - 1));
const fmt = (v: number, decimals: number) => (decimals ? v.toFixed(decimals) : inr(Math.round(v)));
const pct = (n: number, d: number) => (d > 0 ? Math.round((n * 100) / d) : 0);
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Geo-Graphical Report: an India map of the installed base, a state profile with its districts, plain-language insights and the state table. */
export default function GeoReportPage() {
  const [states, setStates] = useState<StateRow[]>([]);
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [stateId, setStateId] = useState<string | null>(null);
  const [emptyShape, setEmptyShape] = useState<string | null>(null); // a clicked state with no installations
  const [metric, setMetric] = useState<MetricKey>("sets");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id: string | null) => {
    setLoading(true);
    try {
      const data = (await axios.post("/api/warranty/geo", { stateId: id })).data;
      setStates(data.states); setDistricts(data.districts);
    } catch (err) {
      reportFormError(err, { fallback: "Could not build the geo report" });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(stateId); }, [stateId, load]);
  useUrlQuery("state", (id) => setStateId(id));

  const pick = (id: string | null) => {
    setStateId(id);
    setEmptyShape(null);
    window.history.replaceState(null, "", id ? `/warranty/geo?state=${id}` : "/warranty/geo");
  };

  /* ---------- aggregates ---------- */
  const { shapes, offMap } = useMemo(() => {
    const byShape = new Map<string, ShapeAgg>();
    const outside: StateRow[] = [];
    for (const r of states) {
      const ids = shapesForStateCode(r.StateCode);
      if (!ids.length) { outside.push(r); continue; }
      // A merged UT drawn as two shapes counts once — on its first shape; the second only shares its colour.
      ids.forEach((id, i) => {
        const name = MAP_STATES.find((m) => m.id === id)?.name || titleCase(r.StateName);
        const a = byShape.get(id) || { id, name, rows: [], Sets: 0, Warranties: 0, ActiveWarranties: 0, Customers: 0, Dealers: 0, Calls: 0 };
        a.rows.push(r);
        if (i === 0) { a.Sets += r.Sets; a.Warranties += r.Warranties; a.ActiveWarranties += r.ActiveWarranties; a.Customers += r.Customers; a.Dealers += r.Dealers; a.Calls += r.Calls; }
        byShape.set(id, a);
      });
    }
    byShape.forEach((a) => a.rows.sort((x, y) => y.Sets - x.Sets));
    return { shapes: byShape, offMap: outside };
  }, [states]);

  const total = (key: "Sets" | "Warranties" | "ActiveWarranties" | "Customers" | "Calls" | "Dealers") => states.reduce((sum, s) => sum + Number(s[key] || 0), 0);
  const T = { Sets: total("Sets"), Warranties: total("Warranties"), Active: total("ActiveWarranties"), Customers: total("Customers"), Calls: total("Calls") };
  const nationalIntensity = T.Sets ? (T.Calls * 100) / T.Sets : 0;

  const m = METRICS[metric];
  // One entry per state group (a merged UT drawn as two shapes is counted on its first shape only).
  const primaryOf = (a: ShapeAgg) => shapes.get(shapesForStateCode(a.rows[0]?.StateCode)[0]) || a;
  const counted = Array.from(shapes.values()).filter((a) => primaryOf(a) === a);
  const valueOf = (id: string) => { const a = shapes.get(id); return a ? m.value(primaryOf(a)) : 0; };
  const max = Math.max(0, ...counted.map((a) => m.value(a)));
  const ranked = [...counted].filter((a) => m.value(a) > 0).sort((x, y) => m.value(y) - m.value(x));

  const selectedRow = states.find((s) => s.StateId === stateId) || null;
  const selectedShapes = selectedRow ? shapesForStateCode(selectedRow.StateCode) : emptyShape ? [emptyShape] : [];
  const selectedAgg = selectedRow ? shapes.get(shapesForStateCode(selectedRow.StateCode)[0]) : undefined;

  const onShape = (id: string) => {
    if (selectedShapes.includes(id)) { pick(null); return; }
    const a = shapes.get(id);
    if (a?.rows.length) pick(a.rows[0].StateId);
    else { pick(null); setEmptyShape(id); }
  };

  /* ---------- insights ---------- */
  const bySets = [...counted].sort((x, y) => y.Sets - x.Sets);
  const top = bySets[0];
  const top3Share = pct(bySets.slice(0, 3).reduce((s, a) => s + a.Sets, 0), T.Sets);
  const loadPool = counted.filter((a) => a.Sets >= 2).length ? counted.filter((a) => a.Sets >= 2) : counted.filter((a) => a.Sets > 0);
  const heaviest = [...loadPool].sort((x, y) => METRICS.intensity.value(y) - METRICS.intensity.value(x))[0];
  const coverPool = counted.filter((a) => a.Warranties > 0);
  const weakest = [...coverPool].sort((x, y) => x.ActiveWarranties / x.Warranties - y.ActiveWarranties / y.Warranties)[0];

  /* ---------- export ---------- */
  const exportExcel = () => exportWorkbook({
    title: "Geo-Graphical Report",
    filters: { State: selectedRow?.StateName },
    sheets: [
      { name: "State-wise", columns: [
        { header: "State", value: (r: StateRow) => r.StateName },
        { header: "Pump sets", value: (r: StateRow) => r.Sets, type: "number", total: true },
        { header: "Share of sets %", value: (r: StateRow) => (T.Sets ? (r.Sets * 100) / T.Sets : 0), type: "percent" },
        { header: "Component warranties", value: (r: StateRow) => r.Warranties, type: "number", total: true },
        { header: "Active", value: (r: StateRow) => r.ActiveWarranties, type: "number", total: true },
        { header: "Active %", value: (r: StateRow) => (r.Warranties ? (r.ActiveWarranties * 100) / r.Warranties : null), type: "percent" },
        { header: "Customers", value: (r: StateRow) => r.Customers, type: "number", total: true },
        { header: "Dealers", value: (r: StateRow) => r.Dealers, type: "number", total: true },
        { header: "Service calls", value: (r: StateRow) => r.Calls, type: "number", total: true },
        { header: "Calls per 100 sets", value: (r: StateRow) => (r.Sets ? (r.Calls * 100) / r.Sets : null), type: "number" },
      ], rows: states },
      ...(selectedRow ? [{ name: `District-wise ${selectedRow.StateName}`, title: `District-wise · ${selectedRow.StateName}`, columns: [
        { header: "District", value: (d: DistrictRow) => d.District },
        { header: "Pump sets", value: (d: DistrictRow) => d.Sets, type: "number" as const, total: true },
        { header: "Customers", value: (d: DistrictRow) => d.Customers, type: "number" as const, total: true },
      ], rows: districts }] : []),
    ],
  });

  /* ---------- table ---------- */
  const columns = [
    { title: "State", dataIndex: "StateName", key: "state", render: (v: string, r: StateRow) => <span className={`font-semibold ${r.StateId === stateId ? "text-blue-800" : "text-blue-700"}`}>{v}</span> },
    { title: "Pump sets", dataIndex: "Sets", key: "sets", align: "right" as const, sorter: (a: StateRow, b: StateRow) => a.Sets - b.Sets, defaultSortOrder: "descend" as const },
    { title: "Share", key: "share", align: "right" as const, render: (_: any, r: StateRow) => <span className="text-slate-500">{pct(r.Sets, T.Sets)}%</span> },
    { title: "Component warranties", dataIndex: "Warranties", key: "w", align: "right" as const, sorter: (a: StateRow, b: StateRow) => a.Warranties - b.Warranties },
    { title: "Active", dataIndex: "ActiveWarranties", key: "a", align: "right" as const, sorter: (a: StateRow, b: StateRow) => a.ActiveWarranties - b.ActiveWarranties },
    { title: "Active %", key: "ap", align: "right" as const, render: (_: any, r: StateRow) => (r.Warranties ? `${pct(r.ActiveWarranties, r.Warranties)}%` : "—") },
    { title: "Customers", dataIndex: "Customers", key: "c", align: "right" as const },
    { title: "Dealers", dataIndex: "Dealers", key: "d", align: "right" as const },
    { title: "Service calls", dataIndex: "Calls", key: "calls", align: "right" as const, sorter: (a: StateRow, b: StateRow) => a.Calls - b.Calls },
    { title: "Calls / 100 sets", key: "int", align: "right" as const, sorter: (a: StateRow, b: StateRow) => (a.Sets ? a.Calls / a.Sets : 0) - (b.Sets ? b.Calls / b.Sets : 0), render: (_: any, r: StateRow) => (r.Sets ? ((r.Calls * 100) / r.Sets).toFixed(1) : "—") },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<GlobalOutlined />} title="Geo-Graphical Report" subtitle="Where pump sets are installed, how their warranties stand and where service load is heaviest — click any state"
        actions={<>
          <ExportExcelButton onExport={exportExcel} disabled={!states.length} />
          <Button icon={<ReloadOutlined />} onClick={() => load(stateId)} loading={loading}>Refresh</Button>
        </>} />

      <StatStrip items={[
        { label: "States", value: states.length },
        { label: "Pump sets", value: inr(T.Sets) },
        { label: "Component warranties", value: inr(T.Warranties) },
        { label: "Active warranties", value: inr(T.Active), tone: "ok" },
        { label: "Customers", value: inr(T.Customers) },
        { label: "Service calls", value: inr(T.Calls), tone: "warn" },
      ]} />

      {loading && !states.length ? <PageLoader label="Building the report…" minHeight={260} /> : !states.length ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10"><Empty description="No installations registered yet" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-4">
            {/* ---- India map ---- */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col min-w-0">
              <header className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">India footprint · {m.label}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{m.hint}</p>
                </div>
                <Segmented size="small" value={metric} onChange={(v) => setMetric(v as MetricKey)}
                  options={(Object.keys(METRICS) as MetricKey[]).map((k) => ({ value: k, label: METRICS[k].label }))} />
              </header>
              <div className="relative p-4 flex-1">
                <IndiaMap
                  selected={selectedShapes}
                  onSelect={onShape}
                  fillFor={(id) => { const l = levelOf(valueOf(id), max); return l < 0 ? NO_DATA : RAMP[l]; }}
                  textFor={(id) => (levelOf(valueOf(id), max) >= 2 ? "#ffffff" : "#0f172a")}
                  labelFor={(id) => { const v = valueOf(id); return v > 0 ? fmt(v, m.decimals) : null; }}
                  renderTooltip={(id, name) => {
                    const a = shapes.get(id);
                    if (!a) return <><div className="text-sm font-bold text-slate-900">{name}</div><div className="text-xs text-slate-500 mt-1">No pump sets registered yet</div></>;
                    const main = primaryOf(a);
                    return (
                      <>
                        <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-900">{name}</span><span className="text-[11px] text-slate-400">{pct(main.Sets, T.Sets)}% of sets</span></div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                          <span className="text-slate-500">Pump sets</span><b className="text-right text-slate-900">{inr(main.Sets)}</b>
                          <span className="text-slate-500">Active warranties</span><b className="text-right text-slate-900">{inr(main.ActiveWarranties)}<span className="font-normal text-slate-400"> / {inr(main.Warranties)}</span></b>
                          <span className="text-slate-500">Customers</span><b className="text-right text-slate-900">{inr(main.Customers)}</b>
                          <span className="text-slate-500">Service calls</span><b className="text-right text-slate-900">{inr(main.Calls)}</b>
                          <span className="text-slate-500">Calls / 100 sets</span><b className="text-right text-slate-900">{main.Sets ? METRICS.intensity.value(main).toFixed(1) : "—"}</b>
                        </div>
                        <div className="mt-2 text-[11px] text-blue-600">Click to {selectedShapes.includes(id) ? "clear" : "see districts"}</div>
                      </>
                    );
                  }}
                />
                {/* Legend: stepped ramp with its value bands */}
                <div className="absolute left-5 bottom-4 rounded-lg bg-white/90 border border-slate-200 px-3 py-2 shadow-xs">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">{m.label}</div>
                  <div className="flex items-end gap-1">
                    <div className="text-center"><span className="block h-3 w-9 rounded-sm" style={{ background: NO_DATA }} /><span className="text-[10px] text-slate-500">none</span></div>
                    {RAMP.map((c, i) => {
                      // Band i holds values in (max·i/5, max·(i+1)/5]; for whole numbers that is floor(lo)+1 … floor(hi).
                      const lo = (max * i) / RAMP.length, hi = (max * (i + 1)) / RAMP.length;
                      const from = Math.floor(lo) + 1, to = Math.floor(hi);
                      if (max <= 0 || (!m.decimals && from > to)) return null;
                      const band = m.decimals ? `${lo.toFixed(1)}–${hi.toFixed(1)}` : from === to ? `${from}` : `${from}–${to}`;
                      return <div key={c} className="text-center"><span className="block h-3 w-9 rounded-sm" style={{ background: c }} /><span className="text-[10px] text-slate-500 whitespace-nowrap">{band}</span></div>;
                    })}
                  </div>
                </div>
              </div>
              {offMap.length > 0 && (
                <div className="px-5 pb-4 -mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-400">Not on the map:</span>
                  {offMap.map((r) => (
                    <button key={r.StateId} type="button" onClick={() => pick(r.StateId === stateId ? null : r.StateId)}
                      className={`rounded-full border px-2.5 py-0.5 ${r.StateId === stateId ? "border-slate-900 text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                      {titleCase(r.StateName)} · {r.Sets} sets
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ---- State profile / All-India leaderboard ---- */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col min-w-0">
              {selectedRow ? (() => {
                const a = selectedAgg || { ...selectedRow, ActiveWarranties: selectedRow.ActiveWarranties } as any;
                const rank = bySets.findIndex((x) => x.rows.some((r) => r.StateId === selectedRow.StateId)) + 1;
                const inactive = Math.max(0, a.Warranties - a.ActiveWarranties);
                const intensity = a.Sets ? (a.Calls * 100) / a.Sets : 0;
                const tiles: { label: string; value: React.ReactNode; sub?: string; tone?: string }[] = [
                  { label: "Pump sets", value: inr(a.Sets), sub: `${pct(a.Sets, T.Sets)}% of all India` },
                  { label: "Active warranties", value: inr(a.ActiveWarranties), sub: a.Warranties ? `${pct(a.ActiveWarranties, a.Warranties)}% of ${inr(a.Warranties)}` : "no warranties", tone: "text-emerald-700" },
                  { label: "Customers", value: inr(a.Customers) },
                  { label: "Dealers", value: inr(a.Dealers) },
                  { label: "Service calls", value: inr(a.Calls), tone: "text-amber-700" },
                  { label: "Calls / 100 sets", value: a.Sets ? intensity.toFixed(1) : "—", sub: `All India ${nationalIntensity.toFixed(1)}`, tone: intensity > nationalIntensity * 1.25 ? "text-red-600" : undefined },
                ];
                return (
                  <>
                    <header className="px-5 py-3.5 border-b border-slate-100 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-blue-600">State profile</div>
                        <h2 className="text-lg font-extrabold text-slate-900 leading-tight truncate">{titleCase(selectedRow.StateName)}</h2>
                        <p className="text-xs text-slate-500 mt-0.5">{rank ? `#${rank} of ${bySets.filter((x) => x.Sets > 0).length} states by pump sets · ` : ""}{inr(districts.length)} district{districts.length === 1 ? "" : "s"}</p>
                      </div>
                      <Tooltip title="Back to all India"><Button size="small" type="text" icon={<CloseOutlined />} onClick={() => pick(null)} /></Tooltip>
                    </header>
                    <div className="p-5 space-y-5 flex-1">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {tiles.map((t) => (
                          <div key={t.label} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                            <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{t.label}</div>
                            <div className={`text-xl font-extrabold leading-tight mt-1 ${t.tone || "text-slate-900"}`}>{t.value}</div>
                            {t.sub && <div className="text-[11px] text-slate-400 mt-0.5">{t.sub}</div>}
                          </div>
                        ))}
                      </div>

                      {a.Warranties > 0 && (
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5"><span className="font-semibold text-slate-700">Warranty health</span><span className="text-slate-400">{inr(a.Warranties)} component warranties</span></div>
                          <div className="flex h-3 w-full overflow-hidden rounded-[4px] bg-slate-100 gap-[2px]">
                            <div className="h-full" style={{ width: `${(a.ActiveWarranties / a.Warranties) * 100}%`, background: VIZ.aqua }} />
                            {inactive > 0 && <div className="h-full" style={{ width: `${(inactive / a.Warranties) * 100}%`, background: "#cbd5e1" }} />}
                          </div>
                          <div className="flex gap-4 mt-1.5 text-[11px] text-slate-500">
                            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: VIZ.aqua }} />Active {inr(a.ActiveWarranties)}</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />Expired / void {inr(inactive)}</span>
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between text-xs mb-2.5"><span className="font-semibold text-slate-700">Pump sets by district</span>{districts.length > 10 && <span className="text-slate-400">top 10 of {districts.length}</span>}</div>
                        {loading && !districts.length ? <PageLoader label="Loading districts…" minHeight={120} /> : districts.length
                          ? <RankedBars items={districts.slice(0, 10).map((d) => ({ name: d.District, value: d.Sets }))} color={VIZ.blue} />
                          : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No districts recorded" />}
                      </div>
                    </div>
                  </>
                );
              })() : emptyShape ? (
                <>
                  <header className="px-5 py-3.5 border-b border-slate-100 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-blue-600">State profile</div>
                      <h2 className="text-lg font-extrabold text-slate-900 leading-tight">{MAP_STATES.find((s) => s.id === emptyShape)?.name}</h2>
                    </div>
                    <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setEmptyShape(null)} />
                  </header>
                  <div className="p-8 flex-1 flex items-center justify-center"><Empty description="No pump sets registered in this state yet" /></div>
                </>
              ) : (
                <>
                  <header className="px-5 py-3.5 border-b border-slate-100">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-blue-600">All India</div>
                    <h2 className="text-sm font-bold text-slate-900 mt-0.5">States by {m.label.toLowerCase()}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Pick a state on the map or below to open its profile.</p>
                  </header>
                  <div className="p-3 flex-1 overflow-auto max-h-[560px]">
                    {ranked.length ? ranked.map((a, i) => {
                      const v = m.value(a), share = max > 0 ? (v / max) * 100 : 0;
                      return (
                        <button key={a.id} type="button" onClick={() => a.rows[0] && pick(a.rows[0].StateId)}
                          className="w-full grid grid-cols-[1.75rem_minmax(0,9rem)_1fr_3.5rem] items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50 transition-colors">
                          <span className={`text-xs font-bold text-center rounded-md py-0.5 ${i < 3 ? "bg-blue-50 text-blue-700" : "text-slate-400"}`}>{i + 1}</span>
                          <span className="truncate text-[13px] font-medium text-slate-800">{a.name}</span>
                          <span className="h-3 rounded-[4px] bg-slate-100 overflow-hidden"><span className="block h-full rounded-[4px]" style={{ width: `${share}%`, background: VIZ.blue }} /></span>
                          <b className="text-right text-[13px] text-slate-900">{fmt(v, m.decimals)}</b>
                        </button>
                      );
                    }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${m.label.toLowerCase()} yet`} />}
                  </div>
                </>
              )}
            </section>
          </div>

          {/* ---- Insights ---- */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              top && { key: "top", icon: <RiseOutlined />, accent: "#2a78d6", title: "Biggest installed base", head: `${top.name} · ${pct(top.Sets, T.Sets)}%`,
                body: `${inr(top.Sets)} of ${inr(T.Sets)} pump sets. The top ${Math.min(3, bySets.filter((x) => x.Sets > 0).length)} states hold ${top3Share}% of the installed base.`, state: top },
              heaviest && heaviest.Sets > 0 && { key: "load", icon: <ToolOutlined />, accent: "#eb6834", title: "Heaviest service load", head: `${heaviest.name} · ${METRICS.intensity.value(heaviest).toFixed(1)} calls / 100 sets`,
                body: `${inr(heaviest.Calls)} calls on ${inr(heaviest.Sets)} sets, against ${nationalIntensity.toFixed(1)} per 100 sets for all India.`, state: heaviest },
              weakest && { key: "cover", icon: <SafetyCertificateOutlined />, accent: "#1baf7a", title: "Lowest warranty cover", head: `${weakest.name} · ${pct(weakest.ActiveWarranties, weakest.Warranties)}% active`,
                body: `${inr(weakest.ActiveWarranties)} of ${inr(weakest.Warranties)} component warranties still running, against ${pct(T.Active, T.Warranties)}% for all India.`, state: weakest },
            ].filter(Boolean).map((c: any) => (
              <button key={c.key} type="button" onClick={() => c.state.rows[0] && pick(c.state.rows[0].StateId)}
                className="text-left bg-white rounded-xl border border-slate-200 shadow-xs px-4 py-3.5 hover:shadow-md hover:border-slate-300 transition-all" style={{ borderLeft: `4px solid ${c.accent}` }}>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500"><span style={{ color: c.accent }}>{c.icon}</span>{c.title}</div>
                <div className="text-base font-extrabold text-slate-900 mt-1.5">{c.head}</div>
                <div className="text-xs text-slate-500 mt-1 leading-relaxed">{c.body}</div>
                <div className="text-[11px] text-blue-600 mt-2 inline-flex items-center gap-1"><AimOutlined /> Show on map</div>
              </button>
            ))}
          </div>

          {/* ---- State table ---- */}
          <div className={TABLE_CARD}>
            <Table dataSource={states} columns={columns} rowKey="StateId" size="middle" loading={loading} scroll={{ x: 1000 }} pagination={{ defaultPageSize: 25, showSizeChanger: true }}
              onRow={(r: StateRow) => ({ onClick: () => pick(r.StateId === stateId ? null : r.StateId), className: `cursor-pointer ${r.StateId === stateId ? "[&>td]:!bg-blue-50" : ""}` })}
              summary={(rows) => {
                const sum = (k: keyof StateRow) => rows.reduce((s, r) => s + Number((r as any)[k] || 0), 0);
                const sets = sum("Sets"), w = sum("Warranties"), act = sum("ActiveWarranties"), calls = sum("Calls");
                const cells = [inr(sets), "100%", inr(w), inr(act), w ? `${pct(act, w)}%` : "—", inr(sum("Customers")), inr(sum("Dealers")), inr(calls), sets ? ((calls * 100) / sets).toFixed(1) : "—"];
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}><b>Total</b></Table.Summary.Cell>
                    {cells.map((c, i) => <Table.Summary.Cell key={i} index={i + 1} align="right"><b>{c}</b></Table.Summary.Cell>)}
                  </Table.Summary.Row>
                );
              }} />
          </div>
        </>
      )}
    </div>
  );
}
