"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Button, Drawer, Form, Input, InputNumber, Select, Table, Tag, Tooltip, message } from "antd";
import { CodeSandboxOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { FormSection } from "@/components/common/FormSection";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

const REQUEST_TYPES = [
  { value: "Product", label: "Product items", hint: "Finished products from the iERP" },
  { value: "Spare", label: "Spare parts", hint: "Spares master and iERP component items" },
];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const PRIORITY_COLOR: Record<string, string> = { Low: "default", Normal: "blue", High: "orange", Urgent: "red" };
const STATUS_COLOR: Record<string, string> = { Pending: "gold", Approved: "green", Issued: "cyan", Rejected: "red", Closed: "default" };

interface CatalogueItem { key: string; source: "ERP" | "LOCAL"; code: string | null; name: string; uom: string | null; group: string; stock: number | null }
interface Line { key: string; ItemKey?: string; Qty?: number; Remarks?: string }

let lineSeq = 0;
const newLine = (): Line => ({ key: `l${++lineSeq}` });
const itemLabel = (i: { code?: string | null; name: string }) => (i.code ? `${i.code} — ${i.name}` : i.name);

/** Spares Stock → Material Request: a service centre asks for product items or spare parts (iERP items + Spares master). */
export default function MaterialRequestsPage() {
  const [form] = Form.useForm();
  const user = useAuthStore((s) => s.user);
  const headOffice = Boolean(user?.IsAdmin) || user?.Role === "SUPER" || user?.Role === "HO";

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>();
  const [typeFilter, setTypeFilter] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [focusKey, setFocusKey] = useState<string>();
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const requestType: string | undefined = Form.useWatch("RequestType", form);
  const requestDate = Form.useWatch("RequestDate", form);
  const readOnly = Boolean(editing && editing.Status !== "Pending");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.post("/api/stock/material-requests/get", {})).data.requests); }
    catch (err) { reportFormError(err, { fallback: "Could not load material requests" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Warehouses for the request (a warehouse login gets only its own, so it is picked for it).
  useEffect(() => { axios.post("/api/stock/material-requests/warehouses", {}).then(({ data }) => setWarehouses(data.warehouses)).catch(() => undefined); }, []);
  const ownWarehouse = warehouses.length === 1 && user?.Role === "WAREHOUSE" && !headOffice ? warehouses[0].WarehouseId : null;

  // The item list follows the request type: product items or spare parts.
  const loadItems = useCallback(async (type?: string) => {
    setItems([]);
    if (!type) return;
    setItemsLoading(true);
    try { setItems((await axios.post("/api/stock/material-requests/items", { type })).data.items); }
    catch (err) { reportFormError(err, { fallback: "Could not load items" }); }
    finally { setItemsLoading(false); }
  }, []);

  const openForm = async (row?: any) => {
    form.resetFields();
    setEditing(row || null);
    setFocusKey(undefined);
    if (!row) {
      form.setFieldsValue({ RequestType: "Spare", WarehouseId: ownWarehouse || undefined, RequestDate: dayjs(), Priority: "Normal" });
      setLines([newLine()]);
      setDrawerOpen(true);
      loadItems("Spare");
      return;
    }
    try {
      const { data } = await axios.post("/api/stock/material-requests/get", { MaterialRequestId: row.MaterialRequestId });
      const r = data.request;
      setEditing(r);
      form.setFieldsValue({ RequestType: r.RequestType, WarehouseId: r.WarehouseId || undefined, RequestDate: dayjs(r.RequestDate), RequiredBy: r.RequiredBy ? dayjs(r.RequiredBy) : undefined, Priority: r.Priority, Remarks: r.Remarks || undefined });
      setLines(data.items.map((i: any) => ({ key: `l${++lineSeq}`, ItemKey: `${i.ItemSource}|${i.ItemSource === "ERP" ? i.ErpItmId : i.SpareId}`.toUpperCase(), Qty: Number(i.Qty), Remarks: i.Remarks || undefined, _name: i.ItemName, _code: i.ItemCode })));
      setDrawerOpen(true);
      loadItems(r.RequestType);
    } catch (err) {
      reportFormError(err, { fallback: "Could not open the material request" });
    }
  };

  const changeType = (type: string) => {
    if (lines.some((l) => l.ItemKey)) message.info("Item lines cleared — the item list changed with the request type");
    setLines([newLine()]);
    loadItems(type);
  };

  const itemByKey = useMemo(() => new Map(items.map((i) => [i.key.toUpperCase(), i])), [items]);
  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => { const l = newLine(); setLines((ls) => [...ls, l]); setFocusKey(l.key); };
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [newLine()]));

  // Grouped options; an item already on another line is disabled so it is requested once.
  const optionsFor = (line: Line) => {
    const taken = new Set(lines.filter((l) => l.key !== line.key && l.ItemKey).map((l) => l.ItemKey!.toUpperCase()));
    const groups = new Map<string, any[]>();
    items.forEach((i) => {
      if (!groups.has(i.group)) groups.set(i.group, []);
      groups.get(i.group)!.push({ value: i.key.toUpperCase(), label: itemLabel(i), disabled: taken.has(i.key.toUpperCase()) });
    });
    // Keep a saved line readable even if the item is no longer in the list.
    const saved = line as any;
    if (line.ItemKey && !itemByKey.has(line.ItemKey.toUpperCase()) && saved._name) groups.set("On this request", [{ value: line.ItemKey.toUpperCase(), label: itemLabel({ code: saved._code, name: saved._name }) }]);
    return Array.from(groups.entries()).map(([label, options]) => ({ label, options }));
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const filled = lines.filter((l) => l.ItemKey);
      if (!filled.length) { message.error("Add at least one item"); return; }
      const missingQty = filled.findIndex((l) => !(Number(l.Qty) > 0));
      if (missingQty >= 0) { message.error(`Enter the quantity on line ${lines.indexOf(filled[missingQty]) + 1}`); return; }
      setSaving(true);
      const { data } = await axios.post("/api/stock/material-requests/save", {
        MaterialRequestId: editing?.MaterialRequestId,
        RequestType: values.RequestType,
        WarehouseId: values.WarehouseId,
        RequestDate: values.RequestDate.format("YYYY-MM-DD"),
        RequiredBy: values.RequiredBy ? values.RequiredBy.format("YYYY-MM-DD") : null,
        Priority: values.Priority,
        Remarks: values.Remarks,
        lines: filled.map((l) => ({ ItemKey: l.ItemKey, Qty: l.Qty, Remarks: l.Remarks || null })),
      });
      message.success(`Material request ${data.request?.RequestNo || ""} ${editing ? "updated" : "saved"}`.replace("  ", " "));
      setDrawerOpen(false);
      load();
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save material request" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (!q || [r.RequestNo, r.RequestForName, r.Remarks, r.RequestedBy].some((v) => v?.toLowerCase().includes(q)))
      && (!statusFilter || r.Status === statusFilter) && (!typeFilter || r.RequestType === typeFilter);
  });

  const columns = [
    { title: "Request no.", dataIndex: "RequestNo", key: "no", width: 150, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Date", dataIndex: "RequestDate", key: "date", width: 110, render: (v: string) => formatDate(v) },
    { title: "Type", dataIndex: "RequestType", key: "type", width: 120, render: (v: string) => REQUEST_TYPES.find((t) => t.value === v)?.label || v },
    { title: "Warehouse", dataIndex: "RequestForName", key: "sc", render: (v: string) => v || "—" },
    { title: "Required by", dataIndex: "RequiredBy", key: "req", width: 115, render: (v: string) => (v ? formatDate(v) : "—") },
    { title: "Priority", dataIndex: "Priority", key: "priority", width: 95, render: (v: string) => <Tag color={PRIORITY_COLOR[v]}>{v}</Tag> },
    { title: "Items", key: "items", width: 90, align: "right" as const, render: (_: any, r: any) => <Tooltip title={`Total quantity ${Number(r.TotalQty)}`}><span>{r.ItemCount}</span></Tooltip> },
    { title: "Requested by", dataIndex: "RequestedBy", key: "by", render: (v: string) => v?.trim() || "—" },
    { title: "Status", dataIndex: "Status", key: "status", width: 100, render: (v: string) => <Tag color={STATUS_COLOR[v] || "default"}>{v}</Tag> },
    { title: "Actions", key: "actions", width: 90, render: (_: any, r: any) => (
      <div className="flex gap-1">
        <Tooltip title={r.Status === "Pending" ? "Edit" : "View"}><Button type="text" size="small" icon={r.Status === "Pending" ? <EditOutlined /> : <EyeOutlined />} onClick={() => openForm(r)} /></Tooltip>
        {r.Status === "Pending" && <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(r)} /></Tooltip>}
      </div>
    ) },
  ];

  const warehouseOptions = warehouses.filter((w: any) => w.IsActive || w.WarehouseId === editing?.WarehouseId).map((w: any) => ({ value: w.WarehouseId, label: `${w.WarehouseName} (${w.WarehouseCode})` }));
  const typeHint = REQUEST_TYPES.find((t) => t.value === requestType)?.hint;

  return (
    <div className="space-y-4">
      <PageHeader icon={<ShoppingCartOutlined />} title="Material Request" subtitle="Product items or spare parts requested for a warehouse · items come from the iERP and the Spares master"
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">New Material Request</Button>
        </>} />

      <StatStrip items={[
        { label: "Requests", value: rows.length },
        { label: "Pending", value: rows.filter((r) => r.Status === "Pending").length, tone: "warn" },
        { label: "Urgent / high (pending)", value: rows.filter((r) => r.Status === "Pending" && (r.Priority === "Urgent" || r.Priority === "High")).length, tone: "danger" },
        { label: "Spare parts", value: rows.filter((r) => r.RequestType === "Spare").length },
        { label: "Product items", value: rows.filter((r) => r.RequestType === "Product").length },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search request no., warehouse, remarks..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select allowClear placeholder="Type: All" value={typeFilter} onChange={setTypeFilter} options={REQUEST_TYPES.map((t) => ({ value: t.value, label: t.label }))} className="w-44" />
        <Select allowClear placeholder="Status: All" value={statusFilter} onChange={setStatusFilter} options={Object.keys(STATUS_COLOR).map((s) => ({ value: s, label: s }))} className="w-36" />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="MaterialRequestId" size="middle" loading={loading} scroll={{ x: 1250 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: "No material requests yet" }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<ShoppingCartOutlined />} title={editing ? `${readOnly ? "View" : "Edit"} — ${editing.RequestNo}` : "New Material Request"} subtitle="Product items or spare parts needed at the warehouse"
          meta={<DrawerChip label={editing ? editing.Status : "New"} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>{readOnly ? "Close" : "Cancel"}</Button>{!readOnly && <Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update" : "Save"}</Button>}</div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form" disabled={readOnly}>
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Choose the request type first — the item list follows it.</p>
          <FormSection number="01" title="Request details" description="What kind of material, for which warehouse, and by when.">
            <div className="form-grid form-grid-three">
              <Form.Item name="RequestType" label={fieldLabel("Request type")} extra={typeHint} rules={[{ required: true, message: "Select the request type" }]}>
                <Select options={REQUEST_TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={changeType} />
              </Form.Item>
              <Form.Item name="WarehouseId" label={fieldLabel("Warehouse")} extra={editing && !editing.WarehouseId && editing.ServiceCenterName ? `Raised for ${editing.ServiceCenterName} — pick the warehouse` : undefined} rules={[{ required: true, message: "Select the warehouse" }]}>
                <Select showSearch optionFilterProp="label" placeholder="Select warehouse" options={warehouseOptions} disabled={readOnly || Boolean(ownWarehouse)} notFoundContent="No warehouses — add one in Configuration → Service Centers / Warehouses" />
              </Form.Item>
              <Form.Item name="Priority" label={fieldLabel("Priority")} rules={[{ required: true, message: "Select the priority" }]}>
                <Select options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
              </Form.Item>
              <Form.Item name="RequestDate" label={fieldLabel("Request date")} rules={[{ required: true, message: "Request date is required" }]}>
                <SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} />
              </Form.Item>
              <Form.Item name="RequiredBy" label={fieldLabel("Required by")} dependencies={["RequestDate"]}
                rules={[({ getFieldValue }) => ({ validator: (_, v) => (!v || !getFieldValue("RequestDate") || !v.isBefore(getFieldValue("RequestDate"), "day") ? Promise.resolve() : Promise.reject(new Error("Cannot be before the request date"))) })]}>
                <SmartDatePicker disabledDate={(d) => Boolean(requestDate) && d.isBefore(requestDate, "day")} />
              </Form.Item>
              <div className="entry-field-wide"><Form.Item name="Remarks" label={fieldLabel("Remarks")} rules={[{ max: 500 }]}><Input.TextArea rows={2} maxLength={500} placeholder="Purpose, reference or delivery note" /></Form.Item></div>
            </div>
          </FormSection>
        </Form>

        {/* Items requested — one row per item; Tab on the last row's remarks adds another row. */}
        <section className="mt-4 rounded-xl border border-orange-200 bg-white overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-orange-50/70 border-b border-orange-100">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-500 text-lg"><CodeSandboxOutlined /></span>
              <div><div className="text-sm font-bold text-slate-800">Items requested</div><div className="text-xs text-slate-500">What is needed, and how much</div></div>
            </div>
            {!readOnly && <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600">Tab</kbd> on the last row adds another
              <Button size="small" icon={<PlusOutlined />} onClick={addLine} disabled={!requestType}>Add item</Button>
            </div>}
          </div>
          <div className="p-3 overflow-x-auto">
            <div className="min-w-[760px] rounded-lg border border-slate-200">
              <div className="grid grid-cols-[minmax(0,1fr)_130px_240px_44px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Item</span><span className="text-right">Quantity</span><span>Remarks</span><span />
              </div>
              {lines.map((l, index) => {
                const item = l.ItemKey ? itemByKey.get(l.ItemKey.toUpperCase()) : undefined;
                const last = index === lines.length - 1;
                return (
                  <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_130px_240px_44px] items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0">
                    <Select showSearch allowClear optionFilterProp="label" autoFocus={l.key === focusKey} disabled={readOnly || !requestType} loading={itemsLoading}
                      placeholder={requestType ? (itemsLoading ? "Loading items…" : "Search item") : "Select the request type first"} value={l.ItemKey} options={optionsFor(l)}
                      notFoundContent={itemsLoading ? "Loading…" : "No items"} onChange={(v) => updateLine(l.key, { ItemKey: v, Qty: v && !l.Qty ? 1 : l.Qty })} />
                    <InputNumber className="w-full" min={0} precision={3} placeholder="0" value={l.Qty} disabled={readOnly} onChange={(v) => updateLine(l.key, { Qty: v ?? undefined })}
                      addonAfter={item?.uom || undefined} />
                    <Input placeholder="Optional note for this item" maxLength={250} value={l.Remarks} disabled={readOnly} onChange={(e) => updateLine(l.key, { Remarks: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey && last && !readOnly && requestType) { e.preventDefault(); addLine(); } }} />
                    {!readOnly ? <Tooltip title="Remove line"><Button danger size="small" icon={<DeleteOutlined />} onClick={() => removeLine(l.key)} /></Tooltip> : <span />}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </Drawer>

      <ConfirmModal open={!!deleting} title="Delete Material Request" description={`Delete material request ${deleting?.RequestNo}?`} warningText="Only pending requests can be deleted." onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try { await axios.post("/api/stock/material-requests/delete", { MaterialRequestId: deleting.MaterialRequestId }); message.success("Material request deleted"); setDeleting(null); load(); }
          catch (err) { reportFormError(err, { fallback: "Could not delete material request" }); }
        }} />
    </div>
  );
}
