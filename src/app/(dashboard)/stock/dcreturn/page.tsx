"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { Button, DatePicker, Input, InputNumber, Modal, Select, Table, Tooltip, message } from "antd";
import { ArrowRightOutlined, DeleteOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, RollbackOutlined, SaveOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

interface Line { DeliveryChallanItemLnId: string; LineNo: number; ItemCode?: string; ItemName: string; Uom?: string; Issued: number; Fresh: number; Defective: number; Pending: number; QtyFresh?: number; QtyDefective?: number; DefectSerial?: string; Remarks?: string }
const qty = (n: unknown) => Number(Number(n || 0).toFixed(3));
const THROUGH = ["Courier", "Transporter", "By hand"];

/** Spares Stock → Defective / Fresh Receipt: material received back against a returnable delivery challan (RDC). */
export default function DefectiveFreshReceiptPage() {
  const user = useAuthStore((s) => s.user);
  const headOffice = Boolean(user?.IsAdmin) || user?.Role === "SUPER" || user?.Role === "HO";
  const [rows, setRows] = useState<any[]>([]);
  const [pendingKpi, setPendingKpi] = useState<{ Challans: number; Qty: number }>({ Challans: 0, Qty: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [worker, setWorker] = useState<string>();
  const [receivedAs, setReceivedAs] = useState<string>();
  // step 1 / 2
  const [pickOpen, setPickOpen] = useState(false);
  const [pending, setPending] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [picked, setPicked] = useState<string>();
  const [opening, setOpening] = useState(false);
  const [challan, setChallan] = useState<any>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [through, setThrough] = useState<string>();
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.post("/api/stock/dcreturn/get", {});
      setRows(data.lines);
      setPendingKpi({ Challans: Number(data.pending.Challans || 0), Qty: Number(data.pending.Qty || 0) });
    } catch (err) {
      reportFormError(err, { fallback: "Could not load defective / fresh receipts" });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startNew = async () => {
    setPicked(undefined); setPickOpen(true); setPendingLoading(true);
    try { setPending((await axios.post("/api/stock/dcreturn/challans", {})).data.challans); }
    catch (err) { reportFormError(err, { fallback: "Could not load returnable challans" }); }
    finally { setPendingLoading(false); }
  };

  const openChallan = async (id: string) => {
    setOpening(true);
    try {
      const { data } = await axios.post("/api/stock/dcreturn/challans", { DeliveryChallanId: id });
      setChallan(data.challan);
      setLines(data.lines.map((l: any) => ({ ...l, QtyFresh: 0, QtyDefective: 0, DefectSerial: "", Remarks: "" })));
      setDate(dayjs()); setThrough(undefined); setRemarks("");
      setPickOpen(false);
    } catch (err) {
      reportFormError(err, { fallback: "Could not open the challan" });
    } finally {
      setOpening(false);
    }
  };

  const updateLine = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.DeliveryChallanItemLnId === id ? { ...l, ...patch } : l)));
  const over = (l: Line) => qty(Number(l.QtyFresh || 0) + Number(l.QtyDefective || 0)) > l.Pending;

  const save = async () => {
    const bad = lines.find(over);
    if (bad) { message.error(`${bad.ItemName}: only ${bad.Pending} is pending`); return; }
    if (!lines.some((l) => Number(l.QtyFresh || 0) + Number(l.QtyDefective || 0) > 0)) { message.error("Enter a fresh or defective quantity for at least one item"); return; }
    setSaving(true);
    try {
      const { data } = await axios.post("/api/stock/dcreturn/save", {
        DeliveryChallanId: challan.DeliveryChallanId, ReturnDate: date.format("YYYY-MM-DD"), ReceivedThrough: through || null, Remarks: remarks || null,
        lines: lines.map((l) => ({ DeliveryChallanItemLnId: l.DeliveryChallanItemLnId, QtyFresh: l.QtyFresh || 0, QtyDefective: l.QtyDefective || 0, DefectSerial: l.DefectSerial || null, Remarks: l.Remarks || null })),
      });
      message.success(`${data.receipt.returnNo} saved — fresh ${qty(data.receipt.fresh)}, defective ${qty(data.receipt.defective)} against ${data.receipt.challanNo}`);
      setChallan(null);
      load();
    } catch (err) {
      reportFormError(err, { fallback: "Could not save the receipt" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (!worker || r.JobWorkerId === worker)
      && (!receivedAs || (receivedAs === "Fresh" ? Number(r.QtyFresh) > 0 : Number(r.QtyDefective) > 0))
      && (!q || [r.ReturnNo, r.ChallanNo, r.JobWorkerName, r.ItemName, r.ItemCode, r.DefectSerial, r.ReceivedThrough].some((v) => v?.toLowerCase().includes(q)));
  });
  const workers = Array.from(new Map(rows.map((r) => [r.JobWorkerId, r.JobWorkerName])).entries()).map(([value, label]) => ({ value, label: label || "—" }));
  const sumOf = (list: any[], k: string) => list.reduce((s, r) => s + Number(r[k] || 0), 0);
  const canDelete = (r: any) => headOffice || String(r.InsertedByUserId || "").toLowerCase() === String(user?.UserId || "").toLowerCase();

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map((r) => ({
      "Receipt No": r.ReturnNo, Date: formatDate(r.ReturnDate), "Against RDC": r.ChallanNo, "RDC date": formatDate(r.ChallanDate), "Job worker": r.JobWorkerName || "",
      "Item code": r.ItemCode || "", Item: r.ItemName, Issued: qty(r.Issued), Fresh: qty(r.QtyFresh), Defective: qty(r.QtyDefective), "Pending on RDC": qty(r.PendingOnLine),
      "Defect serial": r.DefectSerial || "", Through: r.ReceivedThrough || "", Remarks: r.Remarks || r.ReturnRemarks || "", "Received by": r.ReceivedBy?.trim() || "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Defective - Fresh receipts");
    XLSX.writeFile(wb, `Defective_Fresh_receipts_${dayjs().format("YYYY-MM-DD")}.xlsx`);
  };

  const columns = [
    { title: "Receipt no.", dataIndex: "ReturnNo", key: "no", width: 140, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Date", dataIndex: "ReturnDate", key: "date", width: 105, render: (v: string) => formatDate(v) },
    { title: "Against RDC", key: "rdc", width: 150, render: (_: any, r: any) => <div><span className="font-mono text-teal-700">{r.ChallanNo}</span><div className="text-[11px] text-slate-400">{formatDate(r.ChallanDate)}</div></div> },
    { title: "Job worker", dataIndex: "JobWorkerName", key: "jw", render: (v: string) => v || "—" },
    { title: "Item", key: "item", render: (_: any, r: any) => <div><div className="font-medium text-slate-800">{r.ItemName}</div>{r.ItemCode && <div className="text-[11px] font-mono text-slate-400">{r.ItemCode}</div>}</div> },
    { title: "Issued", dataIndex: "Issued", key: "iss", width: 80, align: "right" as const, render: (v: number) => qty(v) },
    { title: "Fresh", dataIndex: "QtyFresh", key: "f", width: 80, align: "right" as const, render: (v: number) => <b className="text-emerald-600">{qty(v)}</b> },
    { title: "Defective", dataIndex: "QtyDefective", key: "d", width: 95, align: "right" as const, render: (v: number) => <b className={Number(v) ? "text-red-600" : "text-slate-400"}>{qty(v)}</b> },
    { title: "Pending on RDC", dataIndex: "PendingOnLine", key: "p", width: 125, align: "right" as const, render: (v: number) => Number(v) > 0 ? <b className="text-amber-600">{qty(v)}</b> : <span className="text-slate-400">0</span> },
    { title: "Defect serial", dataIndex: "DefectSerial", key: "s", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : <span className="text-slate-300">—</span> },
    { title: "Through", dataIndex: "ReceivedThrough", key: "t", render: (v: string) => v || <span className="text-slate-300">—</span> },
    { title: "", key: "a", width: 50, render: (_: any, r: any) => canDelete(r) ? <Tooltip title={`Delete receipt ${r.ReturnNo} (all its lines)`}><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(r)} /></Tooltip> : null },
  ];

  const totPending = lines.reduce((s, l) => s + l.Pending, 0);
  const totNow = lines.reduce((s, l) => s + Number(l.QtyFresh || 0) + Number(l.QtyDefective || 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader icon={<RollbackOutlined />} title="Defective / Fresh Receipt" subtitle="Fresh (unused) stock and defective parts received back against returnable delivery challans (RDC)"
        actions={<>
          <Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={!filtered.length}>Export Excel</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={startNew} className="bg-blue-600 shadow-sm">Receive against RDC</Button>
        </>} />

      <StatStrip items={[
        { label: "Receipts", value: new Set(rows.map((r) => r.ChallanReturnId)).size },
        { label: "Fresh qty received", value: qty(sumOf(rows, "QtyFresh")), tone: "ok" },
        { label: "Defective qty received", value: qty(sumOf(rows, "QtyDefective")), tone: "danger" },
        { label: "RDC with pending return", value: pendingKpi.Challans, tone: "warn" },
        { label: "Qty still pending", value: qty(pendingKpi.Qty), tone: "warn" },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search receipt, challan, job worker, item, serial..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Job worker: All" value={worker} onChange={setWorker} options={workers} className="w-56" />
        <Select allowClear placeholder="Received as: All" value={receivedAs} onChange={setReceivedAs} options={["Fresh", "Defective"].map((v) => ({ value: v, label: v }))} className="w-44" />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="ChallanReturnItemLnId" size="middle" loading={loading} scroll={{ x: 1450 }} pagination={{ defaultPageSize: 25, showSizeChanger: true }}
          locale={{ emptyText: "No receipts yet — use Receive against RDC when material comes back" }}
          summary={(page) => page.length ? (
            <Table.Summary.Row className="bg-slate-50">
              <Table.Summary.Cell index={0} colSpan={5}><b>Total</b></Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right"><b>{qty(sumOf(page as any[], "Issued"))}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right"><b className="text-emerald-600">{qty(sumOf(page as any[], "QtyFresh"))}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right"><b className="text-red-600">{qty(sumOf(page as any[], "QtyDefective"))}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={8} colSpan={4} />
            </Table.Summary.Row>
          ) : null} />
      </div>

      {/* Step 1 — pick the returnable challan */}
      <Modal open={pickOpen} onCancel={() => setPickOpen(false)} title="Receive against RDC — pick the challan" width={580} destroyOnClose
        footer={<div className="flex justify-end gap-2"><Button onClick={() => setPickOpen(false)}>Cancel</Button><Button type="primary" className="bg-blue-600" disabled={!picked} loading={opening} onClick={() => picked && openChallan(picked)}>Next <ArrowRightOutlined /></Button></div>}>
        <div className="py-2">
          <div className="mb-1.5"><span className="text-rose-600">* </span>{fieldLabel("Returnable delivery challan")}</div>
          <Select showSearch optionFilterProp="label" className="w-full" size="large" loading={pendingLoading} value={picked} onChange={setPicked} placeholder="Select the returnable challan"
            notFoundContent={pendingLoading ? "Loading…" : "Nothing pending — every returnable challan is back"}
            options={pending.map((c) => ({ value: c.DeliveryChallanId, label: `${c.ChallanNo} — ${formatDate(c.ChallanDate)} · ${c.JobWorkerName || "—"} · pending ${qty(c.PendingQty)}` }))} />
          <p className="mt-2 text-xs text-slate-500">Only returnable challans with quantity still to come back are listed.</p>
        </div>
      </Modal>

      {/* Step 2 — fresh / defective per item */}
      <Modal open={!!challan} onCancel={() => setChallan(null)} title={challan ? `Defective / fresh receipt — ${challan.ChallanNo}` : ""} width={1200} destroyOnClose maskClosable={false}
        footer={<div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Receiving <b className="text-slate-800">{qty(totNow)}</b> of <b className="text-slate-800">{qty(totPending)}</b> pending</span>
          <div className="flex gap-2"><Button onClick={() => setChallan(null)} disabled={saving}>Cancel</Button><Button type="primary" icon={<SaveOutlined />} className="bg-blue-600" loading={saving} onClick={save}>Save receipt</Button></div>
        </div>}>
        {challan && <div className="space-y-4 py-1">
          <div className="rounded-lg border-l-4 border-teal-500 bg-teal-50 px-4 py-2.5 text-[13px] text-teal-900">
            Sent on {formatDate(challan.ChallanDate)} to <b>{challan.JobWorkerName || "—"}</b> · {challan.Purpose}{challan.ExpectedBackBy ? <> · expected back by <b>{formatDate(challan.ExpectedBackBy)}</b></> : null}. Enter what came back as <b>fresh</b> (unused) and as <b>defective</b>.
          </div>
          <div className="grid gap-4 md:grid-cols-[220px_220px_1fr]">
            <div><div className="mb-1"><span className="text-rose-600">* </span>{fieldLabel("Receipt date")}</div>
              <DatePicker className="w-full" format="DD-MMM-YYYY" value={date} allowClear={false} onChange={(d) => d && setDate(d)} disabledDate={(d) => d.isAfter(dayjs(), "day") || d.isBefore(dayjs(challan.ChallanDate), "day")} /></div>
            <div><div className="mb-1">{fieldLabel("Received through")}</div>
              <Select allowClear className="w-full" value={through} onChange={setThrough} placeholder="Courier / transporter / by hand" options={THROUGH.map((t) => ({ value: t, label: t }))} /></div>
            <div><div className="mb-1">{fieldLabel("Remarks")}</div>
              <Input maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Docket no., condition on arrival…" /></div>
          </div>
          <Table size="middle" rowKey="DeliveryChallanItemLnId" dataSource={lines} pagination={false} scroll={{ x: 1150 }} columns={[
            { title: "Item", key: "item", render: (_: any, l: Line) => <div><div className="font-semibold text-slate-800">{l.ItemName}</div>{l.ItemCode && <div className="text-[11px] font-mono text-slate-400">{l.ItemCode}</div>}</div> },
            { title: "Issued", dataIndex: "Issued", key: "i", width: 85, align: "right" as const, render: (v: number, l: Line) => `${qty(v)}${l.Uom ? ` ${l.Uom}` : ""}` },
            { title: "Back so far", key: "b", width: 110, align: "right" as const, render: (_: any, l: Line) => <span className="text-xs"><span className="text-emerald-600">{qty(l.Fresh)} F</span> · <span className="text-red-600">{qty(l.Defective)} D</span></span> },
            { title: "Pending", dataIndex: "Pending", key: "p", width: 85, align: "right" as const, render: (v: number) => v > 0 ? <b>{qty(v)}</b> : <span className="text-emerald-600">Done</span> },
            { title: "Fresh now", key: "fn", width: 120, render: (_: any, l: Line) => <InputNumber className="w-full" min={0} precision={3} disabled={l.Pending <= 0} value={l.QtyFresh} status={over(l) ? "error" : undefined} onChange={(v) => updateLine(l.DeliveryChallanItemLnId, { QtyFresh: v ?? 0 })} /> },
            { title: "Defective now", key: "dn", width: 125, render: (_: any, l: Line) => <InputNumber className="w-full" min={0} precision={3} disabled={l.Pending <= 0} value={l.QtyDefective} status={over(l) ? "error" : undefined} onChange={(v) => updateLine(l.DeliveryChallanItemLnId, { QtyDefective: v ?? 0, ...(v ? {} : { DefectSerial: "" }) })} /> },
            { title: "Defect serial", key: "s", width: 170, render: (_: any, l: Line) => <Input maxLength={60} disabled={!Number(l.QtyDefective)} value={l.DefectSerial} placeholder={Number(l.QtyDefective) ? "Serial / tag" : "—"} className="font-mono" onChange={(e) => updateLine(l.DeliveryChallanItemLnId, { DefectSerial: e.target.value })} /> },
            { title: "Remarks", key: "r", width: 200, render: (_: any, l: Line) => <Input maxLength={250} disabled={l.Pending <= 0} value={l.Remarks} placeholder="Condition…" onChange={(e) => updateLine(l.DeliveryChallanItemLnId, { Remarks: e.target.value })} /> },
          ]} />
        </div>}
      </Modal>

      <ConfirmModal open={!!deleting} title="Delete Receipt" description={`Delete receipt ${deleting?.ReturnNo} with all its lines?`} warningText="Its fresh and defective quantities become pending on the challan again." onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try { await axios.post("/api/stock/dcreturn/delete", { ChallanReturnId: deleting.ChallanReturnId }); message.success("Receipt deleted"); setDeleting(null); load(); }
          catch (err) { reportFormError(err, { fallback: "Could not delete the receipt" }); }
        }} />
    </div>
  );
}
