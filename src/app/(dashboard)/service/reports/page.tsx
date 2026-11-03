"use client";

import React, { useEffect, useState } from "react";
import { Button, DatePicker, Table, Tabs, Tag } from "antd";
import { BarChartOutlined, ReloadOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { useServiceOpsStore } from "@/lib/store/useServiceOpsStore";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

/** Service MIS: call summary, job card detail, replacement (CN effect) and warranty claim summary. */
export default function ServiceReportsPage() {
  const { fetchReports } = useServiceOpsStore();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await fetchReports({ fromDate: range?.[0]?.startOf("day").toISOString(), toDate: range?.[1]?.endOf("day").toISOString() }));
    } catch (err) {
      reportFormError(err, { fallback: "Could not build reports" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const byStatus: Record<string, number> = Object.fromEntries((data?.calls.byStatus || []).map((r: any) => [r.Status, r.Calls]));
  const totalCalls = Object.values(byStatus).reduce((s, n) => s + Number(n), 0);
  const openCalls = Object.entries(byStatus).filter(([s]) => !["Closed", "Resolved", "Cancelled"].includes(s)).reduce((sum, [, n]) => sum + Number(n), 0);
  const ageing = data?.calls.ageing || {};
  const jc = (data?.jobCards || []) as any[];
  const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const people = (title: string) => [
    { title, dataIndex: "Name", key: "n" }, { title: "Total", dataIndex: "Total", key: "t", align: "right" as const },
    { title: "Open", dataIndex: "Open", key: "o", align: "right" as const }, { title: "Closed / Resolved", dataIndex: "Closed", key: "c", align: "right" as const },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<BarChartOutlined />} title="Service Reports" subtitle="Call summary, job card detail, replacement credit-note effect and warranty claim summary"
        actions={<>
          <DatePicker.RangePicker value={range as any} onChange={(v) => setRange(v as any)} format="DD/MM/YYYY" allowClear />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        </>} />

      <StatStrip items={[
        { label: "Calls", value: totalCalls },
        { label: "Open calls", value: openCalls, tone: "warn" },
        { label: "Open > 7 days", value: Number(ageing.d8_15 || 0) + Number(ageing.d15plus || 0), tone: "danger" },
        { label: "Job card value ₹", value: inr(sum(jc, "Total")) },
        { label: "Warranty borne ₹", value: inr(sum(jc, "Warranty")), tone: "ok" },
        { label: "Credit notes ₹", value: inr(Array.from(new Map((data?.replacements || []).map((r: any) => [r.ReplNo, Number(r.CnAmount || 0)])).values()).reduce((s: number, n: any) => s + n, 0)) },
      ]} />

      <div className={`${TABLE_CARD} px-4 pb-4`}>
        <Tabs items={[
          { key: "calls", label: "Call Summary", children: <div className="space-y-5">
            <div className="flex flex-wrap gap-2">{Object.entries(byStatus).map(([s, n]) => <Tag key={s} className="text-sm px-3 py-1">{s}: <b>{n as number}</b></Tag>)}</div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Open call ageing</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[["0–2 days", ageing.d0_2], ["3–7 days", ageing.d3_7], ["8–15 days", ageing.d8_15], ["Over 15 days", ageing.d15plus]].map(([l, v]) => (
                  <div key={l} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><div className="text-[11px] text-slate-500">{l}</div><div className="text-lg font-bold">{Number(v || 0)}</div></div>
                ))}
              </div>
            </div>
            <div className="grid lg:grid-cols-2 gap-5">
              <Table size="small" rowKey="Name" loading={loading} dataSource={data?.calls.byCenter || []} pagination={false} columns={[...people("Service Center"), { title: "Avg days to close", dataIndex: "AvgDaysToClose", key: "a", align: "right" as const, render: (v: number) => v ?? "—" }]} />
              <Table size="small" rowKey="Name" loading={loading} dataSource={data?.calls.byEngineer || []} pagination={false} columns={[...people("Engineer"), { title: "Visits", dataIndex: "Visits", key: "v", align: "right" as const }]} />
            </div>
          </div> },
          { key: "jc", label: "Job Card Detail", children: <div className="space-y-4">
            <Table size="small" rowKey="Status" loading={loading} dataSource={jc} pagination={false} columns={[
              { title: "Status", dataIndex: "Status" }, { title: "Job cards", dataIndex: "Count", align: "right" as const },
              { title: "Spares ₹", dataIndex: "Spares", align: "right" as const, render: (v: number) => inr(v, 2) }, { title: "Labour ₹", dataIndex: "Labour", align: "right" as const, render: (v: number) => inr(v, 2) },
              { title: "Total ₹", dataIndex: "Total", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> }, { title: "Warranty ₹", dataIndex: "Warranty", align: "right" as const, render: (v: number) => inr(v, 2) },
            ]} />
            <Table size="small" rowKey={(r: any) => `${r.JobCardNo}-${r.SpareCode}-${r.Qty}-${r.Amount}`} loading={loading} dataSource={data?.jobCardLines || []} scroll={{ x: 900 }} pagination={{ pageSize: 20 }} columns={[
              { title: "Job Card", dataIndex: "JobCardNo", render: (v: string) => <span className="font-mono">{v}</span> }, { title: "Date", dataIndex: "JobCardDate", render: (v: string) => formatDate(v) },
              { title: "Call", dataIndex: "ComplaintNo" }, { title: "Customer", dataIndex: "CustomerName" }, { title: "Spare", key: "s", render: (_: any, r: any) => `${r.SpareCode} — ${r.SpareName}` },
              { title: "Qty", dataIndex: "Qty", align: "right" as const }, { title: "Amount ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => inr(v, 2) },
              { title: "Warranty", dataIndex: "IsWarranty", render: (w: boolean) => w ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> }, { title: "Status", dataIndex: "Status" },
            ]} />
          </div> },
          { key: "repl", label: "Replacement (CN effect)", children: <Table size="small" rowKey={(r: any) => `${r.ReplNo}-${r.OldSerialNo}-${r.NewSerialNo}`} loading={loading} dataSource={data?.replacements || []} scroll={{ x: 1100 }} pagination={{ pageSize: 20 }} columns={[
            { title: "Replacement", dataIndex: "ReplNo", render: (v: string) => <span className="font-mono">{v}</span> }, { title: "Date", dataIndex: "ReplDate", render: (v: string) => formatDate(v) },
            { title: "Source", dataIndex: "Source" }, { title: "Dealer", dataIndex: "DealerName", render: (v: string) => v || "-" }, { title: "Category", dataIndex: "Category" },
            { title: "Old → New", key: "sw", render: (_: any, r: any) => <span className="font-mono text-xs">{r.OldSerialNo || "—"} → {r.NewSerialNo || "—"}</span> },
            { title: "Days left", dataIndex: "WarrantyDaysLeft", align: "right" as const, render: (v: number) => v ?? "—" },
            { title: "Net ₹", dataIndex: "NetValue", align: "right" as const, render: (v: number) => inr(v, 2) },
            { title: "CN", key: "cn", render: (_: any, r: any) => r.CnNo ? `${r.CnNo} · ₹ ${inr(r.CnAmount, 2)}` : "—" }, { title: "Status", dataIndex: "Status" },
          ]} /> },
          { key: "claims", label: "Warranty Claim Summary", children: <Table size="small" rowKey="SpareCode" loading={loading} dataSource={data?.claims || []} pagination={false} columns={[
            { title: "Spare", key: "s", render: (_: any, r: any) => <span><b>{r.SpareName}</b> <span className="text-xs text-slate-400">{r.SpareCode}</span></span> },
            { title: "Qty replaced", dataIndex: "Qty", align: "right" as const, render: (v: number, r: any) => `${v} ${r.Uom || ""}` },
            { title: "Job cards", dataIndex: "JobCards", align: "right" as const },
            { title: "Claim value ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
          ]} summary={(rows) => rows.length ? <Table.Summary.Row><Table.Summary.Cell index={0}><b>Total</b></Table.Summary.Cell><Table.Summary.Cell index={1} /><Table.Summary.Cell index={2} /><Table.Summary.Cell index={3} align="right"><b>{inr(sum(rows as any[], "Amount"), 2)}</b></Table.Summary.Cell></Table.Summary.Row> : null} /> },
        ]} />
      </div>
    </div>
  );
}
