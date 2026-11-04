"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AutoComplete, Button, Input, Table, Tag, Tooltip, message } from "antd";
import { ArrowRightOutlined, CheckCircleFilled, CloseCircleFilled, DeleteOutlined, ReloadOutlined, SearchOutlined, SwapOutlined } from "@ant-design/icons";
import axios from "axios";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

interface Verdict { ok: boolean; message: string; info?: { Category?: string } }
interface Row { ReplacementId: string; ReplNo: string; ReplDate: string; OldSerialNo: string; NewSerialNo: string; Category: string; CustomerName?: string; DealerName?: string; WarrantyDaysLeft?: number; Reason?: string }
const CAT_COLOR: Record<string, string> = { PUMP: "blue", MOTOR: "cyan", CONTROLLER: "purple" };

function VerdictBox({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return <div className="min-h-[44px]" />;
  return (
    <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed ${verdict.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
      {verdict.ok ? <CheckCircleFilled className="mt-0.5" /> : <CloseCircleFilled className="mt-0.5" />}
      <span>{verdict.message}</span>
    </div>
  );
}

/** Replacement Flow (In Warranty): a faulty unit in warranty is replaced by a new sticker and its balance warranty moves across. */
export default function ReplacementFlowPage() {
  const [oldSerial, setOldSerial] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [reason, setReason] = useState("");
  const [oldVerdict, setOldVerdict] = useState<Verdict | null>(null);
  const [newVerdict, setNewVerdict] = useState<Verdict | null>(null);
  const [canReplace, setCanReplace] = useState(false);
  const [oldOptions, setOldOptions] = useState<any[]>([]);
  const [newOptions, setNewOptions] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.post("/api/warranty/replacement/get", {})).data.replacements); }
    catch (err) { reportFormError(err, { fallback: "Could not load replacements" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useUrlQuery("old", (sn) => setOldSerial(sn.toUpperCase()));

  // Live verdicts (debounced) for both serials.
  useEffect(() => {
    clearTimeout(timers.current.check);
    if (!oldSerial.trim() && !newSerial.trim()) { setOldVerdict(null); setNewVerdict(null); setCanReplace(false); return; }
    timers.current.check = setTimeout(async () => {
      try {
        const res = (await axios.post("/api/warranty/replacement/check", { oldSerial, newSerial })).data;
        setOldVerdict(res.old); setNewVerdict(res.new); setCanReplace(Boolean(res.canReplace));
      } catch { setCanReplace(false); }
    }, 350);
    return () => clearTimeout(timers.current.check);
  }, [oldSerial, newSerial]);

  const suggest = (kind: "old" | "new", q: string) => {
    clearTimeout(timers.current[kind]);
    timers.current[kind] = setTimeout(async () => {
      try {
        const res = await axios.post("/api/warranty/replacement/suggest", { kind, q, category: kind === "new" ? oldVerdict?.info?.Category : undefined });
        const options = (res.data.serials || []).map((s: any) => ({
          value: s.SerialNo,
          label: (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono font-semibold text-slate-800">{s.SerialNo}</span>
              <Tag color={CAT_COLOR[s.Category]} className="m-0 text-[10px]">{s.Category}</Tag>
              <span className="truncate text-xs text-slate-500">{[s.ModelName, s.CustomerName].filter(Boolean).join(" · ")}</span>
            </div>
          ),
        }));
        (kind === "old" ? setOldOptions : setNewOptions)(options);
      } catch { /* suggestions are optional */ }
    }, q ? 250 : 0);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await axios.post("/api/warranty/replacement/submit", { oldSerial, newSerial, reason });
      message.success(res.data.message);
      setOldSerial(""); setNewSerial(""); setReason(""); setOldVerdict(null); setNewVerdict(null); setCanReplace(false);
      load();
    } catch (err) {
      reportFormError(err, { fallback: "Could not replace the product" });
    } finally {
      setSubmitting(false);
    }
  };

  const undo = async () => {
    if (!deleting) return;
    setUndoBusy(true);
    try {
      await axios.post("/api/warranty/replacement/delete", { ReplacementId: deleting.ReplacementId });
      message.success("Replacement undone — the warranty is back on the old serial");
      setDeleting(null);
      load();
    } catch (err) {
      reportFormError(err, { fallback: "Could not undo the replacement" });
    } finally {
      setUndoBusy(false);
    }
  };

  const filtered = rows.filter((r) => { const q = search.toLowerCase(); return !q || [r.ReplNo, r.OldSerialNo, r.NewSerialNo, r.CustomerName, r.DealerName, r.Reason].some((v) => v?.toLowerCase().includes(q)); });
  const columns = [
    { title: "Replacement No", dataIndex: "ReplNo", key: "no", width: 150, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Date", dataIndex: "ReplDate", key: "date", width: 105, render: (v: string) => formatDate(v) },
    { title: "Old serial", dataIndex: "OldSerialNo", key: "old", render: (v: string) => <span className="font-mono text-xs">{v}</span> },
    { title: "New serial", dataIndex: "NewSerialNo", key: "new", render: (v: string) => <span className="font-mono text-xs font-bold">{v}</span> },
    { title: "Component", dataIndex: "Category", key: "cat", width: 120, render: (v: string) => <Tag color={CAT_COLOR[v]}>{v}</Tag> },
    { title: "Customer", dataIndex: "CustomerName", key: "cust", render: (v: string) => v || "—" },
    { title: "Dealer", dataIndex: "DealerName", key: "dealer", render: (v: string) => v || "—" },
    { title: "Balance days", dataIndex: "WarrantyDaysLeft", key: "days", width: 115, align: "right" as const, render: (v: number) => v ?? "—" },
    { title: "Reason", dataIndex: "Reason", key: "reason", render: (v: string) => <span className="text-xs text-slate-500">{v || "—"}</span> },
    { title: "", key: "a", width: 56, render: (_: any, r: Row) => <Tooltip title="Undo replacement"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(r)} /></Tooltip> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<SwapOutlined />} title="Replacement Flow (In Warranty)" subtitle="Replace a faulty unit with a new serial — the balance warranty moves to the new unit"
        actions={<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>} />

      <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-2">1 · Faulty unit (in warranty)</div>
            <AutoComplete className="w-full" size="large" value={oldSerial} options={oldOptions}
              onFocus={() => suggest("old", oldSerial)} onSearch={(t) => { setOldSerial(t.toUpperCase()); suggest("old", t); }} onChange={(t) => setOldSerial(String(t || "").toUpperCase())}>
              <Input size="large" prefix={<SearchOutlined className="text-slate-400" />} placeholder="Scan / type the OLD serial number" className="font-mono" allowClear />
            </AutoComplete>
            <VerdictBox verdict={oldVerdict} />
          </div>

          <div className="hidden lg:flex h-full items-center pt-8 text-teal-600 text-3xl"><ArrowRightOutlined /></div>

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-2">2 · Replacement unit (new sticker)</div>
            <AutoComplete className="w-full" size="large" value={newSerial} options={newOptions}
              onFocus={() => suggest("new", newSerial)} onSearch={(t) => { setNewSerial(t.toUpperCase()); suggest("new", t); }} onChange={(t) => setNewSerial(String(t || "").toUpperCase())}>
              <Input size="large" prefix={<SearchOutlined className="text-slate-400" />} placeholder="Scan / type the NEW serial number" className="font-mono" allowClear />
            </AutoComplete>
            <VerdictBox verdict={newVerdict} />
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5">{fieldLabel("Reason for Replacement")}</div>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Motor winding burnt, controller dead on arrival…" />
        </div>
        <div className="mt-4 text-right">
          <Button type="primary" size="large" icon={<SwapOutlined />} disabled={!canReplace} loading={submitting} onClick={submit} className="bg-teal-600">Replace &amp; transfer warranty</Button>
        </div>
      </section>

      <StatStrip items={[
        { label: "Replacements done", value: rows.length },
        { label: "Balance days carried", value: rows.reduce((s, r) => s + Number(r.WarrantyDaysLeft || 0), 0) },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search replacement no, serial, customer, dealer, reason…" value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-96" />
      </div>
      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="ReplacementId" size="middle" loading={loading} scroll={{ x: 1100 }} pagination={{ defaultPageSize: 15, showSizeChanger: true }} />
      </div>

      <ConfirmModal open={!!deleting} title="Undo Replacement" description={`Undo replacement ${deleting?.ReplNo} (${deleting?.OldSerialNo} → ${deleting?.NewSerialNo})?`}
        warningText="The warranty goes back to the old serial and the new sticker is freed. Not allowed once the new serial has service calls." loading={undoBusy} onConfirm={undo} onCancel={() => setDeleting(null)} />
    </div>
  );
}
