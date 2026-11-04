"use client";

import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Button, DatePicker, Select, Table, Tabs, Tag } from "antd";
import { BarChartOutlined, DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useServiceOpsStore } from "@/lib/store/useServiceOpsStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

const STATUSES = ["New", "Assigned", "Visited", "In Approval", "Approved", "Resolved", "Closed", "Cancelled"];
type MatrixDim = "type" | "engineer" | "center";
const MATRIX_TITLE: Record<MatrixDim, string> = { type: "Call type (valid days)", engineer: "Engineer", center: "Service center" };

/** Pivot the status matrix rows for one dimension: a row per name, a column per status, plus overdue and average days to resolve. */
function pivot(rows: any[], dim: MatrixDim) {
  const byName = new Map<string, any>();
  rows.filter((r) => r.Dim === dim).forEach((r) => {
    const row = byName.get(r.Name) || { Name: r.Name, total: 0, overdue: 0, daysSum: 0, daysCount: 0 };
    const n = Number(r.Count || 0);
    row[r.Status] = n; row.total += n; row.overdue += Number(r.Overdue || 0);
    if (r.AvgDays != null) { row.daysSum += Number(r.AvgDays) * n; row.daysCount += n; }
    byName.set(r.Name, row);
  });
  return Array.from(byName.values()).map((r) => ({ ...r, avgDays: r.daysCount ? Math.round((r.daysSum / r.daysCount) * 10) / 10 : null })).sort((a, b) => b.total - a.total);
}

