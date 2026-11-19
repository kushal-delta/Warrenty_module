"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Empty, Form, Input, InputNumber, Segmented, Select, Space, Switch, Table, Tag, Tooltip, message } from "antd";
import { AppstoreOutlined, CheckCircleFilled, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SettingOutlined, ToolOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import { masterConfigs, type Field } from "@/lib/config/masters";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useUserStore } from "@/lib/store/useUserStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { FormSection } from "@/components/common/FormSection";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { PageHeader, TABLE_CARD, fieldLabel, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { ExportExcelButton } from "@/components/common/ReportTools";
import { TextListSelect } from "@/components/common/TextListSelect";
import { exportTable, type ExcelColumn } from "@/lib/utils/excelExport";

/** Two big choice cards (Spare / Product) used as a Form.Item control. */
function ItemTypePicker({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const options = [
    { key: "SPARE", title: "Spare part", text: "Parts used in repairs and service calls", icon: <ToolOutlined />, color: "#2563eb", bg: "#eff6ff" },
    { key: "PRODUCT", title: "Product", text: "Sellable items such as pumps, motors and controllers", icon: <AppstoreOutlined />, color: "#7c3aed", bg: "#f5f3ff" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Item type">
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => onChange?.(o.key)}
            className="flex items-center gap-3 rounded-xl border p-4 text-left transition-all hover:shadow-sm"
            style={{ borderColor: on ? o.color : "#e2e8f0", background: on ? o.bg : "#fff", boxShadow: on ? `0 0 0 1px ${o.color}` : undefined }}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: on ? "#fff" : o.bg, color: o.color }}>{o.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">{o.title}</span>
              <span className="block text-xs text-slate-500">{o.text}</span>
            </span>
            {on && <CheckCircleFilled className="text-lg" style={{ color: o.color }} />}
          </button>
        );
      })}
    </div>
  );
}

