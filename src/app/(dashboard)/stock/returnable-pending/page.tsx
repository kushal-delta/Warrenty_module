"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Button, Input, Segmented, Select, Table, Tag, Tooltip } from "antd";
import { ReloadOutlined, RollbackOutlined, SearchOutlined } from "@ant-design/icons";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { DateRangeFilter, ExportExcelButton, inDateRange, type DateRange } from "@/components/common/ReportTools";
import { exportExcel as writeExcel, rangeLabel } from "@/lib/utils/excelExport";

type Due = "All" | "Overdue" | "Due in 7 days" | "Not due";
const DUE_VIEWS: Due[] = ["All", "Overdue", "Due in 7 days", "Not due"];

/** Where a challan stands against its expected-back date. */
const dueState = (r: any): Exclude<Due, "All"> => {
  const late = r.DaysOverdue === null || r.DaysOverdue === undefined ? null : Number(r.DaysOverdue);
  if (late !== null && late > 0) return "Overdue";
  if (late !== null && late >= -7) return "Due in 7 days";
  return "Not due";
};
const DUE_COLOR: Record<string, string> = { Overdue: "red", "Due in 7 days": "orange", "Not due": "green" };
const dueText = (r: any) => {
  const late = Number(r.DaysOverdue);
  if (r.DaysOverdue === null || r.DaysOverdue === undefined) return "—";
  if (late > 0) return `${late} day${late === 1 ? "" : "s"} overdue`;
  if (late === 0) return "Due today";
  return `Due in ${-late} day${late === -1 ? "" : "s"}`;
};

