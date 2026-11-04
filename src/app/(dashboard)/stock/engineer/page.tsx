"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Button, Empty, Table } from "antd";
import { DownloadOutlined, ReloadOutlined, TeamOutlined } from "@ant-design/icons";
import { useStockStore } from "@/lib/store/useStockStore";
import { PageHeader, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { PageLoader } from "@/components/common/Loader";
import { reportFormError } from "@/lib/utils/formErrors";

/** Engineer-wise Stock: good stock carried by each field engineer — a card per engineer and a spare × engineer matrix. */
export default function EngineerStockPage() {
  const { stock, fetchStock, isLoading } = useStockStore();
  const [loaded, setLoaded] = useState(false);
  const refresh = () => fetchStock({ locType: "ENG" }).catch((err) => reportFormError(err, { fallback: "Could not load engineer stock" })).finally(() => setLoaded(true));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { engineers, spares, cell } = useMemo(() => {
    const rows = stock.filter((r) => r.LocType === "ENG");
    const eng = new Map<string, { id: string; name: string; centre?: string; units: number; value: number; lines: number }>();
    const sp = new Map<string, { id: string; code: string; name: string; rate: number }>();
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const e = eng.get(r.LocId) || { id: r.LocId, name: r.LocName, centre: r.ServiceCenterName, units: 0, value: 0, lines: 0 };
      e.units += r.Good; e.value += r.Value; e.lines += 1;
      eng.set(r.LocId, e);
      sp.set(r.SpareId, { id: r.SpareId, code: r.SpareCode, name: r.SpareName, rate: r.Rate });
      map.set(`${r.LocId}|${r.SpareId}`, r.Good);
    });
    return {
      engineers: Array.from(eng.values()).sort((a, b) => a.name.localeCompare(b.name)),
      spares: Array.from(sp.values()).sort((a, b) => a.name.localeCompare(b.name)),
      cell: (e: string, s: string) => map.get(`${e}|${s}`),
    };
  }, [stock]);

  const exportExcel = () => {
    const aoa = [["Spare", "Code", ...engineers.map((e) => e.name), "Total"], ...spares.map((s) => [s.name, s.code, ...engineers.map((e) => cell(e.id, s.id) ?? 0), engineers.reduce((t, e) => t + (cell(e.id, s.id) ?? 0), 0)])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Engineer stock");
    XLSX.writeFile(wb, "Engineer_wise_stock.xlsx");
  };

  if (!loaded) return <PageLoader label="Loading engineer stock…" minHeight="50vh" />;

  const columns = [
    { title: "Spare", key: "spare", fixed: "left" as const, width: 260, render: (_: any, s: any) => <div><b className="text-slate-800">{s.name}</b> <span className="text-[11px] text-slate-400">{s.code}</span></div> },
    ...engineers.map((e) => ({ title: e.name.trim(), key: e.id, align: "right" as const, width: 120, render: (_: any, s: any) => { const g = cell(e.id, s.id); return g === undefined ? <span className="text-slate-300">–</span> : <span className={g <= 0 ? "text-red-600" : ""}>{g}</span>; } })),
    { title: "Total", key: "total", align: "right" as const, width: 90, render: (_: any, s: any) => <b>{engineers.reduce((t, e) => t + (cell(e.id, s.id) ?? 0), 0)}</b> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<TeamOutlined />} title="Engineer-wise Stock" subtitle="Good stock carried by each field engineer"
        actions={<><Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={!engineers.length}>Export Excel</Button><Button icon={<ReloadOutlined />} onClick={refresh} loading={isLoading}>Refresh</Button></>} />

      {!engineers.length ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10"><Empty description="No engineer stock yet — transfer spares to an engineer in Stock Ledger & Entry" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
            {engineers.map((e) => (
              <div key={e.id} className="bg-white rounded-xl border border-slate-200 shadow-xs px-4 py-3.5" style={{ borderLeft: "4px solid #0d9488" }}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{e.name.trim()}</div>
                <div className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-none">{inr(e.units)}<small className="text-xs font-semibold text-slate-400"> units</small></div>
                <div className="text-xs text-slate-500 mt-2 truncate">{e.centre || "—"} · {e.lines} spare{e.lines > 1 ? "s" : ""} · ₹ {inr(e.value)}</div>
              </div>
            ))}
          </div>

          <section className={TABLE_CARD}>
            <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Spare × engineer matrix</h2><span className="text-xs text-slate-400">good units</span></header>
            <Table size="middle" rowKey="id" dataSource={spares} columns={columns} pagination={false} scroll={{ x: 360 + engineers.length * 120 }}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}><b>Total</b></Table.Summary.Cell>
                  {engineers.map((e, i) => <Table.Summary.Cell key={e.id} index={i + 1} align="right"><b>{inr(e.units)}</b></Table.Summary.Cell>)}
                  <Table.Summary.Cell index={engineers.length + 1} align="right"><b>{inr(engineers.reduce((t, e) => t + e.units, 0))}</b></Table.Summary.Cell>
                </Table.Summary.Row>
              )} />
          </section>
        </>
      )}
    </div>
  );
}