/** One generic list + entry drawer for every master defined in lib/config/masters.ts. */
export default function ConfigMasterPage({ params }: { params: { resource: string } }) {
  const config = masterConfigs[params.resource];
  const [form] = Form.useForm();
  const { states, fetchBootstrap } = useMasterStore();
  const { users, fetchUsers } = useUserStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  /** Masters with an Item Type field (Spares & Products) hold spares and products in one list. */
  const hasType = Boolean(config?.fields.some((f) => f.kind === "itemType"));
  const [typeFilter, setTypeFilter] = useState<"ALL" | "SPARE" | "PRODUCT">("ALL");
  const itemType = Form.useWatch("ItemType", form) as "SPARE" | "PRODUCT" | undefined;
  const isProduct = hasType && itemType === "PRODUCT";
  const labelOf = (f: Field) => (isProduct && f.productLabel) || f.label;
  /** Table headers follow the list filter: Spare … / Product … / Item … when both kinds are shown. */
  const headerOf = (f: Field) => (!hasType || !f.productLabel || typeFilter === "SPARE" ? f.label : typeFilter === "PRODUCT" ? f.productLabel : f.productLabel.replace("Product", "Item"));
  const url = `/api/masters/config/${params.resource}`;
  const needsUsers = config?.fields.some((f) => f.kind === "user");
  /** Dropdown values of fields backed by Configuration → Text Lists (Unit / Category), per list group. */
  const [listValues, setListValues] = useState<Record<string, string[]>>({});
  const needsLists = Boolean(config?.fields.some((f) => f.textList));
  const loadLists = useCallback(async () => {
    try {
      const values: any[] = (await axios.post("/api/masters/text-lists/get", {})).data.values;
      const next: Record<string, string[]> = {};
      values.filter((v) => v.IsActive).forEach((v) => { (next[v.ListGroup] ||= []).push(v.Value); });
      setListValues(next);
    } catch { /* dropdown just stays empty */ }
  }, []);

  const load = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try { setRows((await axios.get(url)).data.rows); }
    catch (err) { reportFormError(err, { fallback: `Could not load ${config.title}` }); }
    finally { setLoading(false); }
  }, [config, url]);

  useEffect(() => { if (needsLists) loadLists(); }, [needsLists, loadLists]);
  useEffect(() => { load(); if (needsUsers) fetchUsers({ activeOnly: true }).catch(() => undefined); }, [load, needsUsers, fetchUsers]);

  if (!config) return <Empty className="mt-20" description="Unknown configuration page" />;

  const display = (field: Field, value: any) => {
    if (value === null || value === undefined || value === "") return "-";
    if (field.kind === "itemType") return value === "PRODUCT" ? <Tag color="purple" className="m-0">Product</Tag> : <Tag color="blue" className="m-0">Spare</Tag>;
    if (field.kind === "boolean") return value ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>;
    if (field.kind === "money") return `₹ ${inr(value, 2)}`;
    if (field.kind === "percent") return `${Number(value)} %`;
    if (field.kind === "date") return formatDate(value);
    if (field.kind === "state") return states.find((s) => s.StateId === value)?.StateName || "-";
    if (field.kind === "user") { const u = users.find((x) => x.UserId === value); return u ? `${u.FirstName} ${u.LastName || ""}` : "-"; }
    return String(value);
  };

  const input = (field: Field) => {
    if (field.textList) {
      const { group, noun } = field.textList, current = editing?.[field.name];
      const options = Array.from(new Set([...(listValues[group] || []), ...(current ? [String(current)] : [])]));
      return <TextListSelect group={group} noun={noun} options={options} onAdded={() => loadLists()} />;
    }
    switch (field.kind) {
      case "boolean": return <Switch />;
      case "number": return <InputNumber min={0} precision={0} className="w-full" />;
      case "money": return <InputNumber min={0} precision={2} className="w-full" prefix="₹" />;
      case "percent": return <InputNumber min={0} max={100} precision={2} className="w-full" suffix="%" />;
      case "date": return <SmartDatePicker />;
      case "state": return <Select allowClear showSearch optionFilterProp="label" placeholder="Select state" options={states.map((s) => ({ value: s.StateId, label: s.StateName }))} />;
      case "user": return <Select allowClear showSearch optionFilterProp="label" placeholder="Any user with the role" options={users.map((u) => ({ value: u.UserId, label: `${u.FirstName} ${u.LastName || ""} (${u.Role})` }))} />;
      case "text": return <Input.TextArea rows={2} maxLength={field.max} />;
      default: return <Input maxLength={field.max} />;
    }
  };

  const openForm = (row?: any) => {
    setEditing(row || null);
    form.resetFields();
    const values: any = {};
    config.fields.forEach((f) => {
      const v = row?.[f.name];
      if (f.kind === "itemType") { values[f.name] = v === "PRODUCT" ? "PRODUCT" : "SPARE"; return; }
      values[f.name] = f.kind === "date" ? (v ? dayjs(v) : undefined) : (f.kind === "money" || f.kind === "percent") && v != null ? Number(v) : v ?? (f.kind === "boolean" ? true : undefined);
    });
    form.setFieldsValue(values);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload: any = {};
      config.fields.forEach((f) => { const v = values[f.name]; payload[f.name] = f.kind === "date" ? (v ? v.toISOString() : null) : f.kind === "boolean" ? Boolean(v) : v ?? null; });
      if (editing) await axios.put(url, { ...payload, [config.id]: editing[config.id] });
      else await axios.post(url, payload);
      message.success(`${config.title} ${editing ? "updated" : "added"}`);
      setDrawerOpen(false);
      await load();
      fetchBootstrap();
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save record" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = rows.filter((r) => (!hasType || typeFilter === "ALL" || (r.ItemType || "SPARE") === typeFilter) && (!search || config.fields.some((f) => String(r[f.name] ?? "").toLowerCase().includes(search.toLowerCase()))));
  const columns = [
    ...config.fields.filter((f) => f.kind !== "text").map((f) => ({ title: headerOf(f), dataIndex: f.name, key: f.name, align: (f.kind === "money" || f.kind === "number" || f.kind === "percent" ? "right" : "left") as "right" | "left",
      render: (v: any) => f.kind === "itemType" ? display(f, v || "SPARE") : f.name === config.display ? <b className="text-slate-800">{display(f, v)}</b> : display(f, v) })),
    { title: "Actions", key: "actions", width: 90, render: (_: any, row: any) => (
      <Space size="small">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(row)} /></Tooltip>
        <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(row)} /></Tooltip>
      </Space>
    ) },
  ];

  const exportExcel = () => exportTable(config.title, config.fields.filter((f) => f.kind !== "text").map((f): ExcelColumn<any> => ({
    header: headerOf(f),
    type: f.kind === "money" ? "money" : f.kind === "number" ? "number" : f.kind === "percent" ? "percent" : f.kind === "date" ? "date" : "text",
    value: (r: any) => {
      const v = r[f.name];
      if (v === null || v === undefined || v === "") return null;
      if (f.kind === "boolean") return v ? "Yes" : "No";
      if (f.kind === "state") return states.find((s) => s.StateId === v)?.StateName || null;
      if (f.kind === "user") { const u = users.find((x) => x.UserId === v); return u ? `${u.FirstName} ${u.LastName || ""}`.trim() : null; }
      return v;
    },
  })), filtered, { Search: search || null });

  return (
    <div className="space-y-4">
      <PageHeader icon={<SettingOutlined />} title={config.title} subtitle={config.description}
        actions={<>
          <ExportExcelButton onExport={exportExcel} disabled={!filtered.length} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">Add</Button>
        </>} />
      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder={`Search ${config.title.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        {hasType && (
          <Segmented value={typeFilter} onChange={(v) => setTypeFilter(v as any)}
            options={[
              { value: "ALL", label: `All (${rows.length})` },
              { value: "SPARE", label: `Spares (${rows.filter((r) => (r.ItemType || "SPARE") === "SPARE").length})` },
              { value: "PRODUCT", label: `Products (${rows.filter((r) => r.ItemType === "PRODUCT").length})` },
            ]} />
        )}
      </div>
      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey={config.id} size="middle" loading={loading} scroll={{ x: 900 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<SettingOutlined />} title={editing ? `Edit — ${editing[config.display]}` : `Add ${config.title}`} subtitle={config.description} meta={<DrawerChip label={editing ? "Edit" : "New"} tone="solid" />} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update" : "Save"}</Button></div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields</p>
          {hasType && (
            <FormSection number="01" title="What are you adding?" description="Spares and products share one list, so both can be picked in every stock and job card item dropdown.">
              <Form.Item name="ItemType" className="!mb-4" rules={[{ required: true, message: "Choose spare or product" }]}>
                <ItemTypePicker />
              </Form.Item>
            </FormSection>
          )}
          <FormSection number={hasType ? "02" : "01"} title={hasType ? (isProduct ? "Product details" : "Spare details") : "Details"} description={hasType ? `${isProduct ? "Product" : "Spare"} code, unit, rate and stock level` : config.title}>
            <div className="form-grid form-grid-two">
              {config.fields.filter((f) => f.kind !== "itemType").map((f) => (
                <div key={f.name} className={f.kind === "text" ? "entry-field-wide" : ""}>
                  <Form.Item name={f.name} label={fieldLabel(labelOf(f))} valuePropName={f.kind === "boolean" ? "checked" : "value"} rules={f.required ? [{ required: true, message: `${labelOf(f)} is required` }] : []}>{input(f)}</Form.Item>
                </div>
              ))}
            </div>
          </FormSection>
        </Form>
      </Drawer>

      <ConfirmModal open={!!deleting} title={`Delete ${config.title}`} description={`Delete ${deleting?.[config.display]}?`} warningText="Records already used by job cards, calls or stock cannot be deleted — mark them inactive instead." onCancel={() => setDeleting(null)}
        onConfirm={async () => { try { await axios.delete(url, { params: { id: deleting[config.id] } }); message.success("Deleted"); setDeleting(null); await load(); fetchBootstrap(); } catch (err) { reportFormError(err, { fallback: "Could not delete record" }); } }} />
    </div>
  );
}
