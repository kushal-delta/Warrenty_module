"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button, Empty, Table } from "antd";
import { GlobalOutlined, ReloadOutlined } from "@ant-design/icons";
import axios from "axios";
import { RankedBars, VIZ } from "@/components/dashboard/Charts";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { PageLoader } from "@/components/common/Loader";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";
import { reportFormError } from "@/lib/utils/formErrors";

interface StateRow { StateId: string; StateName: string; ShortName?: string; Sets: number; Warranties: number; ActiveWarranties: number; Customers: number; Dealers: number; Calls: number }
interface DistrictRow { District: string; Sets: number; Customers: number }

/** One-hue sequential ramp (light → dark = fewer → more installed sets). */
const RAMP = [{ bg: "#eef2f7", fg: "#64748b" }, { bg: "#cde2fb", fg: "#184f95" }, { bg: "#86b6ef", fg: "#0d366b" }, { bg: "#3987e5", fg: "#ffffff" }, { bg: "#1c5cab", fg: "#ffffff" }, { bg: "#0d366b", fg: "#ffffff" }];
const levelOf = (n: number, max: number) => (n <= 0 ? 0 : Math.min(5, 1 + Math.floor((4 * n) / Math.max(1, max))));

/** Geo-Graphical Report: registered pump sets by state, with a click-through district split. */
export default function GeoReportPage() {
  const [states, setStates] = useState<StateRow[]>([]);
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [stateId, setStateId] = useState<string | null>(null);
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
    window.history.replaceState(null, "", id ? `/warranty/geo?state=${id}` : "/warranty/geo");
  };

  const max = Math.max(1, ...states.map((s) => s.Sets));
  const selected = states.find((s) => s.StateId === stateId);
  const total = (key: keyof StateRow) => states.reduce((sum, s) => sum + Number(s[key] || 0), 0);

  const columns = [
    { title: "State", dataIndex: "StateName", key: "state", render: (v: string, r: StateRow) => <a className="font-semibold text-blue-700" onClick={() => pick(r.StateId)}>{v}</a> },
    { title: "Pump sets", dataIndex: "Sets", key: "sets", align: "right" as const, sorter: (a: StateRow, b: StateRow) => a.Sets - b.Sets, defaultSortOrder: "descend" as const },
    { title: "Component warranties", dataIndex: "Warranties", key: "w", align: "right" as const, sorter: (a: StateRow, b: StateRow) => a.Warranties - b.Warranties },
    { title: "Active", dataIndex: "ActiveWarranties", key: "a", align: "right" as const, sorter: (a: StateRow, b: StateRow) => a.ActiveWarranties - b.ActiveWarranties },
    { title: "Customers", dataIndex: "Customers", key: "c", align: "right" as const },
    { title: "Dealers", dataIndex: "Dealers", key: "d", align: "right" as const },
    { title: "Service calls", dataIndex: "Calls", key: "calls", align: "right" as const, sorter: (a: StateRow, b: StateRow) => a.Calls - b.Calls },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<GlobalOutlined />} title="Geo-Graphical Report" subtitle="Registered pump sets by state — click a state for the district split"
        actions={<Button icon={<ReloadOutlined />} onClick={() => load(stateId)} loading={loading}>Refresh</Button>} />

      <StatStrip items={[
        { label: "States", value: states.length },
        { label: "Pump sets", value: inr(total("Sets")) },
        { label: "Component warranties", value: inr(total("Warranties")) },
        { label: "Active warranties", value: inr(total("ActiveWarranties")), tone: "ok" },
        { label: "Customers", value: inr(total("Customers")) },
        { label: "Service calls", value: inr(total("Calls")), tone: "warn" },
      ]} />

      {loading && !states.length ? <PageLoader label="Building the report…" minHeight={260} /> : !states.length ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10"><Empty description="No installations registered yet" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-4">
            <section className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col">
              <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">State heat map</h2>
                <span className="text-xs text-slate-400">darker = more installed sets</span>
              </header>
              <div className="p-5">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
                  {states.map((s) => {
                    const r = RAMP[levelOf(s.Sets, max)];
                    return (
                      <button key={s.StateId} type="button" title={`${s.StateName}: ${s.Sets} pump sets`} onClick={() => pick(stateId === s.StateId ? null : s.StateId)}
                        className={`rounded-lg px-2 py-2.5 text-center transition-all hover:scale-[1.03] ${stateId === s.StateId ? "ring-2 ring-offset-1 ring-teal-600" : ""}`} style={{ background: r.bg, color: r.fg }}>
                        <div className="text-[11px] font-bold tracking-wide truncate">{s.ShortName || s.StateName.slice(0, 3).toUpperCase()}</div>
                        <div className="text-lg font-extrabold leading-tight">{s.Sets}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 mt-4 text-[11px] text-slate-500"><span>Fewer</span>{RAMP.map((r, i) => <span key={i} className="h-3 w-6 rounded-sm" style={{ background: r.bg }} />)}<span>More</span></div>
              </div>
            </section>

            <div className="space-y-4">
              {selected && (
                <section className="bg-white rounded-xl border border-slate-200 shadow-xs">
                  <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900">District-wise · {selected.StateName}</h2>
                    <a className="text-xs text-blue-600" onClick={() => pick(null)}>clear</a>
                  </header>
                  <div className="p-5">{districts.length ? <RankedBars items={districts.slice(0, 12).map((d) => ({ name: d.District, value: d.Sets }))} color={VIZ.aqua} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No installations" />}</div>
                </section>
              )}
              <section className="bg-white rounded-xl border border-slate-200 shadow-xs">
                <header className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">Top states</h2></header>
                <div className="p-5"><RankedBars items={states.slice(0, 8).map((s) => ({ name: s.StateName, value: s.Sets }))} color={VIZ.blue} /></div>
              </section>
            </div>
          </div>

          <div className={TABLE_CARD}>
            <Table dataSource={states} columns={columns} rowKey="StateId" size="middle" loading={loading} scroll={{ x: 800 }} pagination={{ defaultPageSize: 25, showSizeChanger: true }}
              summary={(rows) => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><b>Total</b></Table.Summary.Cell>
                  {["Sets", "Warranties", "ActiveWarranties", "Customers", "Dealers", "Calls"].map((k, i) => (
                    <Table.Summary.Cell key={k} index={i + 1} align="right"><b>{inr(rows.reduce((sum, r) => sum + Number((r as any)[k] || 0), 0))}</b></Table.Summary.Cell>
                  ))}
                </Table.Summary.Row>
              )} />
          </div>
        </>
      )}
    </div>
  );
}
