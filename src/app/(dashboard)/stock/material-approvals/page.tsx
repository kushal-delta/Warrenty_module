"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Button, Drawer, Input, Segmented, Table, Tag, Tooltip, message } from "antd";
import { AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, CodeSandboxOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { FormSection } from "@/components/common/FormSection";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

const TYPE_LABEL: Record<string, string> = { Product: "Product items", Spare: "Spare parts" };
const PRIORITY_COLOR: Record<string, string> = { Low: "default", Normal: "blue", High: "orange", Urgent: "red" };
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const STATUS_COLOR: Record<string, string> = { Pending: "gold", Approved: "green", Rejected: "red" };
const VIEWS = ["Pending", "Approved", "Rejected", "All"];

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-0.5 text-sm text-slate-800">{children || "—"}</div></div>
);

/** Spares Stock → Material Approvals: approve or reject the requests raised on the Material Request screen. */
export default function MaterialApprovalsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("Pending");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [deciding, setDeciding] = useState<"Approved" | "Rejected" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.post("/api/stock/material-requests/get", {})).data.requests); }
    catch (err) { reportFormError(err, { fallback: "Could not load material requests" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openRequest = async (row: any) => {
    setOpen(row);
    setRemarks("");
    setLines([]);
    setLinesLoading(true);
    try { setLines((await axios.post("/api/stock/material-requests/get", { MaterialRequestId: row.MaterialRequestId })).data.items); }
    catch (err) { reportFormError(err, { fallback: "Could not load the request items" }); setOpen(null); }
    finally { setLinesLoading(false); }
  };

  const decide = async (decision: "Approved" | "Rejected") => {
    if (decision === "Rejected" && !remarks.trim()) { message.error("Enter the reason for rejecting"); return; }
    setDeciding(decision);
    try {
      await axios.post("/api/stock/material-requests/decide", { MaterialRequestId: open.MaterialRequestId, Decision: decision, Remarks: remarks.trim() || null });
      message.success(`${open.RequestNo} ${decision === "Approved" ? "approved" : "rejected"}`);
      setOpen(null);
      load();
    } catch (err) {
      reportFormError(err, { fallback: "Could not record the decision" });
    } finally {
      setDeciding(null);
    }
  };

  const count = (status: string) => rows.filter((r) => r.Status === status).length;
  const filtered = rows
    .filter((r) => {
      const q = search.toLowerCase();
      return (view === "All" || r.Status === view) && (!q || [r.RequestNo, r.RequestForName, r.RequestedBy, r.Remarks].some((v) => v?.toLowerCase().includes(q)));
    })
    // Pending: most urgent first, then the oldest; decided: latest first (as loaded).
    .sort((a, b) => (view === "Pending" ? (PRIORITY_RANK[a.Priority] ?? 9) - (PRIORITY_RANK[b.Priority] ?? 9) || String(a.RequestDate).localeCompare(String(b.RequestDate)) : 0));

  const overdue = (r: any) => r.Status === "Pending" && r.RequiredBy && new Date(r.RequiredBy) < new Date(new Date().toDateString());

  const columns = [
    { title: "Request no.", dataIndex: "RequestNo", key: "no", width: 150, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Date", dataIndex: "RequestDate", key: "date", width: 110, render: (v: string) => formatDate(v) },
    { title: "Warehouse", dataIndex: "RequestForName", key: "sc", render: (v: string, r: any) => <div><b className="text-slate-800">{v || "—"}</b><div className="text-[11px] text-slate-400">{r.RequestedBy?.trim() || ""}</div></div> },
    { title: "Type", dataIndex: "RequestType", key: "type", width: 120, render: (v: string) => TYPE_LABEL[v] || v },
    { title: "Items", key: "items", width: 80, align: "right" as const, render: (_: any, r: any) => <Tooltip title={`Total quantity ${Number(r.TotalQty)}`}><span>{r.ItemCount}</span></Tooltip> },
    { title: "Required by", dataIndex: "RequiredBy", key: "req", width: 120, render: (v: string, r: any) => (v ? <span className={overdue(r) ? "font-semibold text-red-600" : ""}>{formatDate(v)}</span> : "—") },
    { title: "Priority", dataIndex: "Priority", key: "priority", width: 95, render: (v: string) => <Tag color={PRIORITY_COLOR[v]}>{v}</Tag> },
    { title: "Status", dataIndex: "Status", key: "status", width: 160, render: (v: string, r: any) => <div><Tag color={STATUS_COLOR[v] || "default"}>{v}</Tag>{r.DecisionBy?.trim() && <div className="mt-0.5 text-[11px] text-slate-400">by {r.DecisionBy.trim()}</div>}</div> },
    { title: "", key: "actions", width: 110, render: (_: any, r: any) => r.Status === "Pending"
      ? <Button size="small" type="primary" className="bg-blue-600" icon={<AuditOutlined />} onClick={() => openRequest(r)}>Review</Button>
      : <Button size="small" icon={<EyeOutlined />} onClick={() => openRequest(r)}>View</Button> },
  ];

  const pending = open?.Status === "Pending";

  return (
    <div className="space-y-4">
      <PageHeader icon={<AuditOutlined />} title="Material Approvals" subtitle="Approve or reject material requests raised by service centers · urgent and high priority requests are listed first"
        actions={<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>} />

      <StatStrip items={[
        { label: "Waiting for approval", value: count("Pending"), tone: "warn" },
        { label: "Urgent / high (pending)", value: rows.filter((r) => r.Status === "Pending" && (r.Priority === "Urgent" || r.Priority === "High")).length, tone: "danger" },
        { label: "Past required-by (pending)", value: rows.filter(overdue).length, tone: rows.some(overdue) ? "danger" : undefined },
        { label: "Approved", value: count("Approved"), tone: "ok" },
        { label: "Rejected", value: count("Rejected") },
      ]} />

      <div className="filter-toolbar">
        <Segmented value={view} onChange={(v) => setView(String(v))} options={VIEWS.map((v) => ({ value: v, label: v === "All" ? `All (${rows.length})` : `${v} (${count(v)})` }))} />
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search request no., warehouse, requested by..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="MaterialRequestId" size="middle" loading={loading} scroll={{ x: 1150 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          onRow={(r) => ({ onDoubleClick: () => openRequest(r) })}
          locale={{ emptyText: view === "Pending" ? "Nothing waiting for approval" : "No requests" }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={!!open} onClose={() => setOpen(null)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={open && <DrawerHeader icon={<AuditOutlined />} title={`${pending ? "Review" : "View"} — ${open.RequestNo}`} subtitle={`${TYPE_LABEL[open.RequestType] || open.RequestType} for ${open.RequestForName || "warehouse"}`}
          meta={<><DrawerChip label={open.Priority} tone="outline" /><DrawerChip label={open.Status} tone="solid" /></>} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setOpen(null)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2">
          <Button onClick={() => setOpen(null)} disabled={!!deciding}>{pending ? "Cancel" : "Close"}</Button>
          {pending && <>
            <Button danger icon={<CloseCircleOutlined />} onClick={() => decide("Rejected")} loading={deciding === "Rejected"} disabled={!!deciding && deciding !== "Rejected"}>Reject</Button>
            <Button type="primary" className="bg-green-600" icon={<CheckCircleOutlined />} onClick={() => decide("Approved")} loading={deciding === "Approved"} disabled={!!deciding && deciding !== "Approved"}>Approve</Button>
          </>}
        </div>}
      >
        {open && <div className="entry-form">
          <FormSection number="01" title="Request details" description="Raised on the Material Request screen.">
            <div className="form-grid form-grid-three">
              <Detail label="Request type">{TYPE_LABEL[open.RequestType] || open.RequestType}</Detail>
              <Detail label="Warehouse">{open.RequestForName}{open.RequestForCode ? ` (${open.RequestForCode})` : ""}</Detail>
              <Detail label="Requested by">{open.RequestedBy?.trim()}</Detail>
              <Detail label="Request date">{formatDate(open.RequestDate)}</Detail>
              <Detail label="Required by">{open.RequiredBy ? <span className={overdue(open) ? "font-semibold text-red-600" : ""}>{formatDate(open.RequiredBy)}{overdue(open) ? " · past due" : ""}</span> : null}</Detail>
              <Detail label="Priority"><Tag color={PRIORITY_COLOR[open.Priority]}>{open.Priority}</Tag></Detail>
              <div className="entry-field-wide"><Detail label="Remarks">{open.Remarks}</Detail></div>
            </div>
          </FormSection>

          <section className="mt-4 rounded-xl border border-orange-200 bg-white overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-orange-50/70 border-b border-orange-100">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-500 text-lg"><CodeSandboxOutlined /></span>
              <div><div className="text-sm font-bold text-slate-800">Items requested</div><div className="text-xs text-slate-500">{lines.length} item{lines.length === 1 ? "" : "s"} · total quantity {lines.reduce((s, l) => s + Number(l.Qty || 0), 0)}</div></div>
            </div>
            <div className="p-3">
              <Table size="small" rowKey="MaterialRequestItemLnId" dataSource={lines} loading={linesLoading} pagination={false} scroll={{ x: 640 }} columns={[
                { title: "#", dataIndex: "LineNo", key: "n", width: 44 },
                { title: "Item", key: "item", render: (_: any, l: any) => <div><div className="font-semibold text-slate-800">{l.ItemName}</div>{l.ItemCode && <div className="text-[11px] font-mono text-slate-400">{l.ItemCode}</div>}</div> },
                { title: "Quantity", key: "qty", width: 110, align: "right" as const, render: (_: any, l: any) => <b>{Number(l.Qty)}{l.Uom ? ` ${l.Uom}` : ""}</b> },
                { title: "Remarks", dataIndex: "Remarks", key: "rem", render: (v: string) => v || <span className="text-slate-300">—</span> },
              ]} />
            </div>
          </section>

          <div className="mt-4">
            <FormSection number="02" title={pending ? "Decision" : "Decision taken"} description={pending ? "Remarks are optional to approve and required to reject." : "Recorded on this request."}>
              {pending
                // pb-8 keeps the "0 / 500" counter (drawn below the box) inside the card
                ? <div className="pb-8"><div className="mb-1">{fieldLabel("Remarks")}</div><Input.TextArea rows={3} maxLength={500} showCount value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Approved — dispatch from factory store / reason for rejecting" /></div>
                : <div className="form-grid form-grid-three">
                    <Detail label="Status"><Tag color={STATUS_COLOR[open.Status] || "default"}>{open.Status}</Tag></Detail>
                    <Detail label="By">{open.DecisionBy?.trim()}</Detail>
                    <Detail label="On">{open.DecisionOn ? formatDate(open.DecisionOn) : null}</Detail>
                    <div className="entry-field-wide"><Detail label="Remarks">{open.DecisionRemarks}</Detail></div>
                  </div>}
            </FormSection>
          </div>
        </div>}
      </Drawer>
    </div>
  );
}