/** Spares Stock → Pending Returnable: returnable delivery challans whose material has not come back yet, with Excel export. */
export default function PendingReturnablePage() {
  const [challans, setChallans] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [due, setDue] = useState<Due>("All");
  const [center, setCenter] = useState<string>();
  const [range, setRange] = useState<DateRange>(null); // challan date

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.post("/api/stock/returnable-pending", {});
      setChallans(data.challans);
      setItems(data.items);
    } catch (err) {
      reportFormError(err, { fallback: "Could not load pending returnable challans" });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const itemsOf = useMemo(() => {
    const map = new Map<string, any[]>();
    items.forEach((i) => { const k = String(i.DeliveryChallanId); if (!map.has(k)) map.set(k, []); map.get(k)!.push(i); });
    return map;
  }, [items]);

  const filtered = challans.filter((r) => {
    const q = search.toLowerCase();
    const lines = itemsOf.get(String(r.DeliveryChallanId)) || [];
    return (due === "All" || dueState(r) === due) && (!center || r.JobWorkerId === center)
      && (!q || [r.ChallanNo, r.JobWorkerName, r.Purpose, r.DispatchLocName, r.VehicleNo, r.RequestNo, ...lines.map((l) => l.ItemName), ...lines.map((l) => l.ItemCode)].some((v) => v?.toLowerCase().includes(q)))
      && inDateRange(r.ChallanDate, range);
  });
  const count = (d: Exclude<Due, "All">) => challans.filter((r) => dueState(r) === d).length;
  const centers = Array.from(new Map(challans.map((r) => [r.JobWorkerId, r.JobWorkerName])).entries()).map(([value, label]) => ({ value, label: label || "—" }));

  // Two sheets: one row per challan, and one row per item still out (both follow the filters on screen).
  const exportExcel = () => {
    const itemRows = filtered.flatMap((r) => (itemsOf.get(String(r.DeliveryChallanId)) || []).map((l) => ({ r, l })));
    return writeExcel({
      title: "Pending Returnable Challans",
      filters: { "Challan date": rangeLabel(range), Status: due !== "All" ? due : null, "Job worker": center ? centers.find((c) => c.value === center)?.label : null, Search: search || null },
      sheets: [
        { name: "Pending challans", rows: filtered, columns: [
          { header: "Challan No.", value: (r: any) => r.ChallanNo },
          { header: "Challan Date", value: (r: any) => r.ChallanDate, type: "date" },
          { header: "Expected Back By", value: (r: any) => r.ExpectedBackBy, type: "date" },
          { header: "Status", value: (r: any) => dueState(r) },
          { header: "Days Out", value: (r: any) => Number(r.DaysOut), type: "number" },
          { header: "Days Overdue", value: (r: any) => Math.max(0, Number(r.DaysOverdue) || 0), type: "number" },
          { header: "Job Worker", value: (r: any) => r.JobWorkerName },
          { header: "Job Worker Code", value: (r: any) => r.JobWorkerCode },
          { header: "Contact Person", value: (r: any) => r.ContactPerson },
          { header: "Mobile", value: (r: any) => r.Mobile },
          { header: "Party Kind", value: (r: any) => r.PartyKind },
          { header: "Purpose", value: (r: any) => r.Purpose },
          { header: "Dispatched From", value: (r: any) => r.DispatchLocName },
          { header: "Material Request", value: (r: any) => r.RequestNo },
          { header: "Items", value: (r: any) => Number(r.ItemCount), type: "number", total: true },
          { header: "Total Qty", value: (r: any) => Number(r.TotalQty), type: "number", total: true },
          { header: "Value", value: (r: any) => Number(r.TotalValue), type: "money", total: true },
          { header: "Transporter", value: (r: any) => r.TransporterName },
          { header: "Mode", value: (r: any) => r.TransportMode },
          { header: "Vehicle No.", value: (r: any) => r.VehicleNo },
          { header: "LR / Docket No.", value: (r: any) => r.LrNo },
          { header: "Remarks", value: (r: any) => r.Remarks },
        ] },
        { name: "Pending items", rows: itemRows, columns: [
          { header: "Challan No.", value: (x: any) => x.r.ChallanNo },
          { header: "Challan Date", value: (x: any) => x.r.ChallanDate, type: "date" },
          { header: "Expected Back By", value: (x: any) => x.r.ExpectedBackBy, type: "date" },
          { header: "Status", value: (x: any) => dueState(x.r) },
          { header: "Job Worker", value: (x: any) => x.r.JobWorkerName },
          { header: "Purpose", value: (x: any) => x.r.Purpose },
          { header: "Line", value: (x: any) => Number(x.l.LineNo), type: "number" },
          { header: "Item Code", value: (x: any) => x.l.ItemCode },
          { header: "Item", value: (x: any) => x.l.ItemName },
          { header: "Unit", value: (x: any) => x.l.Uom },
          { header: "Qty", value: (x: any) => Number(x.l.Qty), type: "number", total: true },
          { header: "Value / Unit", value: (x: any) => Number(x.l.Rate), type: "money" },
          { header: "Value", value: (x: any) => Number(x.l.Amount), type: "money", total: true },
          { header: "Item Remarks", value: (x: any) => x.l.Remarks },
        ] },
      ],
    });
  };

  const columns = [
    { title: "Challan no.", dataIndex: "ChallanNo", key: "no", width: 150, render: (v: string, r: any) => <div><span className="font-mono font-bold text-blue-700">{v}</span>{r.RequestNo && <div className="text-[11px] font-mono text-slate-400">{r.RequestNo}</div>}</div> },
    { title: "Challan date", dataIndex: "ChallanDate", key: "date", width: 115, render: (v: string) => formatDate(v) },
    { title: "Job worker", dataIndex: "JobWorkerName", key: "sc", render: (v: string, r: any) => <div><b className="text-slate-800">{v || "—"}</b><div className="text-[11px] text-slate-400">{[r.ContactPerson, r.Mobile].filter(Boolean).join(" · ")}</div></div> },
    { title: "Purpose", dataIndex: "Purpose", key: "purpose", render: (v: string, r: any) => <div className="text-xs"><div>{v}</div><div className="text-slate-400">from {r.DispatchLocName || "—"}</div></div> },
    { title: "Expected back", dataIndex: "ExpectedBackBy", key: "back", width: 120, render: (v: string, r: any) => (v ? <span className={dueState(r) === "Overdue" ? "font-semibold text-red-600" : ""}>{formatDate(v)}</span> : "—") },
    { title: "Status", key: "due", width: 150, render: (_: any, r: any) => <div><Tag color={DUE_COLOR[dueState(r)]}>{dueState(r)}</Tag><div className="mt-0.5 text-[11px] text-slate-400">{dueText(r)}</div></div> },
    { title: "Days out", dataIndex: "DaysOut", key: "out", width: 90, align: "right" as const, render: (v: number) => <b>{v}</b> },
    { title: "Items", key: "items", width: 75, align: "right" as const, render: (_: any, r: any) => <Tooltip title={`Total quantity ${Number(r.TotalQty)}`}><span>{r.ItemCount}</span></Tooltip> },
    { title: "Value ₹", dataIndex: "TotalValue", key: "value", width: 110, align: "right" as const, render: (v: number) => inr(v, 2) },
  ];

  const itemColumns = [
    { title: "#", dataIndex: "LineNo", key: "n", width: 44 },
    { title: "Item", key: "item", render: (_: any, l: any) => <div><div className="font-semibold text-slate-800">{l.ItemName}</div>{l.ItemCode && <div className="text-[11px] font-mono text-slate-400">{l.ItemCode}</div>}</div> },
    { title: "Quantity", key: "qty", width: 110, align: "right" as const, render: (_: any, l: any) => <b>{Number(l.Qty)}{l.Uom ? ` ${l.Uom}` : ""}</b> },
    { title: "Value / unit ₹", dataIndex: "Rate", key: "rate", width: 120, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Value ₹", dataIndex: "Amount", key: "amt", width: 110, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Remarks", dataIndex: "Remarks", key: "rem", render: (v: string) => v || <span className="text-slate-300">—</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<RollbackOutlined />} title="Pending Returnable" subtitle="Returnable delivery challans whose material has not come back yet · overdue first · expand a row to see its items"
        actions={<>
          <ExportExcelButton onExport={exportExcel} disabled={!filtered.length} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        </>} />

      <StatStrip items={[
        { label: "Challans pending", value: challans.length, tone: "warn" },
        { label: "Overdue", value: count("Overdue"), tone: count("Overdue") ? "danger" : undefined },
        { label: "Due in 7 days", value: count("Due in 7 days"), tone: count("Due in 7 days") ? "warn" : undefined },
        { label: "Items out (qty)", value: challans.reduce((s, r) => s + Number(r.TotalQty || 0), 0) },
        { label: "Value out", value: `₹ ${inr(challans.reduce((s, r) => s + Number(r.TotalValue || 0), 0))}` },
      ]} />

      <div className="filter-toolbar">
        <Segmented value={due} onChange={(v) => setDue(v as Due)} options={DUE_VIEWS.map((d) => ({ value: d, label: d === "All" ? `All (${challans.length})` : `${d} (${count(d)})` }))} />
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search challan, job worker, item, vehicle..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <DateRangeFilter value={range} onChange={setRange} placeholder={["Challan date from", "to"]} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Job worker: All" value={center} onChange={setCenter} options={centers} className="w-56" />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="DeliveryChallanId" size="middle" loading={loading} scroll={{ x: 1200 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          rowClassName={(r) => (dueState(r) === "Overdue" ? "bg-red-50/40" : "")}
          expandable={{ expandedRowRender: (r) => <Table size="small" rowKey="LineNo" dataSource={itemsOf.get(String(r.DeliveryChallanId)) || []} columns={itemColumns} pagination={false} /> }}
          locale={{ emptyText: challans.length ? "No challans match the filters" : "Nothing pending — every returnable challan is back" }} />
      </div>
    </div>
  );
}
