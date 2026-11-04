"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { Button, Input, Segmented, Select, Table, Tag, Tooltip } from "antd";
import { DownloadOutlined, ReloadOutlined, RollbackOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

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
      && (!q || [r.ChallanNo, r.JobWorkerName, r.Purpose, r.DispatchLocName, r.VehicleNo, r.RequestNo, ...lines.map((l) => l.ItemName), ...lines.map((l) => l.ItemCode)].some((v) => v?.toLowerCase().includes(q)));
  });
  const count = (d: Exclude<Due, "All">) => challans.filter((r) => dueState(r) === d).length;
  const centers = Array.from(new Map(challans.map((r) => [r.JobWorkerId, r.JobWorkerName])).entries()).map(([value, label]) => ({ value, label: label || "—" }));

  // Two sheets: one row per challan, and one row per item still out (both follow the filters on screen).
  const exportExcel = () => {
    const challanRows = filtered.map((r) => ({
      "Challan No": r.ChallanNo, "Challan Date": formatDate(r.ChallanDate), "Expected Back By": r.ExpectedBackBy ? formatDate(r.ExpectedBackBy) : "",
      Status: dueState(r), "Days Out": Number(r.DaysOut), "Days Overdue": Math.max(0, Number(r.DaysOverdue) || 0),
      "Job Worker": r.JobWorkerName || "", "Job Worker Code": r.JobWorkerCode || "", "Contact Person": r.ContactPerson || "", Mobile: r.Mobile || "",
      "Party Kind": r.PartyKind || "", Purpose: r.Purpose || "", "Dispatched From": r.DispatchLocName || "", "Material Request": r.RequestNo || "",
      Items: Number(r.ItemCount), "Total Qty": Number(r.TotalQty), "Value (₹)": Number(r.TotalValue),
      Transporter: r.TransporterName || "", Mode: r.TransportMode || "", "Vehicle No": r.VehicleNo || "", "LR / Docket No": r.LrNo || "", Remarks: r.Remarks || "",
    }));
    const itemRows = filtered.flatMap((r) => (itemsOf.get(String(r.DeliveryChallanId)) || []).map((l) => ({
      "Challan No": r.ChallanNo, "Challan Date": formatDate(r.ChallanDate), "Expected Back By": r.ExpectedBackBy ? formatDate(r.ExpectedBackBy) : "", Status: dueState(r),
      "Job Worker": r.JobWorkerName || "", Purpose: r.Purpose || "", "Line": Number(l.LineNo), "Item Code": l.ItemCode || "", Item: l.ItemName, Unit: l.Uom || "",
      Qty: Number(l.Qty), "Value / Unit (₹)": Number(l.Rate), "Value (₹)": Number(l.Amount), "Item Remarks": l.Remarks || "",
    })));
    const wb = XLSX.utils.book_new();
    const sheet = (rows: any[], name: string) => {
      const ws = XLSX.utils.json_to_sheet(rows);
      if (rows.length) ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.min(48, Math.max(k.length, ...rows.map((x) => String(x[k] ?? "").length)) + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    sheet(challanRows, "Pending challans");
    sheet(itemRows, "Pending items");
    XLSX.writeFile(wb, `Pending_returnable_${dayjs().format("YYYY-MM-DD")}.xlsx`);
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
          <Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={!filtered.length}>Export Excel</Button>
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
