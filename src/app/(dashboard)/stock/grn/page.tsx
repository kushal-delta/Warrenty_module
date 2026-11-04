"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Button, DatePicker, Input, InputNumber, Modal, Select, Table, Tag, Tooltip, message } from "antd";
import { ArrowRightOutlined, DeleteOutlined, EyeOutlined, InboxOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

interface Line { DeliveryChallanItemLnId: string; LineNo: number; ItemCode?: string; ItemName: string; Uom?: string; Dispatched: number; Received: number; Pending: number; QtyReceived?: number; Remarks?: string }
const qty = (n: unknown) => Number(Number(n || 0).toFixed(3));

/** Spares Stock → Goods Receipt (GRN): receive the material of a delivery challan, line by line. */
export default function GoodsReceiptPage() {
  const user = useAuthStore((s) => s.user);
  const headOffice = Boolean(user?.IsAdmin) || user?.Role === "SUPER" || user?.Role === "HO";
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  // step 1: pick the challan
  const [pickOpen, setPickOpen] = useState(false);
  const [pending, setPending] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [picked, setPicked] = useState<string>();
  // step 2: receive the lines
  const [challan, setChallan] = useState<any>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [grnDate, setGrnDate] = useState<Dayjs>(dayjs());
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  // view / delete
  const [viewing, setViewing] = useState<{ receipt: any; items: any[] } | null>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.post("/api/stock/grn/get", {})).data.receipts); }
    catch (err) { reportFormError(err, { fallback: "Could not load goods receipts" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadPending = async () => {
    setPendingLoading(true);
    try { setPending((await axios.post("/api/stock/grn/challans", {})).data.challans); }
    catch (err) { reportFormError(err, { fallback: "Could not load challans to receive" }); }
    finally { setPendingLoading(false); }
  };

  const startNew = () => { setPicked(undefined); setPickOpen(true); loadPending(); };

  const openChallan = async (id: string) => {
    setOpening(true);
    try {
      const { data } = await axios.post("/api/stock/grn/challans", { DeliveryChallanId: id });
      setChallan(data.challan);
      setLines(data.lines.map((l: any) => ({ ...l, QtyReceived: l.Pending, Remarks: "" })));
      setGrnDate(dayjs());
      setRemarks("");
      setPickOpen(false);
    } catch (err) {
      reportFormError(err, { fallback: "Could not open the challan" });
    } finally {
      setOpening(false);
    }
  };

  const updateLine = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.DeliveryChallanItemLnId === id ? { ...l, ...patch } : l)));

  const save = async () => {
    const over = lines.find((l) => Number(l.QtyReceived || 0) > l.Pending);
    if (over) { message.error(`${over.ItemName}: only ${over.Pending} is pending`); return; }
    if (!lines.some((l) => Number(l.QtyReceived || 0) > 0)) { message.error("Enter the received quantity for at least one item"); return; }
    setSaving(true);
    try {
      const { data } = await axios.post("/api/stock/grn/save", {
        DeliveryChallanId: challan.DeliveryChallanId, ReceiptDate: grnDate.format("YYYY-MM-DD"), Remarks: remarks || null,
        lines: lines.map((l) => ({ DeliveryChallanItemLnId: l.DeliveryChallanItemLnId, QtyReceived: l.QtyReceived || 0, Remarks: l.Remarks || null })),
      });
      message.success(`${data.receipt.receiptNo} saved — ${qty(data.receipt.qty)} received against ${data.receipt.challanNo}`);
      setChallan(null);
      load();
    } catch (err) {
      reportFormError(err, { fallback: "Could not save the goods receipt" });
    } finally {
      setSaving(false);
    }
  };

  const view = async (r: any) => {
    try { const { data } = await axios.post("/api/stock/grn/get", { ChallanReceiptId: r.ChallanReceiptId }); setViewing({ receipt: data.receipt, items: data.items }); }
    catch (err) { reportFormError(err, { fallback: "Could not open the goods receipt" }); }
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || [r.ReceiptNo, r.ChallanNo, r.JobWorkerName, r.ReceivedBy, r.Remarks].some((v) => v?.toLowerCase().includes(q));
  });
  const canDelete = (r: any) => headOffice || String(r.InsertedByUserId || "").toLowerCase() === String(user?.UserId || "").toLowerCase();

  const columns = [
    { title: "GRN no.", dataIndex: "ReceiptNo", key: "no", width: 150, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "GRN date", dataIndex: "ReceiptDate", key: "date", width: 110, render: (v: string) => formatDate(v) },
    { title: "Delivery challan", key: "dc", render: (_: any, r: any) => <div><span className="font-mono text-slate-800">{r.ChallanNo}</span><div className="text-[11px] text-slate-400">{formatDate(r.ChallanDate)} · {r.ChallanType}</div></div> },
    { title: "Job worker", dataIndex: "JobWorkerName", key: "jw", render: (v: string) => v || "—" },
    { title: "Items", dataIndex: "ItemCount", key: "items", width: 75, align: "right" as const },
    { title: "Qty received", dataIndex: "QtyReceived", key: "qty", width: 120, align: "right" as const, render: (v: number) => <b>{qty(v)}</b> },
    { title: "Received by", dataIndex: "ReceivedBy", key: "by", render: (v: string) => v?.trim() || "—" },
    { title: "Remarks", dataIndex: "Remarks", key: "rem", render: (v: string) => v ? <span className="text-xs">{v}</span> : <span className="text-slate-300">—</span> },
    { title: "Actions", key: "actions", width: 90, render: (_: any, r: any) => (
      <div className="flex gap-1">
        <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => view(r)} /></Tooltip>
        {canDelete(r) && <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(r)} /></Tooltip>}
      </div>
    ) },
  ];

  const totalPending = lines.reduce((s, l) => s + l.Pending, 0);
  const totalNow = lines.reduce((s, l) => s + Number(l.QtyReceived || 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader icon={<InboxOutlined />} title="Goods Receipt (GRN)" subtitle="Receive the material of a delivery challan — quantity received per item, with remarks for shortage or damage"
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={startNew} className="bg-blue-600 shadow-sm">New Goods Receipt</Button>
        </>} />

      <StatStrip items={[
        { label: "Goods receipts", value: rows.length },
        { label: "Quantity received", value: qty(rows.reduce((s, r) => s + Number(r.QtyReceived || 0), 0)), tone: "ok" },
        { label: "Challans received against", value: new Set(rows.map((r) => r.DeliveryChallanId)).size },
        { label: "This month", value: rows.filter((r) => dayjs(r.ReceiptDate).isSame(dayjs(), "month")).length },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search GRN, challan, job worker, remarks..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="ChallanReceiptId" size="middle" loading={loading} scroll={{ x: 1150 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: "No goods receipts yet — use New Goods Receipt to receive a delivery challan" }} />
      </div>

      {/* Step 1 — pick the delivery challan */}
      <Modal open={pickOpen} onCancel={() => setPickOpen(false)} title="Goods receipt — pick the delivery challan" width={560} destroyOnClose
        footer={<div className="flex justify-end gap-2"><Button onClick={() => setPickOpen(false)}>Cancel</Button><Button type="primary" className="bg-blue-600" disabled={!picked} loading={opening} onClick={() => picked && openChallan(picked)}>Next <ArrowRightOutlined /></Button></div>}>
        <div className="py-2">
          <div className="mb-1.5"><span className="text-rose-600">* </span>{fieldLabel("Delivery challan")}</div>
          <Select showSearch optionFilterProp="label" className="w-full" size="large" loading={pendingLoading} value={picked} onChange={setPicked} placeholder="Select the challan to receive"
            notFoundContent={pendingLoading ? "Loading…" : "Nothing pending — every challan is fully received"}
            options={pending.map((c) => ({ value: c.DeliveryChallanId, label: `${c.ChallanNo} — ${formatDate(c.ChallanDate)} · ${c.JobWorkerName || "—"} · pending ${qty(c.PendingQty)}` }))} />
          <p className="mt-2 text-xs text-slate-500">Only challans with quantity still to receive are listed.</p>
        </div>
      </Modal>

      {/* Step 2 — receive the lines */}
      <Modal open={!!challan} onCancel={() => setChallan(null)} title={challan ? `Goods receipt (GRN) — ${challan.ChallanNo}` : ""} width={1100} destroyOnClose maskClosable={false}
        footer={<div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Receiving <b className="text-slate-800">{qty(totalNow)}</b> of <b className="text-slate-800">{qty(totalPending)}</b> pending</span>
          <div className="flex gap-2"><Button onClick={() => setChallan(null)} disabled={saving}>Cancel</Button><Button type="primary" icon={<SaveOutlined />} className="bg-blue-600" loading={saving} onClick={save}>Save GRN</Button></div>
        </div>}>
        {challan && <div className="space-y-4 py-1">
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 px-4 py-2.5 text-[13px] text-blue-900">
            Dispatched on {formatDate(challan.ChallanDate)}{challan.RequestNo ? <> against <b>{challan.RequestNo}</b></> : null} from <b>{challan.DispatchLocName || "—"}</b> to <b>{challan.JobWorkerName || "—"}</b> · {challan.ChallanType} · {challan.Purpose}.
          </div>
          <div className="grid gap-4 md:grid-cols-[260px_1fr]">
            <div>
              <div className="mb-1"><span className="text-rose-600">* </span>{fieldLabel("GRN date")}</div>
              <DatePicker className="w-full" format="DD-MMM-YYYY" value={grnDate} allowClear={false} onChange={(d) => d && setGrnDate(d)}
                disabledDate={(d) => d.isAfter(dayjs(), "day") || d.isBefore(dayjs(challan.ChallanDate), "day")} />
            </div>
            <div>
              <div className="mb-1">{fieldLabel("Remarks")}</div>
              <Input maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Shortage / damage in transit, if any" />
            </div>
          </div>
          <Table size="middle" rowKey="DeliveryChallanItemLnId" dataSource={lines} pagination={false} scroll={{ x: 980 }} columns={[
            { title: "Item", key: "item", render: (_: any, l: Line) => <div><div className="font-semibold text-slate-800">{l.ItemName}</div>{l.ItemCode && <div className="text-[11px] font-mono text-slate-400">{l.ItemCode}</div>}</div> },
            { title: "Dispatched", dataIndex: "Dispatched", key: "d", width: 110, align: "right" as const, render: (v: number, l: Line) => `${qty(v)}${l.Uom ? ` ${l.Uom}` : ""}` },
            { title: "Already received", dataIndex: "Received", key: "r", width: 140, align: "right" as const, render: (v: number) => qty(v) },
            { title: "Pending", dataIndex: "Pending", key: "p", width: 100, align: "right" as const, render: (v: number) => v > 0 ? <b>{qty(v)}</b> : <Tag color="green" className="!mr-0">Done</Tag> },
            { title: "Received now", key: "now", width: 140, render: (_: any, l: Line) => (
              <InputNumber className="w-full" min={0} max={l.Pending} precision={3} disabled={l.Pending <= 0} value={l.QtyReceived} status={Number(l.QtyReceived || 0) > l.Pending ? "error" : undefined}
                onChange={(v) => updateLine(l.DeliveryChallanItemLnId, { QtyReceived: v ?? 0 })} />
            ) },
            { title: "Remarks", key: "rem", width: 260, render: (_: any, l: Line) => <Input maxLength={250} disabled={l.Pending <= 0} value={l.Remarks} placeholder="Condition, shortage…" onChange={(e) => updateLine(l.DeliveryChallanItemLnId, { Remarks: e.target.value })} /> },
          ]} />
        </div>}
      </Modal>

      {/* View a saved receipt */}
      <Modal open={!!viewing} onCancel={() => setViewing(null)} title={viewing ? `Goods receipt — ${viewing.receipt.ReceiptNo}` : ""} width={900} footer={<Button onClick={() => setViewing(null)}>Close</Button>}>
        {viewing && <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
            <div><div className="text-[11px] font-semibold uppercase text-slate-400">GRN date</div>{formatDate(viewing.receipt.ReceiptDate)}</div>
            <div><div className="text-[11px] font-semibold uppercase text-slate-400">Delivery challan</div><span className="font-mono">{viewing.receipt.ChallanNo}</span></div>
            <div><div className="text-[11px] font-semibold uppercase text-slate-400">Job worker</div>{viewing.receipt.JobWorkerName || "—"}</div>
            <div><div className="text-[11px] font-semibold uppercase text-slate-400">Received by</div>{viewing.receipt.ReceivedBy?.trim() || "—"}</div>
            <div className="col-span-2 md:col-span-4"><div className="text-[11px] font-semibold uppercase text-slate-400">Remarks</div>{viewing.receipt.Remarks || "—"}</div>
          </div>
          <Table size="small" rowKey="ChallanReceiptItemLnId" dataSource={viewing.items} pagination={false} columns={[
            { title: "#", dataIndex: "LineNo", key: "n", width: 44 },
            { title: "Item", key: "item", render: (_: any, l: any) => <div><div className="font-semibold text-slate-800">{l.ItemName}</div>{l.ItemCode && <div className="text-[11px] font-mono text-slate-400">{l.ItemCode}</div>}</div> },
            { title: "Dispatched", dataIndex: "Dispatched", key: "d", width: 110, align: "right" as const, render: (v: number, l: any) => `${qty(v)}${l.Uom ? ` ${l.Uom}` : ""}` },
            { title: "Received", dataIndex: "QtyReceived", key: "q", width: 110, align: "right" as const, render: (v: number) => <b>{qty(v)}</b> },
            { title: "Remarks", dataIndex: "Remarks", key: "r", render: (v: string) => v || <span className="text-slate-300">—</span> },
          ]} />
        </div>}
      </Modal>

      <ConfirmModal open={!!deleting} title="Delete Goods Receipt" description={`Delete goods receipt ${deleting?.ReceiptNo}?`} warningText="Its quantities become pending on the delivery challan again." onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try { await axios.post("/api/stock/grn/delete", { ChallanReceiptId: deleting.ChallanReceiptId }); message.success("Goods receipt deleted"); setDeleting(null); load(); }
          catch (err) { reportFormError(err, { fallback: "Could not delete the goods receipt" }); }
        }} />
    </div>
  );
}
