"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button, Drawer, Empty, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Tooltip, message } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SettingOutlined } from "@ant-design/icons";
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
  const url = `/api/masters/config/${params.resource}`;
  const needsUsers = config?.fields.some((f) => f.kind === "user");

  const load = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    try { setRows((await axios.get(url)).data.rows); }
    catch (err) { reportFormError(err, { fallback: `Could not load ${config.title}` }); }
    finally { setLoading(false); }
  }, [config, url]);

  useEffect(() => { load(); if (needsUsers) fetchUsers({ activeOnly: true }).catch(() => undefined); }, [load, needsUsers, fetchUsers]);

  if (!config) return <Empty className="mt-20" description="Unknown configuration page" />;

  const display = (field: Field, value: any) => {
    if (value === null || value === undefined || value === "") return "-";
    if (field.kind === "boolean") return value ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>;
    if (field.kind === "money") return `₹ ${inr(value, 2)}`;
    if (field.kind === "percent") return `${Number(value)} %`;
    if (field.kind === "date") return formatDate(value);
    if (field.kind === "state") return states.find((s) => s.StateId === value)?.StateName || "-";
    if (field.kind === "user") { const u = users.find((x) => x.UserId === value); return u ? `${u.FirstName} ${u.LastName || ""}` : "-"; }
    return String(value);
  };

  const input = (field: Field) => {
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

  const filtered = rows.filter((r) => !search || config.fields.some((f) => String(r[f.name] ?? "").toLowerCase().includes(search.toLowerCase())));
  const columns = [
    ...config.fields.filter((f) => f.kind !== "text").map((f) => ({ title: f.label, dataIndex: f.name, key: f.name, align: (f.kind === "money" || f.kind === "number" || f.kind === "percent" ? "right" : "left") as "right" | "left",
      render: (v: any) => f.name === config.display ? <b className="text-slate-800">{display(f, v)}</b> : display(f, v) })),
    { title: "Actions", key: "actions", width: 90, render: (_: any, row: any) => (
      <Space size="small">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(row)} /></Tooltip>
        <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(row)} /></Tooltip>
      </Space>
    ) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<SettingOutlined />} title={config.title} subtitle={config.description}
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">Add</Button>
        </>} />
      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder={`Search ${config.title.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
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
          <FormSection number="01" title="Details" description={config.title}>
            <div className="form-grid form-grid-two">
              {config.fields.map((f) => (
                <div key={f.name} className={f.kind === "text" ? "entry-field-wide" : ""}>
                  <Form.Item name={f.name} label={fieldLabel(f.label)} valuePropName={f.kind === "boolean" ? "checked" : "value"} rules={f.required ? [{ required: true, message: `${f.label} is required` }] : []}>{input(f)}</Form.Item>
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