/** Service MIS: call summary (status matrix), job card detail, replacement (CN effect) and warranty claim summary. */
export default function ServiceReportsPage() {
  const { fetchReports } = useServiceOpsStore();
  const { states, serviceCenters } = useMasterStore();
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [stateId, setStateId] = useState<string>();
  const [centreId, setCentreId] = useState<string>();
  const [tab, setTab] = useState("calls");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await fetchReports({ fromDate: range?.[0]?.startOf("day").toISOString(), toDate: range?.[1]?.endOf("day").toISOString(), stateId, serviceCenterId: centreId }));
    } catch (err) {
      reportFormError(err, { fallback: "Could not build reports" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [range, stateId, centreId]); // eslint-disable-line react-hooks/exhaustive-deps

  const byStatus: Record<string, number> = Object.fromEntries((data?.calls.byStatus || []).map((r: any) => [r.Status, r.Calls]));
  const totalCalls = Object.values(byStatus).reduce((s, n) => s + Number(n), 0);
  const openCalls = Object.entries(byStatus).filter(([s]) => !["Closed", "Resolved", "Cancelled"].includes(s)).reduce((sum, [, n]) => sum + Number(n), 0);
  const ageing = data?.calls.ageing || {};
  const jc = (data?.jobCards || []) as any[];
  const lines = (data?.jobCardLines || []) as any[];
  const repl = (data?.replacements || []) as any[];
  const claimJcs = (data?.claimJobCards || []) as any[];
  const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const matrix = (data?.calls.statusMatrix || []) as any[];
  const overdueTotal = matrix.filter((r) => r.Dim === "type").reduce((s, r) => s + Number(r.Overdue || 0), 0);
  // A credit note reduces the invoiced value: show the effect of each replaced line as a negative amount.
  const effect = (r: any) => (r.CnNo ? -Number(r.NetValue || 0) : 0);
  const cnTotal = Array.from(new Map(repl.map((r) => [r.ReplNo, Number(r.CnAmount || 0)])).values()).reduce((s, n) => s + n, 0);

  const matrixColumns = (dim: MatrixDim) => [
    { title: MATRIX_TITLE[dim], dataIndex: "Name", key: "n", fixed: "left" as const, width: 200, render: (v: string) => <b>{v.trim()}</b> },
    ...STATUSES.map((s) => ({ title: s, dataIndex: s, key: s, align: "right" as const, width: 90, render: (v: number) => v || <span className="text-slate-300">–</span> })),
    { title: "Total", dataIndex: "total", key: "t", align: "right" as const, width: 80, render: (v: number) => <b>{v}</b> },
    { title: "Overdue", dataIndex: "overdue", key: "o", align: "right" as const, width: 90, render: (v: number) => v ? <b className="text-red-600">{v}</b> : <span className="text-slate-300">–</span> },
    { title: "Avg days to resolve", dataIndex: "avgDays", key: "a", align: "right" as const, width: 140, render: (v: number | null) => v ?? "—" },
  ];
  const people = (title: string) => [
    { title, dataIndex: "Name", key: "n" }, { title: "Total", dataIndex: "Total", key: "t", align: "right" as const },
    { title: "Open", dataIndex: "Open", key: "o", align: "right" as const }, { title: "Closed / Resolved", dataIndex: "Closed", key: "c", align: "right" as const },
  ];

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: any[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "No data" }]), name);
    if (tab === "calls") {
      (["type", "engineer", "center"] as MatrixDim[]).forEach((dim) => add(`By ${dim}`, pivot(matrix, dim).map((r) => ({ [MATRIX_TITLE[dim]]: r.Name.trim(), ...Object.fromEntries(STATUSES.map((s) => [s, r[s] || 0])), Total: r.total, Overdue: r.overdue, "Avg days to resolve": r.avgDays ?? "" }))));
    } else if (tab === "jc") {
      add("Job card lines", lines.map((r) => ({ "Job Card": r.JobCardNo, Date: formatDate(r.JobCardDate), Call: r.ComplaintNo, Customer: r.CustomerName, Type: r.ItemType, Code: r.SpareCode, Item: r.SpareName, "Component serial": r.SerialNo || "", Engineer: r.EngineerName?.trim() || "", "Service center": r.ServiceCenterName || "", Qty: Number(r.Qty), Rate: Number(r.Rate), Amount: Number(r.Amount), GST: Number(r.GstAmount), Basis: r.IsWarranty ? "Warranty" : "Chargeable", Status: r.Status })));
    } else if (tab === "repl") {
      add("Replacements", repl.map((r) => ({ Replacement: r.ReplNo, Date: formatDate(r.ReplDate), Source: r.Source, Type: r.ReplacementType, Warranty: r.VoucherType === "Without Serial No" ? "Out of warranty" : "In warranty", Dealer: r.DealerName || "", Category: r.Category, "Invoiced item": r.InvoiceItem || "", "Received item": r.ReceivedItem || "", Qty: Number(r.Qty || 0), "Old serial": r.OldSerialNo || "", "New serial": r.NewSerialNo || "", "Warranty days left": r.WarrantyDaysLeft ?? "", "Net value": Number(r.NetValue || 0), "CN no": r.CnNo || "", "CN effect": effect(r), Status: r.Status })));
    } else {
      add("Claim - job cards", claimJcs.map((r) => ({ "Job Card": r.JobCardNo, Date: formatDate(r.JobCardDate), Customer: r.CustomerName, "Service center": r.ServiceCenterName || "", Serials: r.Serials || "", Spares: Number(r.SparesTotal), Labour: Number(r.LabourTotal), "Warranty claim": Number(r.WarrantyAmount), "Customer pays": Math.max(0, Number(r.TotalEstimate) - Number(r.WarrantyAmount)), Status: r.Status })));
      add("Claim - spare wise", (data?.claims || []).map((r: any) => ({ Spare: r.SpareName, Code: r.SpareCode, Qty: Number(r.Qty), "Job cards": Number(r.JobCards), "Claim value": Number(r.Amount) })));
      add("Claim - month wise", (data?.claimByMonth || []).map((r: any) => ({ Month: dayjs(r.Month).format("MMM YYYY"), "Job cards": Number(r.JobCards), "Claim value": Number(r.Amount) })));
      add("Claim - component", (data?.claimByComponent || []).map((r: any) => ({ Component: r.Component, "Claim value": Number(r.Amount) })));
    }
    XLSX.writeFile(wb, `Service_report_${tab}_${dayjs().format("YYYYMMDD")}.xlsx`);
  };

  const spareSummary = (rows: readonly any[]) => rows.length ? <Table.Summary.Row><Table.Summary.Cell index={0}><b>Total</b></Table.Summary.Cell><Table.Summary.Cell index={1} /><Table.Summary.Cell index={2} /><Table.Summary.Cell index={3} align="right"><b>{inr(sum(rows as any[], "Amount"), 2)}</b></Table.Summary.Cell></Table.Summary.Row> : null;

  return (
    <div className="space-y-4">
      <PageHeader icon={<BarChartOutlined />} title="Service Reports" subtitle="Call summary, job card detail, replacement credit-note effect and warranty claim summary"
        actions={<>
          <DatePicker.RangePicker value={range as any} onChange={(v) => setRange(v as any)} format="DD/MM/YYYY" allowClear />
          <Select allowClear showSearch optionFilterProp="label" placeholder="State: All" value={stateId} onChange={setStateId} className="min-w-36" options={states.map((s: any) => ({ value: s.StateId, label: s.StateName }))} />
          <Select allowClear showSearch optionFilterProp="label" placeholder="Service center: All" value={centreId} onChange={setCentreId} className="min-w-44" options={serviceCenters.map((s: any) => ({ value: s.ServiceCenterId, label: s.ServiceCenterName }))} />
          <Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={!data}>Export Excel</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        </>} />

      <StatStrip items={[
        { label: "Calls", value: totalCalls },
        { label: "Open calls", value: openCalls, tone: "warn" },
        { label: "Overdue", value: overdueTotal, tone: "danger" },
        { label: "Open > 7 days", value: Number(ageing.d8_15 || 0) + Number(ageing.d15plus || 0), tone: "danger" },
        { label: "Job card value ₹", value: inr(sum(jc, "Total")) },
        { label: "Warranty borne ₹", value: inr(sum(jc, "Warranty")), tone: "ok" },
        { label: "Credit notes ₹", value: inr(cnTotal) },
      ]} />

      <div className={`${TABLE_CARD} px-4 pb-4`}>
        <Tabs activeKey={tab} onChange={setTab} items={[
          { key: "calls", label: "Call Summary", children: <div className="space-y-5">
            <div className="flex flex-wrap gap-2">{Object.entries(byStatus).map(([s, n]) => <Tag key={s} className="text-sm px-3 py-1">{s}: <b>{n as number}</b></Tag>)}</div>
            {(["type", "engineer", "center"] as MatrixDim[]).map((dim) => (
              <div key={dim}>
                <h3 className="text-sm font-bold text-slate-800 mb-2">Status matrix · by {dim === "type" ? "call type" : dim === "engineer" ? "engineer" : "service center"}</h3>
                <Table size="small" rowKey="Name" loading={loading} dataSource={pivot(matrix, dim)} columns={matrixColumns(dim)} pagination={false} scroll={{ x: 1250 }} locale={{ emptyText: "No calls in this period" }} />
              </div>
            ))}
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
            <Table size="small" rowKey={(r: any) => `${r.JobCardNo}-${r.SpareCode}-${r.SerialNo}-${r.Qty}-${r.Amount}`} loading={loading} dataSource={lines} scroll={{ x: 1500 }} pagination={{ pageSize: 20 }} columns={[
              { title: "Job Card", dataIndex: "JobCardNo", render: (v: string) => <span className="font-mono">{v}</span> }, { title: "Date", dataIndex: "JobCardDate", render: (v: string) => formatDate(v) },
              { title: "Call", dataIndex: "ComplaintNo" }, { title: "Customer", dataIndex: "CustomerName" },
              { title: "Type", dataIndex: "ItemType", render: (v: string) => <Tag color={v === "Labour" ? "blue" : "default"}>{v || "Spare"}</Tag> },
              { title: "Code", dataIndex: "SpareCode", render: (v: string) => <span className="font-mono text-xs">{v}</span> }, { title: "Item", dataIndex: "SpareName" },
              { title: "Component serial", dataIndex: "SerialNo", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : "—" },
              { title: "Engineer", dataIndex: "EngineerName", render: (v: string) => v?.trim() || "—" }, { title: "Service center", dataIndex: "ServiceCenterName", render: (v: string) => v || "—" },
              { title: "Qty", dataIndex: "Qty", align: "right" as const }, { title: "Amount ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => inr(v, 2) },
              { title: "Basis", dataIndex: "IsWarranty", render: (w: boolean) => w ? <Tag color="green">Warranty</Tag> : <Tag color="orange">Chargeable</Tag> }, { title: "Status", dataIndex: "Status" },
            ]} summary={(rows) => rows.length ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={9}><b>Total (this page)</b></Table.Summary.Cell>
                <Table.Summary.Cell index={9} align="right"><b>{sum(rows as any[], "Qty")}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={10} align="right"><b>{inr(sum(rows as any[], "Amount"), 2)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={11} colSpan={2} />
              </Table.Summary.Row>
            ) : null} />
          </div> },
          { key: "repl", label: "Replacement (CN effect)", children: <Table size="small" rowKey={(r: any) => `${r.ReplNo}-${r.OldSerialNo}-${r.NewSerialNo}-${r.InvoiceItem}`} loading={loading} dataSource={repl} scroll={{ x: 1800 }} pagination={{ pageSize: 20 }} columns={[
            { title: "Replacement", dataIndex: "ReplNo", render: (v: string) => <span className="font-mono">{v}</span> }, { title: "Date", dataIndex: "ReplDate", render: (v: string) => formatDate(v) },
            { title: "Source", dataIndex: "Source" }, { title: "Type", dataIndex: "ReplacementType", render: (v: string) => v || "—" },
            { title: "Warranty", dataIndex: "VoucherType", render: (v: string) => v === "Without Serial No" ? <Tag color="red">Out of warranty</Tag> : <Tag color="green">In warranty</Tag> }, { title: "Dealer", dataIndex: "DealerName", render: (v: string) => v || "-" }, { title: "Category", dataIndex: "Category" },
            { title: "Invoiced item", dataIndex: "InvoiceItem", render: (v: string) => v || "—" }, { title: "Received item", dataIndex: "ReceivedItem", render: (v: string) => v || "—" },
            { title: "Qty", dataIndex: "Qty", align: "right" as const, render: (v: number) => v ?? "—" },
            { title: "Old → New", key: "sw", render: (_: any, r: any) => <span className="font-mono text-xs">{r.OldSerialNo || "—"} → {r.NewSerialNo || "—"}</span> },
            { title: "Days left", dataIndex: "WarrantyDaysLeft", align: "right" as const, render: (v: number) => v ?? "—" },
            { title: "Net ₹", dataIndex: "NetValue", align: "right" as const, render: (v: number) => inr(v, 2) },
            { title: "CN", key: "cn", render: (_: any, r: any) => r.CnNo ? `${r.CnNo} · ₹ ${inr(r.CnAmount, 2)}` : "—" },
            { title: "CN effect ₹", key: "ef", align: "right" as const, render: (_: any, r: any) => { const e = effect(r); return e ? <b className="text-red-600">-{inr(Math.abs(e), 2)}</b> : <span className="text-slate-300">–</span>; } },
            { title: "Status", dataIndex: "Status" },
          ]} /> },
          { key: "claims", label: "Warranty Claim Summary", children: <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Job card-wise claim</h3>
              <Table size="small" rowKey="JobCardId" loading={loading} dataSource={claimJcs} scroll={{ x: 1100 }} pagination={{ pageSize: 10 }} locale={{ emptyText: "No approved warranty job cards in this period" }} columns={[
                { title: "Job Card", dataIndex: "JobCardNo", render: (v: string) => <span className="font-mono">{v}</span> }, { title: "Date", dataIndex: "JobCardDate", render: (v: string) => formatDate(v) },
                { title: "Customer", dataIndex: "CustomerName" }, { title: "Service center", dataIndex: "ServiceCenterName", render: (v: string) => v || "—" },
                { title: "Serials", dataIndex: "Serials", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : "—" },
                { title: "Spares ₹", dataIndex: "SparesTotal", align: "right" as const, render: (v: number) => inr(v, 2) }, { title: "Labour ₹", dataIndex: "LabourTotal", align: "right" as const, render: (v: number) => inr(v, 2) },
                { title: "Claim ₹", dataIndex: "WarrantyAmount", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
                { title: "Customer pays ₹", key: "cp", align: "right" as const, render: (_: any, r: any) => inr(Math.max(0, Number(r.TotalEstimate) - Number(r.WarrantyAmount)), 2) },
                { title: "Status", dataIndex: "Status", render: (s: string) => <Tag color={s === "Closed" ? "green" : "blue"}>{s}</Tag> },
              ]} summary={(rows) => rows.length ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={5}><b>Total</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right"><b>{inr(sum(rows as any[], "SparesTotal"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right"><b>{inr(sum(rows as any[], "LabourTotal"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right"><b>{inr(sum(rows as any[], "WarrantyAmount"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={8} colSpan={2} />
                </Table.Summary.Row>
              ) : null} />
            </div>
            <div className="grid lg:grid-cols-2 gap-5">
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-2">Month-wise warranty cost</h3>
                <Table size="small" rowKey="Month" loading={loading} dataSource={data?.claimByMonth || []} pagination={false} locale={{ emptyText: "No claims yet" }} columns={[
                  { title: "Month", dataIndex: "Month", render: (v: string) => dayjs(v).format("MMM YYYY") }, { title: "Job cards", dataIndex: "JobCards", align: "right" as const },
                  { title: "Claim ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
                ]} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-2">Component-wise warranty cost</h3>
                <Table size="small" rowKey="Component" loading={loading} dataSource={data?.claimByComponent || []} pagination={false} locale={{ emptyText: "No claims yet" }} columns={[
                  { title: "Component", dataIndex: "Component" }, { title: "Claim ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
                ]} />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Spare-wise claim</h3>
              <Table size="small" rowKey="SpareCode" loading={loading} dataSource={data?.claims || []} pagination={false} columns={[
                { title: "Spare", key: "s", render: (_: any, r: any) => <span><b>{r.SpareName}</b> <span className="text-xs text-slate-400">{r.SpareCode}</span></span> },
                { title: "Qty replaced", dataIndex: "Qty", align: "right" as const, render: (v: number, r: any) => `${v} ${r.Uom || ""}` },
                { title: "Job cards", dataIndex: "JobCards", align: "right" as const },
                { title: "Claim value ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
              ]} summary={spareSummary} />
            </div>
          </div> },
        ]} />
      </div>
    </div>
  );
}
