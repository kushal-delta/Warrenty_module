"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Button, Drawer, Form, Input, InputNumber, Select, Table, Tag, Tooltip, message } from "antd";
import type { InputRef } from "antd";
import { CodeSandboxOutlined, DeleteOutlined, EditOutlined, FileTextOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { FormSection } from "@/components/common/FormSection";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

const CHALLAN_TYPES = ["Returnable", "Non-returnable"];
const TYPE_COLOR: Record<string, string> = { Returnable: "blue", "Non-returnable": "purple" };

/** Transport mode tiles (icons drawn inline, matching the line icon style of the app). */
const icon = (d: React.ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const MODES: { value: string; icon: React.ReactNode }[] = [
  { value: "Road", icon: icon(<><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>) },
  { value: "Rail", icon: icon(<><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14" /><path d="M12 3v8" /><path d="m8 21 1.5-4" /><path d="m16 21-1.5-4" /><path d="M8.5 14h.01" /><path d="M15.5 14h.01" /></>) },
  { value: "Air", icon: icon(<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />) },
  { value: "Ship", icon: icon(<><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" /><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76" /><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6" /><path d="M12 10v4" /><path d="M12 2v3" /></>) },
  { value: "Courier", icon: icon(<><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>) },
];

function ModePicker({ value, onChange, disabled }: { value?: string; onChange?: (v?: string) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {MODES.map((m) => {
        const active = value === m.value;
        return (
          <button key={m.value} type="button" disabled={disabled} aria-pressed={active} onClick={() => onChange?.(active ? undefined : m.value)}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-orange-500 bg-orange-50 text-orange-600 font-semibold ring-1 ring-orange-500" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"}`}>
            {m.icon}{m.value}
          </button>
        );
      })}
    </div>
  );
}

/** Dropdown over a TextLists group with an "Add new …" footer — the new value is saved to the master and selected. */
function TextListSelect({ value, onChange, options, group, noun, placeholder, disabled, onAdded }: {
  value?: string; onChange?: (v?: string) => void; options: string[]; group: string; noun: string; placeholder: string; disabled?: boolean; onAdded: (v: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const draftRef = useRef<InputRef>(null);
  const add = async () => {
    const text = draft.trim();
    if (!text) { draftRef.current?.focus(); return; }
    setBusy(true);
    try {
      const { data } = await axios.post("/api/stock/challans/textlists", { group, value: text });
      onAdded(data.value);
      onChange?.(data.value);
      setDraft(""); setAdding(false);
      message.success(`${noun.charAt(0).toUpperCase() + noun.slice(1)} added`);
    } catch (err) {
      reportFormError(err, { fallback: `Could not add the ${noun}` });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Select showSearch allowClear value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} optionFilterProp="label"
      options={options.map((o) => ({ value: o, label: o }))}
      onOpenChange={(open) => { if (!open) { setAdding(false); setDraft(""); } }}
      popupRender={(menu) => (
        <>
          {menu}
          <div className="mt-1 border-t border-slate-100 p-1.5">
            {adding
              ? <div className="flex gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
                  <Input ref={draftRef} autoFocus size="small" maxLength={120} placeholder={`New ${noun}`} value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); add(); } }} />
                  <Button size="small" type="primary" className="bg-orange-500" loading={busy} onClick={add}>Add</Button>
                </div>
              : <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-orange-600 hover:bg-orange-50" onClick={() => setAdding(true)}>
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-orange-100 text-xs"><PlusOutlined /></span>Add new {noun}
                </button>}
          </div>
        </>
      )} />
  );
}

interface CatalogueItem { key: string; source: "ERP" | "LOCAL"; code: string | null; name: string; uom: string | null; group: string; rate: number | null }
interface Line { key: string; ItemKey?: string; Qty?: number; Rate?: number; Remarks?: string; _name?: string; _code?: string }

let lineSeq = 0;
const newLine = (patch: Partial<Line> = {}): Line => ({ key: `l${++lineSeq}`, ...patch });
const itemLabel = (i: { code?: string | null; name: string }) => (i.code ? `${i.code} — ${i.name}` : i.name);
const lineKey = (i: { ItemSource: string; ErpItmId?: string; SpareId?: string }) => `${i.ItemSource}|${i.ItemSource === "ERP" ? i.ErpItmId : i.SpareId}`.toUpperCase();

/** Spares Stock → Delivery Challan: material dispatched to a job worker / service center, usually against an approved material request. */
export default function DeliveryChallansPage() {
  const [form] = Form.useForm();
  const { serviceCenters } = useMasterStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [lookups, setLookups] = useState<{ textLists: Record<string, string[]>; locs: any[]; transporters: any[]; items: CatalogueItem[]; approvedRequests: any[] }>({ textLists: {}, locs: [], transporters: [], items: [], approvedRequests: [] });
  const [lookupsLoading, setLookupsLoading] = useState(false);
  const challanType = Form.useWatch("ChallanType", form);
  const challanDate = Form.useWatch("ChallanDate", form);
  const readOnly = Boolean(editing && editing.Status !== "Dispatched");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.post("/api/stock/challans/get", {})).data.challans); }
    catch (err) { reportFormError(err, { fallback: "Could not load delivery challans" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadLookups = async (challanId?: string) => {
    setLookupsLoading(true);
    try {
      const { data } = await axios.post("/api/stock/challans/lookups", { DeliveryChallanId: challanId });
      setLookups({ textLists: data.textLists, locs: data.locs, transporters: data.transporters, items: data.items, approvedRequests: data.approvedRequests });
    } catch (err) {
      reportFormError(err, { fallback: "Could not load the challan lists" });
    } finally {
      setLookupsLoading(false);
    }
  };

  const itemByKey = useMemo(() => new Map(lookups.items.map((i) => [i.key.toUpperCase(), i])), [lookups.items]);

  const openForm = async (row?: any) => {
    form.resetFields();
    setEditing(row || null);
    loadLookups(row?.DeliveryChallanId);
    if (!row) {
      form.setFieldsValue({ ChallanDate: dayjs(), ChallanType: "Returnable", TransportMode: "Road" });
      setLines([newLine()]);
      setDrawerOpen(true);
      return;
    }
    try {
      const { data } = await axios.post("/api/stock/challans/get", { DeliveryChallanId: row.DeliveryChallanId });
      const c = data.challan;
      setEditing(c);
      form.setFieldsValue({
        ChallanDate: dayjs(c.ChallanDate), ChallanType: c.ChallanType, Purpose: c.Purpose, DispatchLocId: c.DispatchLocId?.toUpperCase(), ExpectedBackBy: c.ExpectedBackBy ? dayjs(c.ExpectedBackBy) : undefined,
        PartyKind: c.PartyKind || undefined, ServiceCenterId: c.ServiceCenterId, MaterialRequestId: c.MaterialRequestId || undefined, TransporterName: c.TransporterName || undefined,
        TransportMode: c.TransportMode || undefined, VehicleNo: c.VehicleNo || undefined, LrNo: c.LrNo || undefined, Remarks: c.Remarks || undefined,
      });
      setLines(data.items.map((i: any) => newLine({ ItemKey: lineKey(i), Qty: Number(i.Qty), Rate: Number(i.Rate), Remarks: i.Remarks || undefined, _name: i.ItemName, _code: i.ItemCode })));
      setDrawerOpen(true);
    } catch (err) {
      reportFormError(err, { fallback: "Could not open the delivery challan" });
    }
  };

  // Picking an approved material request fills the job worker and the items (value per unit from the carried cost).
  const pickRequest = async (requestId?: string) => {
    if (!requestId) return;
    try {
      const { data } = await axios.post("/api/stock/challans/lookups", { MaterialRequestId: requestId });
      form.setFieldsValue({ ServiceCenterId: data.request.ServiceCenterId });
      setLines(data.requestItems.length ? data.requestItems.map((i: any) => {
        const key = lineKey(i);
        return newLine({ ItemKey: key, Qty: Number(i.Qty), Rate: itemByKey.get(key)?.rate ?? 0, Remarks: i.Remarks || undefined, _name: i.ItemName, _code: i.ItemCode });
      }) : [newLine()]);
      message.success(`Items filled from the material request (${data.requestItems.length})`);
    } catch (err) {
      reportFormError(err, { fallback: "Could not load the material request" });
    }
  };

  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [newLine()]));
  const total = lines.reduce((s, l) => s + (Number(l.Qty) || 0) * (Number(l.Rate) || 0), 0);

  const optionsFor = (line: Line) => {
    const taken = new Set(lines.filter((l) => l.key !== line.key && l.ItemKey).map((l) => l.ItemKey!.toUpperCase()));
    const groups = new Map<string, any[]>();
    lookups.items.forEach((i) => {
      if (!groups.has(i.group)) groups.set(i.group, []);
      groups.get(i.group)!.push({ value: i.key.toUpperCase(), label: itemLabel(i), disabled: taken.has(i.key.toUpperCase()) });
    });
    if (line.ItemKey && !itemByKey.has(line.ItemKey.toUpperCase()) && line._name) groups.set("On this challan", [{ value: line.ItemKey.toUpperCase(), label: itemLabel({ code: line._code, name: line._name }) }]);
    return Array.from(groups.entries()).map(([label, options]) => ({ label, options }));
  };

  const addToList = (group: string) => (value: string) => setLookups((l) => ({ ...l, textLists: { ...l.textLists, [group]: Array.from(new Set([...(l.textLists[group] || []), value])) } }));

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const filled = lines.filter((l) => l.ItemKey);
      if (!filled.length) { message.error("Add at least one item"); return; }
      const missingQty = filled.find((l) => !(Number(l.Qty) > 0));
      if (missingQty) { message.error(`Enter the quantity on line ${lines.indexOf(missingQty) + 1}`); return; }
      setSaving(true);
      const { data } = await axios.post("/api/stock/challans/save", {
        DeliveryChallanId: editing?.DeliveryChallanId,
        ChallanDate: values.ChallanDate.format("YYYY-MM-DD"),
        ChallanType: values.ChallanType,
        Purpose: values.Purpose,
        DispatchLocId: values.DispatchLocId,
        ExpectedBackBy: values.ChallanType === "Returnable" && values.ExpectedBackBy ? values.ExpectedBackBy.format("YYYY-MM-DD") : null,
        PartyKind: values.PartyKind,
        ServiceCenterId: values.ServiceCenterId,
        MaterialRequestId: values.MaterialRequestId || null,
        TransporterName: values.TransporterName,
        TransportMode: values.TransportMode,
        VehicleNo: values.VehicleNo,
        LrNo: values.LrNo,
        Remarks: values.Remarks,
        lines: filled.map((l) => ({ ItemKey: l.ItemKey, Qty: l.Qty, Rate: l.Rate ?? 0, Remarks: l.Remarks || null })),
      });
      message.success(`Delivery challan ${data.challan?.ChallanNo || ""} ${editing ? "updated" : "saved"}`.replace("  ", " "));
      setDrawerOpen(false);
      load();
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save delivery challan" });
    } finally {
      setSaving(false);
    }
  };

  const overdue = (r: any) => r.ChallanType === "Returnable" && r.Status === "Dispatched" && r.ExpectedBackBy && new Date(r.ExpectedBackBy) < new Date(new Date().toDateString());
  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (!typeFilter || r.ChallanType === typeFilter) && (!q || [r.ChallanNo, r.ServiceCenterName, r.Purpose, r.TransporterName, r.VehicleNo, r.RequestNo, r.DispatchLocName].some((v) => v?.toLowerCase().includes(q)));
  });

  const columns = [
    { title: "Challan no.", dataIndex: "ChallanNo", key: "no", width: 150, render: (v: string, r: any) => <div><span className="font-mono font-bold text-blue-700">{v}</span>{r.RequestNo && <div className="text-[11px] font-mono text-slate-400">{r.RequestNo}</div>}</div> },
    { title: "Date", dataIndex: "ChallanDate", key: "date", width: 110, render: (v: string) => formatDate(v) },
    { title: "Type", dataIndex: "ChallanType", key: "type", width: 130, render: (v: string) => <Tag color={TYPE_COLOR[v]}>{v}</Tag> },
    { title: "Job worker", dataIndex: "ServiceCenterName", key: "sc", render: (v: string, r: any) => <div><b className="text-slate-800">{v || "—"}</b><div className="text-[11px] text-slate-400">{r.Purpose}</div></div> },
    { title: "From store", dataIndex: "DispatchLocName", key: "loc", render: (v: string) => v || "—" },
    { title: "Transport", key: "transport", render: (_: any, r: any) => <div className="text-xs"><div>{[r.TransportMode, r.TransporterName].filter(Boolean).join(" · ") || "—"}</div>{r.VehicleNo && <div className="font-mono text-slate-400">{r.VehicleNo}</div>}</div> },
    { title: "Expected back", dataIndex: "ExpectedBackBy", key: "back", width: 120, render: (v: string, r: any) => (v ? <span className={overdue(r) ? "font-semibold text-red-600" : ""}>{formatDate(v)}</span> : "—") },
    { title: "Items", key: "items", width: 75, align: "right" as const, render: (_: any, r: any) => <Tooltip title={`Total quantity ${Number(r.TotalQty)}`}><span>{r.ItemCount}</span></Tooltip> },
    { title: "Value ₹", dataIndex: "TotalValue", key: "value", width: 110, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Actions", key: "actions", width: 90, render: (_: any, r: any) => (
      <div className="flex gap-1">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(r)} /></Tooltip>
        {r.Status === "Dispatched" && <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(r)} /></Tooltip>}
      </div>
    ) },
  ];

  const centerOptions = serviceCenters.filter((c: any) => c.IsActive || c.ServiceCenterId === editing?.ServiceCenterId).map((c: any) => ({ value: c.ServiceCenterId, label: `${c.ServiceCenterName}${c.ServiceCenterCode ? ` (${c.ServiceCenterCode})` : ""}` }));
  const transporterOptions = Array.from(new Set([...lookups.transporters.map((t) => t.Name), ...(lookups.textLists.Transporter || [])])).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <PageHeader icon={<FileTextOutlined />} title="Delivery Challan" subtitle="Material sent out to job workers and service centers · raise it against an approved material request"
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">New Delivery Challan</Button>
        </>} />

      <StatStrip items={[
        { label: "Challans", value: rows.length },
        { label: "Returnable", value: rows.filter((r) => r.ChallanType === "Returnable").length },
        { label: "Past expected-back date", value: rows.filter(overdue).length, tone: rows.some(overdue) ? "danger" : undefined },
        { label: "Non-returnable", value: rows.filter((r) => r.ChallanType === "Non-returnable").length },
        { label: "Value sent", value: `₹ ${inr(rows.reduce((s, r) => s + Number(r.TotalValue || 0), 0))}` },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search challan, job worker, purpose, vehicle..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select allowClear placeholder="Type: All" value={typeFilter} onChange={setTypeFilter} options={CHALLAN_TYPES.map((t) => ({ value: t, label: t }))} className="w-44" />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="DeliveryChallanId" size="middle" loading={loading} scroll={{ x: 1350 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: "No delivery challans yet" }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<FileTextOutlined />} title={editing ? `Edit — ${editing.ChallanNo}` : "New Delivery Challan"} subtitle="Material sent out from an iERP store to a job worker"
          meta={<DrawerChip label={editing ? editing.Status : "New"} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button>{!readOnly && <Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update" : "Save"}</Button>}</div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form" disabled={readOnly}>
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Pick an approved material request to fill the job worker and items.</p>

          <FormSection number="01" title="Challan details" description="Date, type, purpose and the store it leaves from.">
            <div className="form-grid form-grid-three">
              <Form.Item name="ChallanDate" label={fieldLabel("Challan date")} rules={[{ required: true, message: "Challan date is required" }]}>
                <SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} />
              </Form.Item>
              <Form.Item name="ChallanType" label={fieldLabel("Challan type")} rules={[{ required: true, message: "Select the challan type" }]}>
                <Select options={CHALLAN_TYPES.map((t) => ({ value: t, label: t }))} onChange={(t) => { if (t !== "Returnable") form.setFieldValue("ExpectedBackBy", undefined); }} />
              </Form.Item>
              <Form.Item name="Purpose" label={fieldLabel("Purpose")} rules={[{ required: true, message: "Select the purpose" }]}>
                <TextListSelect group="ChallanPurpose" noun="purpose" placeholder="Job work, repair, sample..." options={lookups.textLists.ChallanPurpose || []} onAdded={addToList("ChallanPurpose")} disabled={readOnly} />
              </Form.Item>
              <Form.Item name="DispatchLocId" label={fieldLabel("Dispatch from (store)")} rules={[{ required: true, message: "Select the store" }]}>
                <Select showSearch optionFilterProp="label" loading={lookupsLoading} placeholder="Select iERP store" options={lookups.locs.map((l) => ({ value: String(l.LocId).toUpperCase(), label: l.Name }))} />
              </Form.Item>
              {challanType === "Returnable" && (
                <Form.Item name="ExpectedBackBy" label={fieldLabel("Expected back by")} dependencies={["ChallanDate"]}
                  rules={[{ required: true, message: "Expected back by is required for a returnable challan" }, ({ getFieldValue }) => ({ validator: (_, v) => (!v || !getFieldValue("ChallanDate") || !v.isBefore(getFieldValue("ChallanDate"), "day") ? Promise.resolve() : Promise.reject(new Error("Cannot be before the challan date"))) })]}>
                  <SmartDatePicker disabledDate={(d) => Boolean(challanDate) && d.isBefore(challanDate, "day")} />
                </Form.Item>
              )}
            </div>
          </FormSection>

          <FormSection number="02" title="Party" description="Who the material goes to.">
            <div className="form-grid form-grid-three">
              <Form.Item name="MaterialRequestId" label={fieldLabel("Against material request")} extra="Approved requests only — fills the job worker and items">
                <Select showSearch allowClear optionFilterProp="label" loading={lookupsLoading} placeholder="Select approved request (optional)" onChange={pickRequest}
                  options={lookups.approvedRequests.map((r) => ({ value: r.MaterialRequestId, label: `${r.RequestNo} · ${r.ServiceCenterName || ""} · ${formatDate(r.RequestDate)}` }))} />
              </Form.Item>
              <Form.Item name="PartyKind" label={fieldLabel("Party kind")}>
                <TextListSelect group="PartyKind" noun="party kind" placeholder="Job worker, service center..." options={lookups.textLists.PartyKind || []} onAdded={addToList("PartyKind")} disabled={readOnly} />
              </Form.Item>
              <Form.Item name="ServiceCenterId" label={fieldLabel("Job worker")} rules={[{ required: true, message: "Select the job worker" }]}>
                <Select showSearch optionFilterProp="label" placeholder="Select service center" options={centerOptions} />
              </Form.Item>
            </div>
          </FormSection>

          <FormSection number="03" title="Transport" description="How the material travels.">
            <div className="form-grid form-grid-three">
              <Form.Item name="TransporterName" label={fieldLabel("Transporter name")}>
                <TextListSelect group="Transporter" noun="transporter" placeholder="Select transporter" options={transporterOptions} onAdded={addToList("Transporter")} disabled={readOnly} />
              </Form.Item>
              <Form.Item name="VehicleNo" label={fieldLabel("Vehicle no.")} normalize={(v) => v?.toUpperCase()} rules={[{ max: 30 }]}><Input placeholder="e.g. MP09 AB 1234" className="font-mono" /></Form.Item>
              <Form.Item name="LrNo" label={fieldLabel("LR / docket no.")} rules={[{ max: 50 }]}><Input placeholder="Lorry receipt or courier docket" /></Form.Item>
              <div className="entry-field-wide md:col-span-3"><Form.Item name="TransportMode" label={fieldLabel("Mode")}><ModePicker disabled={readOnly} /></Form.Item></div>
            </div>
          </FormSection>

        {/* Items sent — value per unit starts at the item's carried cost and can be changed for the challan / e-way bill. */}
        <section className="mb-5 rounded-xl border border-orange-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-orange-50/70 border-b border-orange-100">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-500 text-lg"><CodeSandboxOutlined /></span>
              <div><div className="text-sm font-bold text-slate-800">Items sent</div><div className="text-xs text-slate-500">Value per unit starts at the item&apos;s carried cost — change it to the value for the challan and e-way bill.</div></div>
            </div>
            {!readOnly && <Button size="small" icon={<PlusOutlined />} onClick={() => setLines((ls) => [...ls, newLine()])}>Add item</Button>}
          </div>
          <div className="p-3 overflow-x-auto">
            <div className="min-w-[760px] rounded-lg border border-slate-200">
              <div className="grid grid-cols-[minmax(0,1fr)_130px_140px_110px_44px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Item</span><span className="text-right">Quantity</span><span className="text-right">Value / unit</span><span className="text-right">Value</span><span />
              </div>
              {lines.map((l) => {
                const item = l.ItemKey ? itemByKey.get(l.ItemKey.toUpperCase()) : undefined;
                return (
                  <div key={l.key} className="px-3 py-2 border-b border-slate-100 last:border-b-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_130px_140px_110px_44px] items-center gap-2">
                      <Select showSearch allowClear optionFilterProp="label" disabled={readOnly} loading={lookupsLoading} placeholder={lookupsLoading ? "Loading items…" : "Item"} value={l.ItemKey} options={optionsFor(l)}
                        notFoundContent={lookupsLoading ? "Loading…" : "No items"}
                        onChange={(v) => { const picked = v ? itemByKey.get(String(v).toUpperCase()) : undefined; updateLine(l.key, { ItemKey: v, Qty: v && !l.Qty ? 1 : l.Qty, Rate: picked?.rate ?? (v ? l.Rate : undefined) }); }} />
                      <InputNumber className="w-full" min={0} precision={3} placeholder="Qty" value={l.Qty} disabled={readOnly} onChange={(v) => updateLine(l.key, { Qty: v ?? undefined })} addonAfter={item?.uom || undefined} />
                      <InputNumber className="w-full" min={0} precision={2} prefix="₹" placeholder="0.00" value={l.Rate} disabled={readOnly} onChange={(v) => updateLine(l.key, { Rate: v ?? undefined })} />
                      <span className="text-right text-sm font-semibold text-slate-800">₹{inr((Number(l.Qty) || 0) * (Number(l.Rate) || 0), 2)}</span>
                      {!readOnly ? <Tooltip title="Remove line"><Button danger size="small" icon={<DeleteOutlined />} onClick={() => removeLine(l.key)} /></Tooltip> : <span />}
                    </div>
                    <Input variant="borderless" size="small" className="!mt-1 !px-0 text-xs" maxLength={250} disabled={readOnly} placeholder="Remarks for this item (condition, what is to be done...)" value={l.Remarks} onChange={(e) => updateLine(l.key, { Remarks: e.target.value })} />
                  </div>
                );
              })}
              <div className="flex items-center justify-end gap-3 px-3 py-2.5 bg-slate-50 border-t border-slate-200 text-sm">
                <span className="text-slate-500">Total value</span><b className="text-slate-900">₹{inr(total, 2)}</b>
              </div>
            </div>
          </div>
        </section>

          <FormSection number="04" title="Remarks" description="Anything the job worker or the transporter should know.">
            <Form.Item name="Remarks" rules={[{ max: 500 }]}><Input.TextArea rows={3} maxLength={500} showCount placeholder="e.g. Handle with care; return after testing" /></Form.Item>
          </FormSection>
        </Form>
      </Drawer>

      <ConfirmModal open={!!deleting} title="Delete Delivery Challan" description={`Delete delivery challan ${deleting?.ChallanNo}?`} warningText="Its material request becomes available for a new challan." onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try { await axios.post("/api/stock/challans/delete", { DeliveryChallanId: deleting.DeliveryChallanId }); message.success("Delivery challan deleted"); setDeleting(null); load(); }
          catch (err) { reportFormError(err, { fallback: "Could not delete delivery challan" }); }
        }} />
    </div>
  );
}
