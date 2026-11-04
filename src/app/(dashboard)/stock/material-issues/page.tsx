"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import { Button, Drawer, Form, Input, InputNumber, Select, Table, Tooltip, message } from "antd";
import { CodeSandboxOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, ExportOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { FormSection } from "@/components/common/FormSection";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

interface StockItem { key: string; ItemCode: string | null; ItemName: string; Uom: string | null; Rate: number; Available: number }
interface Line { key: string; ItemKey?: string; Qty?: number; Remarks?: string }
let lineSeq = 0;
const newLine = (): Line => ({ key: `l${++lineSeq}` });
const qty = (n: unknown) => Number(Number(n || 0).toFixed(3));

/** Spares Stock → Material Issue: material issued out of a warehouse's stock (only items in stock, up to the quantity available). */
export default function MaterialIssuePage() {
  const [form] = Form.useForm();
  const user = useAuthStore((s) => s.user);
  const headOffice = Boolean(user?.IsAdmin) || user?.Role === "SUPER" || user?.Role === "HO";
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [focusKey, setFocusKey] = useState<string>();
  const warehouseId: string | undefined = Form.useWatch("WarehouseId", form);
  const readOnly = Boolean(viewing);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.post("/api/stock/material-issues/get", {})).data.issues); }
    catch (err) { reportFormError(err, { fallback: "Could not load material issues" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { axios.post("/api/stock/material-issues/stock", {}).then(({ data }) => setWarehouses(data.warehouses)).catch(() => undefined); }, []);
  const ownWarehouse = warehouses.length === 1 && !headOffice ? warehouses[0].WarehouseId : null;

  // The item list is the stock of the chosen warehouse.
  const loadStock = useCallback(async (wh?: string) => {
    setStock([]);
    if (!wh) return;
    setStockLoading(true);
    try { setStock((await axios.post("/api/stock/material-issues/stock", { WarehouseId: wh })).data.items); }
    catch (err) { reportFormError(err, { fallback: "Could not load the warehouse stock" }); }
    finally { setStockLoading(false); }
  }, []);

  const openNew = () => {
    setViewing(null);
    form.resetFields();
    const wh = ownWarehouse || (warehouses.length === 1 ? warehouses[0].WarehouseId : undefined);
    form.setFieldsValue({ IssueDate: dayjs(), WarehouseId: wh });
    setLines([newLine()]);
    setFocusKey(undefined);
    setDrawerOpen(true);
    loadStock(wh);
  };

  const openView = async (row: any) => {
    try {
      const { data } = await axios.post("/api/stock/material-issues/get", { MaterialIssueId: row.MaterialIssueId });
      setViewing({ ...data.issue, items: data.items });
      form.resetFields();
      form.setFieldsValue({ IssueDate: dayjs(data.issue.IssueDate), WarehouseId: data.issue.WarehouseId, Purpose: data.issue.Purpose, Remarks: data.issue.Remarks || undefined });
      setDrawerOpen(true);
    } catch (err) {
      reportFormError(err, { fallback: "Could not open the material issue" });
    }
  };

  const changeWarehouse = (wh: string) => {
    if (lines.some((l) => l.ItemKey)) message.info("Item lines cleared — the item list follows the warehouse");
    setLines([newLine()]);
    loadStock(wh);
  };

  const stockByKey = useMemo(() => new Map(stock.map((s) => [s.key, s])), [stock]);
  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => { const l = newLine(); setLines((ls) => [...ls, l]); setFocusKey(l.key); };
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [newLine()]));
  const over = (l: Line) => { const s = l.ItemKey ? stockByKey.get(l.ItemKey) : undefined; return Boolean(s && Number(l.Qty || 0) > s.Available); };
  const optionsFor = (line: Line) => {
    const taken = new Set(lines.filter((l) => l.key !== line.key && l.ItemKey).map((l) => l.ItemKey!));
    return stock.map((s) => ({ value: s.key, label: `${s.ItemCode ? `${s.ItemCode} — ` : ""}${s.ItemName} · in stock ${qty(s.Available)}${s.Uom ? ` ${s.Uom}` : ""}`, disabled: taken.has(s.key) }));
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const filled = lines.filter((l) => l.ItemKey);
      if (!filled.length) { message.error("Add at least one item"); return; }
      const noQty = filled.find((l) => !(Number(l.Qty) > 0));
      if (noQty) { message.error(`Enter the quantity on line ${lines.indexOf(noQty) + 1}`); return; }
      const tooMuch = filled.find(over);
      if (tooMuch) { const s = stockByKey.get(tooMuch.ItemKey!)!; message.error(`${s.ItemName}: only ${qty(s.Available)} in stock`); return; }
      setSaving(true);
      const { data } = await axios.post("/api/stock/material-issues/save", {
        IssueDate: values.IssueDate.format("YYYY-MM-DD"), WarehouseId: values.WarehouseId, Purpose: values.Purpose, Remarks: values.Remarks,
        lines: filled.map((l) => ({ ItemKey: l.ItemKey, Qty: l.Qty, Remarks: l.Remarks || null })),
      });
      message.success(`Material issue ${data.issue.issueNo} saved — ${qty(data.issue.qty)} issued`);
      setDrawerOpen(false);
      load();
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save the material issue" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (!warehouseFilter || r.WarehouseId === warehouseFilter) && (!q || [r.IssueNo, r.Purpose, r.WarehouseName, r.IssuedBy, r.Remarks].some((v) => v?.toLowerCase().includes(q)));
  });
  const canDelete = (r: any) => headOffice || String(r.InsertedByUserId || "").toLowerCase() === String(user?.UserId || "").toLowerCase();

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map((r) => ({ "Issue No": r.IssueNo, Date: formatDate(r.IssueDate), Warehouse: r.WarehouseName, Purpose: r.Purpose, Items: Number(r.ItemCount), "Total qty": qty(r.TotalQty), "Value (₹)": Number(Number(r.TotalValue).toFixed(2)), "Issued by": r.IssuedBy?.trim() || "", Remarks: r.Remarks || "" })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material issues");
    XLSX.writeFile(wb, `Material_issues_${dayjs().format("YYYY-MM-DD")}.xlsx`);
  };

  const columns = [
    { title: "Issue no.", dataIndex: "IssueNo", key: "no", width: 140, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Date", dataIndex: "IssueDate", key: "date", width: 110, render: (v: string) => formatDate(v) },
    { title: "Warehouse", dataIndex: "WarehouseName", key: "wh", render: (v: string, r: any) => <div><b className="text-slate-800">{v}</b><div className="text-[11px] font-mono text-slate-400">{r.WarehouseCode}</div></div> },
    { title: "Purpose", dataIndex: "Purpose", key: "p", render: (v: string) => <span className="text-sm">{v}</span> },
    { title: "Items", dataIndex: "ItemCount", key: "i", width: 75, align: "right" as const },
    { title: "Qty issued", dataIndex: "TotalQty", key: "q", width: 110, align: "right" as const, render: (v: number) => <b>{qty(v)}</b> },
    { title: "Value ₹", dataIndex: "TotalValue", key: "v", width: 120, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Issued by", dataIndex: "IssuedBy", key: "by", render: (v: string) => v?.trim() || "—" },
    { title: "Actions", key: "a", width: 90, render: (_: any, r: any) => (
      <div className="flex gap-1">
        <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openView(r)} /></Tooltip>
        {canDelete(r) && <Tooltip title="Delete (stock goes back to the warehouse)"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(r)} /></Tooltip>}
      </div>
    ) },
  ];

  const warehouseOptions = warehouses.filter((w) => w.IsActive || w.WarehouseId === viewing?.WarehouseId).map((w) => ({ value: w.WarehouseId, label: `${w.WarehouseName} (${w.WarehouseCode})` }));
  const viewLines: any[] = viewing?.items || [];
  const totalNow = lines.reduce((s, l) => s + (Number(l.Qty) || 0) * (stockByKey.get(l.ItemKey || "")?.Rate || 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader icon={<ExportOutlined />} title="Material Issue" subtitle="Material issued out of a warehouse's stock · only items in stock can be issued, up to the quantity available"
        actions={<>
          <Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={!filtered.length}>Export Excel</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          {warehouses.length > 0 && <Button type="primary" icon={<PlusOutlined />} onClick={openNew} className="bg-blue-600 shadow-sm">New Material Issue</Button>}
        </>} />

      <StatStrip items={[
        { label: "Issues", value: rows.length },
        { label: "Qty issued", value: qty(rows.reduce((s, r) => s + Number(r.TotalQty || 0), 0)) },
        { label: "Value issued ₹", value: inr(rows.reduce((s, r) => s + Number(r.TotalValue || 0), 0)) },
        { label: "This month", value: rows.filter((r) => dayjs(r.IssueDate).isSame(dayjs(), "month")).length, tone: "ok" },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search issue no., purpose, warehouse..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        {warehouses.length > 1 && <Select allowClear showSearch optionFilterProp="label" placeholder="Warehouse: All" value={warehouseFilter} onChange={setWarehouseFilter} options={warehouses.map((w) => ({ value: w.WarehouseId, label: w.WarehouseName }))} className="w-56" />}
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="MaterialIssueId" size="middle" loading={loading} scroll={{ x: 1150 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: "No material issues yet" }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<ExportOutlined />} title={viewing ? `View — ${viewing.IssueNo}` : "New Material Issue"} subtitle="Material issued out of the warehouse's stock"
          meta={<DrawerChip label={viewing ? "Issued" : "New"} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>{readOnly ? "Close" : "Cancel"}</Button>{!readOnly && <Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">Save</Button>}</div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form" disabled={readOnly}>
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Only items in stock at the warehouse can be issued.</p>
          <FormSection number="01" title="Issue details" description="When, from which warehouse, and why.">
            <div className="form-grid form-grid-three">
              <Form.Item name="IssueDate" label={fieldLabel("Issue date")} rules={[{ required: true, message: "Issue date is required" }]}>
                <SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} />
              </Form.Item>
              <Form.Item name="WarehouseId" label={fieldLabel("Warehouse")} rules={[{ required: true, message: "Select the warehouse" }]}>
                <Select showSearch optionFilterProp="label" placeholder="Select warehouse" options={warehouseOptions} disabled={readOnly || Boolean(ownWarehouse)} onChange={changeWarehouse} />
              </Form.Item>
              <Form.Item name="Purpose" label={fieldLabel("Purpose")} rules={[{ required: true, whitespace: true, message: "Purpose is required" }, { max: 200 }]}>
                <Input placeholder="e.g. Issued to service center for repair" maxLength={200} />
              </Form.Item>
            </div>
          </FormSection>

          {/* Items issued — in-stock items only; Tab on the last row's remarks adds another row. */}
          <section className="mb-5 rounded-xl border border-orange-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-orange-50/70 border-b border-orange-100">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-500 text-lg"><CodeSandboxOutlined /></span>
                <div><div className="text-sm font-bold text-slate-800">Items issued</div><div className="text-xs text-slate-500">{readOnly ? `${viewLines.length} item${viewLines.length === 1 ? "" : "s"}` : warehouseId ? (stockLoading ? "Loading the warehouse stock…" : `${stock.length} item${stock.length === 1 ? "" : "s"} in stock at this warehouse`) : "Select the warehouse first"}</div></div>
              </div>
              {!readOnly && <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600">Tab</kbd> on the last row adds another
                <Button size="small" icon={<PlusOutlined />} onClick={addLine} disabled={!warehouseId}>Add item</Button>
              </div>}
            </div>
            <div className="p-3 overflow-x-auto">
              {readOnly ? (
                <Table size="small" rowKey="MaterialIssueItemLnId" dataSource={viewLines} pagination={false} columns={[
                  { title: "#", dataIndex: "LineNo", width: 44 },
                  { title: "Item", key: "item", render: (_: any, l: any) => <div><div className="font-semibold text-slate-800">{l.ItemName}</div>{l.ItemCode && <div className="text-[11px] font-mono text-slate-400">{l.ItemCode}</div>}</div> },
                  { title: "Quantity", key: "q", width: 120, align: "right" as const, render: (_: any, l: any) => <b>{qty(l.Qty)}{l.Uom ? ` ${l.Uom}` : ""}</b> },
                  { title: "Value ₹", key: "v", width: 120, align: "right" as const, render: (_: any, l: any) => inr(Number(l.Qty) * Number(l.Rate), 2) },
                  { title: "Remarks", dataIndex: "Remarks", render: (v: string) => v || <span className="text-slate-300">—</span> },
                ]} />
              ) : (
                <div className="min-w-[760px] rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[minmax(0,1fr)_110px_140px_220px_44px] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <span>Item</span><span className="text-right">In stock</span><span className="text-right">Quantity</span><span>Remarks</span><span />
                  </div>
                  {lines.map((l, index) => {
                    const s = l.ItemKey ? stockByKey.get(l.ItemKey) : undefined;
                    const last = index === lines.length - 1;
                    return (
                      <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_110px_140px_220px_44px] items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-b-0">
                        <Select showSearch allowClear optionFilterProp="label" autoFocus={l.key === focusKey} disabled={!warehouseId} loading={stockLoading} value={l.ItemKey} options={optionsFor(l)}
                          placeholder={warehouseId ? (stockLoading ? "Loading stock…" : "Search item in stock") : "Select the warehouse first"} notFoundContent={stockLoading ? "Loading…" : "Nothing in stock at this warehouse"}
                          onChange={(v) => updateLine(l.key, { ItemKey: v, Qty: v && !l.Qty ? 1 : l.Qty })} />
                        <span className="text-right text-sm text-slate-600">{s ? <>{qty(s.Available)}<span className="ml-1 text-[11px] text-slate-400">{s.Uom || ""}</span></> : <span className="text-slate-300">—</span>}</span>
                        <InputNumber className="w-full" min={0} max={s?.Available} precision={3} placeholder="0" value={l.Qty} status={over(l) ? "error" : undefined} onChange={(v) => updateLine(l.key, { Qty: v ?? undefined })} />
                        <Input placeholder="Optional note for this item" maxLength={250} value={l.Remarks} onChange={(e) => updateLine(l.key, { Remarks: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Tab" && !e.shiftKey && last && warehouseId) { e.preventDefault(); addLine(); } }} />
                        <Tooltip title="Remove line"><Button danger size="small" icon={<DeleteOutlined />} onClick={() => removeLine(l.key)} /></Tooltip>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-end gap-3 px-3 py-2.5 bg-slate-50 border-t border-slate-200 text-sm"><span className="text-slate-500">Value issued</span><b className="text-slate-900">₹{inr(totalNow, 2)}</b></div>
                </div>
              )}
            </div>
          </section>

          <FormSection number="02" title="Remarks" description="Anything else about this issue.">
            <Form.Item name="Remarks" rules={[{ max: 500 }]}><Input.TextArea rows={3} maxLength={500} showCount placeholder="Who collected it, reference no., condition…" /></Form.Item>
          </FormSection>
        </Form>
      </Drawer>

      <ConfirmModal open={!!deleting} title="Delete Material Issue" description={`Delete material issue ${deleting?.IssueNo}?`} warningText="Its quantities go back into the warehouse stock." onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try { await axios.post("/api/stock/material-issues/delete", { MaterialIssueId: deleting.MaterialIssueId }); message.success("Material issue deleted"); setDeleting(null); load(); }
          catch (err) { reportFormError(err, { fallback: "Could not delete the material issue" }); }
        }} />
    </div>
  );
}
