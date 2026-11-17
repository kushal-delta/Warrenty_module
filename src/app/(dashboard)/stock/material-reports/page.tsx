"use client";

import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ItemNamesCell, itemNamesText } from "@/components/common/ItemNamesCell";
import { Button, Segmented, Select, Table, Tabs, Tag, Tooltip } from "antd";
import { AuditOutlined, CloseCircleOutlined, FileTextOutlined, ReloadOutlined, RollbackOutlined, ShoppingCartOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { PageHeader, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { DateRangeFilter, ExportExcelButton, type DateRange } from "@/components/common/ReportTools";
import { exportExcel as writeExcel, rangeLabel, type ExcelSheet } from "@/lib/utils/excelExport";

const qty = (n: unknown) => Number(Number(n || 0).toFixed(3));
const STATUS_COLOR: Record<string, string> = { Pending: "gold", Approved: "green", Rejected: "red" };
const PRIORITY_COLOR: Record<string, string> = { Low: "default", Normal: "blue", High: "orange", Urgent: "red" };

/** KPI tile in the Service Dashboard style. */
function Kpi({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub: string; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs px-4 py-3.5" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{label}</div>
      <div className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-none">{value}</div>
      <div className="text-xs text-slate-500 mt-2 truncate">{sub}</div>
    </div>
  );
}

/** Titled white card used for each block inside a tab. */
function Section({ title, hint, extra, children }: { title: string; hint?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div><h3 className="text-sm font-bold text-slate-800">{title}</h3>{hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}</div>
        {extra}
      </div>
      {children}
    </section>
  );
}

const tabLabel = (icon: React.ReactNode, text: string, count: number) => (
  <span className="inline-flex items-center gap-2">{icon}{text}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{count}</span></span>
);

/** Spares Stock → Material & Challan Reports: requests, challans (RDC / NRDC), fresh / defective returns and item-wise movement. */
export default function MaterialChallanReportsPage() {
  const [range, setRange] = useState<DateRange>(null); // document date (request / challan / return), sent to the API
  const [worker, setWorker] = useState<string>();
  const [dcType, setDcType] = useState("All");
  const [tab, setTab] = useState("requests");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData((await axios.post("/api/stock/material-reports", { fromDate: range?.[0]?.format("YYYY-MM-DD"), toDate: range?.[1]?.format("YYYY-MM-DD") })).data); }
    catch (err) { reportFormError(err, { fallback: "Could not build the reports" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const requests: any[] = data?.requests || [];
  const allChallanLines: any[] = data?.challanLines || [];
  const allReturns: any[] = data?.returns || [];
  const workers = useMemo(() => Array.from(new Map(allChallanLines.map((r) => [r.JobWorkerId, r.JobWorkerName])).entries()).filter(([k]) => k).map(([value, label]) => ({ value, label: label || "—" })), [allChallanLines]);
  const challanLines = allChallanLines.filter((l) => (!worker || l.JobWorkerId === worker) && (dcType === "All" || l.ChallanType === dcType))
    .map((l) => ({ ...l, PendingReturn: l.ChallanType === "Returnable" ? Math.max(0, qty(Number(l.Qty) - Number(l.Fresh) - Number(l.Defective))) : null }));
  const returns = allReturns.filter((r) => !worker || allChallanLines.some((l) => l.ChallanNo === r.ChallanNo && l.JobWorkerId === worker));
  const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);

  // Item-wise movement across the filtered challan lines.
  const itemWise = useMemo(() => {
    const map = new Map<string, any>();
    challanLines.forEach((l) => {
      const k = `${l.ItemCode || ""}|${l.ItemName}`;
      const row = map.get(k) || { key: k, ItemCode: l.ItemCode, ItemName: l.ItemName, Uom: l.Uom, Challans: new Set<string>(), Qty: 0, Amount: 0, Received: 0, Fresh: 0, Defective: 0, PendingReturn: 0 };
      row.Challans.add(l.ChallanNo); row.Qty += Number(l.Qty); row.Amount += Number(l.Amount); row.Received += Number(l.Received); row.Fresh += Number(l.Fresh); row.Defective += Number(l.Defective); row.PendingReturn += Number(l.PendingReturn || 0);
      map.set(k, row);
    });
    return Array.from(map.values()).map((r) => ({ ...r, ChallanCount: r.Challans.size })).sort((a, b) => b.Amount - a.Amount);
  }, [challanLines]); // eslint-disable-line react-hooks/exhaustive-deps

  const challanCount = new Set(challanLines.map((l) => l.ChallanNo)).size;
  const rdcOpen = new Set(challanLines.filter((l) => Number(l.PendingReturn) > 0).map((l) => l.ChallanNo)).size;
  const activeFilters = [range?.[0] || range?.[1], worker, dcType !== "All" ? dcType : null].filter(Boolean).length;
  const periodText = range?.[0] && range?.[1] ? `${range[0].format("DD MMM YYYY")} – ${range[1].format("DD MMM YYYY")}` : "All dates";

  const exportExcel = () => {
    const sheets: ExcelSheet<any>[] = [];
    if (tab === "requests") {
      sheets.push({ name: "Material requests", title: "Material Requests", rows: requests, columns: [
        { header: "Request No.", value: (r) => r.RequestNo },
        { header: "Date", value: (r) => r.RequestDate, type: "date" },
        { header: "Type", value: (r) => (r.RequestType === "Product" ? "Product items" : "Spare parts") },
        { header: "Warehouse", value: (r) => r.RequestForName },
        { header: "Priority", value: (r) => r.Priority },
        { header: "Required By", value: (r) => r.RequiredBy, type: "date" },
        { header: "Item name", value: (r: any) => itemNamesText(r.ItemNames) },
        { header: "Items", value: (r) => Number(r.ItemCount), type: "number", total: true },
        { header: "Total Qty", value: (r) => qty(r.TotalQty), type: "number", total: true },
        { header: "Status", value: (r) => r.Status },
        { header: "Decision By", value: (r) => r.DecisionBy?.trim() },
        { header: "Decision On", value: (r) => r.DecisionOn, type: "date" },
        { header: "Decision Remarks", value: (r) => r.DecisionRemarks },
        { header: "Challan", value: (r) => r.ChallanNo },
        { header: "Requested By", value: (r) => r.RequestedBy?.trim() },
      ] });
      sheets.push({ name: "Request lines", title: "Material Request Lines", rows: data?.requestLines || [], columns: [
        { header: "Request No.", value: (r) => r.RequestNo },
        { header: "Date", value: (r) => r.RequestDate, type: "date" },
        { header: "Status", value: (r) => r.Status },
        { header: "Warehouse", value: (r) => r.RequestForName },
        { header: "Item Code", value: (r) => r.ItemCode },
        { header: "Item", value: (r) => r.ItemName },
        { header: "Qty", value: (r) => qty(r.Qty), type: "number", total: true },
        { header: "Unit", value: (r) => r.Uom },
      ] });
    } else if (tab === "challans") {
      sheets.push({ name: "Challan lines", title: "Delivery Challan Lines", rows: challanLines, columns: [
        { header: "Challan No.", value: (l) => l.ChallanNo },
        { header: "Date", value: (l) => l.ChallanDate, type: "date" },
        { header: "Type", value: (l) => l.ChallanType },
        { header: "Job Worker", value: (l) => l.JobWorkerName },
        { header: "Purpose", value: (l) => l.Purpose },
        { header: "From Store", value: (l) => l.DispatchLocName },
        { header: "Material Request", value: (l) => l.RequestNo },
        { header: "Item Code", value: (l) => l.ItemCode },
        { header: "Item", value: (l) => l.ItemName },
        { header: "Qty", value: (l) => qty(l.Qty), type: "number", total: true },
        { header: "Unit", value: (l) => l.Uom },
        { header: "Rate", value: (l) => Number(l.Rate), type: "money" },
        { header: "Value", value: (l) => Number(l.Amount), type: "money", total: true },
        { header: "Received (GRN)", value: (l) => qty(l.Received), type: "number", total: true },
        { header: "Fresh", value: (l) => qty(l.Fresh), type: "number", total: true },
        { header: "Defective", value: (l) => qty(l.Defective), type: "number", total: true },
        { header: "Pending Return", value: (l) => l.PendingReturn, type: "number", total: true },
        { header: "Expected Back", value: (l) => l.ExpectedBackBy, type: "date" },
      ] });
    } else if (tab === "returns") {
      sheets.push({ name: "Fresh - defective returns", title: "Fresh / Defective Returns", rows: returns, columns: [
        { header: "Receipt No.", value: (r) => r.ReturnNo },
        { header: "Date", value: (r) => r.ReturnDate, type: "date" },
        { header: "Against RDC", value: (r) => r.ChallanNo },
        { header: "Job Worker", value: (r) => r.JobWorkerName },
        { header: "Item Code", value: (r) => r.ItemCode },
        { header: "Item", value: (r) => r.ItemName },
        { header: "Issued", value: (r) => qty(r.Issued), type: "number", total: true },
        { header: "Fresh", value: (r) => qty(r.QtyFresh), type: "number", total: true },
        { header: "Defective", value: (r) => qty(r.QtyDefective), type: "number", total: true },
        { header: "Defective Value", value: (r) => Number(r.QtyDefective) * Number(r.Rate || 0), type: "money", total: true },
        { header: "Defect Serial", value: (r) => r.DefectSerial },
        { header: "Through", value: (r) => r.ReceivedThrough },
        { header: "Remarks", value: (r) => r.Remarks },
      ] });
    } else {
      sheets.push({ name: "Item-wise movement", title: "Item-wise Material Movement", rows: itemWise, columns: [
        { header: "Item Code", value: (r) => r.ItemCode },
        { header: "Item", value: (r) => r.ItemName },
        { header: "Unit", value: (r) => r.Uom },
        { header: "Challans", value: (r) => r.ChallanCount, type: "number" },
        { header: "Qty Sent", value: (r) => qty(r.Qty), type: "number", total: true },
        { header: "Value Sent", value: (r) => r.Amount, type: "money", total: true },
        { header: "Received (GRN)", value: (r) => qty(r.Received), type: "number", total: true },
        { header: "Fresh", value: (r) => qty(r.Fresh), type: "number", total: true },
        { header: "Defective", value: (r) => qty(r.Defective), type: "number", total: true },
        { header: "Pending Return", value: (r) => qty(r.PendingReturn), type: "number", total: true },
      ] });
    }
    return writeExcel({
      title: "Material & Challan Report",
      filters: {
        Period: rangeLabel(range),
        "Job worker": tab !== "requests" && worker ? workers.find((w) => w.value === worker)?.label : null,
        Challans: (tab === "challans" || tab === "items") && dcType !== "All" ? (dcType === "Returnable" ? "RDC" : "NRDC") : null,
      },
      sheets,
    });
  };

  const itemCell = (_: any, r: any) => <div><div className="font-medium text-slate-800">{r.ItemName}</div>{r.ItemCode && <div className="text-[11px] font-mono text-slate-400">{r.ItemCode}</div>}</div>;

  return (
    <div className="space-y-4">
      <PageHeader icon={<FileTextOutlined />} title="Material & Challan Reports" subtitle={`Material requests, returnable / non-returnable challans and fresh / defective returns · ${periodText}`}
        actions={<>
          <ExportExcelButton onExport={exportExcel} disabled={!data} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        </>} />

      <div className="filter-toolbar">
        <DateRangeFilter value={range} onChange={setRange} placeholder={["Document date from", "to"]} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Job worker: All" value={worker} onChange={setWorker} options={workers} />
        <Segmented value={dcType} onChange={(v) => setDcType(String(v))} options={[{ value: "All", label: "All challans" }, { value: "Returnable", label: "RDC" }, { value: "Non-returnable", label: "NRDC" }]} />
        {activeFilters > 0 && <Button type="link" icon={<CloseCircleOutlined />} onClick={() => { setRange(null); setWorker(undefined); setDcType("All"); }} className="!px-1">Clear filters ({activeFilters})</Button>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Material requests" value={requests.length} sub={`${requests.filter((r) => r.Status === "Pending").length} waiting for approval`} accent="#2563eb" />
        <Kpi label="Approved" value={requests.filter((r) => r.Status === "Approved").length} sub={`${requests.filter((r) => r.Status === "Approved" && !r.ChallanNo).length} not yet on a challan`} accent="#16a34a" />
        <Kpi label="Challans" value={challanCount} sub={`₹ ${inr(sum(challanLines, "Amount"))} sent`} accent="#0d9488" />
        <Kpi label="RDC pending return" value={rdcOpen} sub={`${qty(sum(challanLines, "PendingReturn"))} qty still out`} accent="#f59e0b" />
        <Kpi label="Fresh returned" value={qty(sum(returns, "QtyFresh"))} sub="back as unused stock" accent="#22c55e" />
        <Kpi label="Defective returned" value={qty(sum(returns, "QtyDefective"))} sub={`₹ ${inr(returns.reduce((s, r) => s + Number(r.QtyDefective) * Number(r.Rate || 0), 0))} value`} accent="#ef4444" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-xs px-4 pb-4">
        <Tabs activeKey={tab} onChange={setTab} items={[
          { key: "requests", label: tabLabel(<ShoppingCartOutlined />, "Material Requests", requests.length), children: (
            <Section title="Material requests" hint="Requests raised in the period with HO decision and the challan raised against them">
              <Table size="middle" rowKey="MaterialRequestId" loading={loading} dataSource={requests} scroll={{ x: 1300 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} locale={{ emptyText: "No material requests in this period" }} columns={[
                { title: "Request no.", dataIndex: "RequestNo", render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
                { title: "Date", dataIndex: "RequestDate", render: (v: string) => formatDate(v) },
                { title: "Type", dataIndex: "RequestType", render: (v: string) => (v === "Product" ? "Product items" : "Spare parts") },
                { title: "Warehouse", dataIndex: "RequestForName", render: (v: string) => v || "—" },
                { title: "Priority", dataIndex: "Priority", render: (v: string) => <Tag color={PRIORITY_COLOR[v]}>{v}</Tag> },
                { title: "Item name", key: "itemNames", width: 260, render: (_: any, r: any) => <ItemNamesCell names={r.ItemNames} /> },
                { title: "Items", dataIndex: "ItemCount", align: "right" as const }, { title: "Qty", dataIndex: "TotalQty", align: "right" as const, render: (v: number) => qty(v) },
                { title: "Status", dataIndex: "Status", render: (v: string, r: any) => <div><Tag color={STATUS_COLOR[v] || "default"}>{v}</Tag>{r.DecisionBy?.trim() && <div className="text-[11px] text-slate-400">by {r.DecisionBy.trim()}</div>}</div> },
                { title: "Challan", dataIndex: "ChallanNo", render: (v: string) => v ? <span className="font-mono text-teal-700">{v}</span> : <span className="text-slate-300">—</span> },
                { title: "Requested by", dataIndex: "RequestedBy", render: (v: string) => v?.trim() || "—" },
              ]} />
            </Section>
          ) },
          { key: "challans", label: tabLabel(<AuditOutlined />, "Delivery Challans", challanCount), children: (
            <Section title="Challan lines" hint="Quantity and value sent, received at the job worker (GRN), and fresh / defective returned on returnable challans">
              <Table size="middle" rowKey="DeliveryChallanItemLnId" loading={loading} dataSource={challanLines} scroll={{ x: 1600 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} locale={{ emptyText: "No challans in this period" }} columns={[
                { title: "Challan", key: "dc", render: (_: any, r: any) => <div><span className="font-mono font-bold text-blue-700">{r.ChallanNo}</span><div className="text-[11px] text-slate-400">{formatDate(r.ChallanDate)}</div></div> },
                { title: "Type", dataIndex: "ChallanType", render: (v: string) => <Tag color={v === "Returnable" ? "blue" : "purple"}>{v === "Returnable" ? "RDC" : "NRDC"}</Tag> },
                { title: "Job worker", dataIndex: "JobWorkerName", render: (v: string, r: any) => <div><div>{v || "—"}</div><div className="text-[11px] text-slate-400">{r.Purpose}</div></div> },
                { title: "Item", key: "item", render: itemCell },
                { title: "Qty", dataIndex: "Qty", align: "right" as const, render: (v: number, r: any) => `${qty(v)}${r.Uom ? ` ${r.Uom}` : ""}` },
                { title: "Value ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => inr(v, 2) },
                { title: "Received", dataIndex: "Received", align: "right" as const, render: (v: number) => qty(v) },
                { title: "Fresh", dataIndex: "Fresh", align: "right" as const, render: (v: number) => <span className="text-emerald-600">{qty(v)}</span> },
                { title: "Defective", dataIndex: "Defective", align: "right" as const, render: (v: number) => <span className={Number(v) ? "text-red-600" : "text-slate-400"}>{qty(v)}</span> },
                { title: "Pending return", dataIndex: "PendingReturn", align: "right" as const, render: (v: number | null) => (v == null ? <span className="text-slate-300">—</span> : v > 0 ? <b className="text-amber-600">{qty(v)}</b> : <span className="text-emerald-600">0</span>) },
                { title: "Expected back", dataIndex: "ExpectedBackBy", render: (v: string) => (v ? formatDate(v) : "—") },
              ]} summary={(rows) => rows.length ? (
                <Table.Summary.Row className="bg-slate-50">
                  <Table.Summary.Cell index={0} colSpan={4}><b>Total (this page)</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><b>{qty(sum(rows as any[], "Qty"))}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right"><b>{inr(sum(rows as any[], "Amount"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right"><b>{qty(sum(rows as any[], "Received"))}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right"><b className="text-emerald-600">{qty(sum(rows as any[], "Fresh"))}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right"><b className="text-red-600">{qty(sum(rows as any[], "Defective"))}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="right"><b className="text-amber-600">{qty(sum(rows as any[], "PendingReturn"))}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={10} />
                </Table.Summary.Row>
              ) : null} />
            </Section>
          ) },
          { key: "returns", label: tabLabel(<RollbackOutlined />, "Fresh / Defective Returns", returns.length), children: (
            <Section title="Fresh / defective returns" hint="Material received back against returnable challans">
              <Table size="middle" rowKey={(r: any) => `${r.ReturnNo}-${r.ItemCode}-${r.ItemName}`} loading={loading} dataSource={returns} scroll={{ x: 1250 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} locale={{ emptyText: "No returns in this period" }} columns={[
                { title: "Receipt no.", dataIndex: "ReturnNo", render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
                { title: "Date", dataIndex: "ReturnDate", render: (v: string) => formatDate(v) },
                { title: "Against RDC", dataIndex: "ChallanNo", render: (v: string) => <span className="font-mono text-teal-700">{v}</span> },
                { title: "Job worker", dataIndex: "JobWorkerName", render: (v: string) => v || "—" },
                { title: "Item", key: "item", render: itemCell },
                { title: "Fresh", dataIndex: "QtyFresh", align: "right" as const, render: (v: number) => <b className="text-emerald-600">{qty(v)}</b> },
                { title: "Defective", dataIndex: "QtyDefective", align: "right" as const, render: (v: number) => <b className={Number(v) ? "text-red-600" : "text-slate-400"}>{qty(v)}</b> },
                { title: "Defect serial", dataIndex: "DefectSerial", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : "—" },
                { title: "Through", dataIndex: "ReceivedThrough", render: (v: string) => v || "—" },
                { title: "Remarks", dataIndex: "Remarks", render: (v: string) => v || <span className="text-slate-300">—</span> },
              ]} />
            </Section>
          ) },
          { key: "items", label: tabLabel(<UnorderedListOutlined />, "Item-wise Summary", itemWise.length), children: (
            <Section title="Item-wise movement" hint="All challan lines in the period, per item — highest value first">
              <Table size="middle" rowKey="key" loading={loading} dataSource={itemWise} scroll={{ x: 1100 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} locale={{ emptyText: "No challans in this period" }} columns={[
                { title: "Item", key: "item", render: itemCell },
                { title: "Challans", dataIndex: "ChallanCount", align: "right" as const },
                { title: "Qty sent", dataIndex: "Qty", align: "right" as const, render: (v: number, r: any) => `${qty(v)}${r.Uom ? ` ${r.Uom}` : ""}` },
                { title: "Value sent ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
                { title: "Received", dataIndex: "Received", align: "right" as const, render: (v: number) => qty(v) },
                { title: "Fresh", dataIndex: "Fresh", align: "right" as const, render: (v: number) => <span className="text-emerald-600">{qty(v)}</span> },
                { title: "Defective", dataIndex: "Defective", align: "right" as const, render: (v: number) => <span className={v ? "text-red-600" : "text-slate-400"}>{qty(v)}</span> },
                { title: <Tooltip title="Returnable challans only">Pending return</Tooltip>, dataIndex: "PendingReturn", align: "right" as const, render: (v: number) => v > 0 ? <b className="text-amber-600">{qty(v)}</b> : <span className="text-slate-400">0</span> },
              ]} />
            </Section>
          ) },
        ]} />
      </div>
    </div>
  );
}
