"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Button, Drawer, Form, Input, InputNumber, Segmented, Space, Switch, Table, Tag, Tooltip, message } from "antd";
import { CheckCircleOutlined, EditOutlined, OrderedListOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, StopOutlined } from "@ant-design/icons";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { FormSection } from "@/components/common/FormSection";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

const LISTS = [
  { group: "ChallanPurpose", label: "Purpose", noun: "purpose", hint: "Purpose dropdown on the Delivery Challan" },
  { group: "PartyKind", label: "Party kind", noun: "party kind", hint: "Party kind dropdown on the Delivery Challan" },
  { group: "Transporter", label: "Transporter", noun: "transporter", hint: "Transporter dropdown on the Delivery Challan (iERP transporter ledgers are listed there too)" },
];

/** Configuration → Text Lists: the values behind the Delivery Challan dropdowns (purpose, party kind, transporter). */
export default function TextListsPage() {
  const [form] = Form.useForm();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [group, setGroup] = useState(LISTS[0].group);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const list = LISTS.find((l) => l.group === group)!;

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.post("/api/masters/text-lists/get", {})).data.values); }
    catch (err) { reportFormError(err, { fallback: "Could not load the text lists" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const inGroup = rows.filter((r) => r.ListGroup === group);
  const filtered = inGroup.filter((r) => !search || r.Value.toLowerCase().includes(search.toLowerCase()));

  const openForm = (row?: any) => {
    setEditing(row || null);
    form.resetFields();
    form.setFieldsValue(row ? { Value: row.Value, SortOrder: row.SortOrder, IsActive: row.IsActive } : { SortOrder: 100, IsActive: true });
    setDrawerOpen(true);
  };

  const save = (values: any, row?: any) => axios.post("/api/masters/text-lists/save", { ...values, ListGroup: row?.ListGroup || group, TextListId: row?.TextListId });

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await save(values, editing);
      message.success(`${values.Value} ${editing ? "updated" : "added"}`);
      setDrawerOpen(false);
      load();
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save the value" });
    } finally {
      setSaving(false);
    }
  };

  // Values are switched off rather than deleted — saved challans keep the text they were saved with.
  const toggleActive = async (row: any) => {
    setToggling(row.TextListId);
    try {
      await save({ Value: row.Value, SortOrder: row.SortOrder, IsActive: !row.IsActive }, row);
      message.success(`${row.Value} ${row.IsActive ? "switched off" : "switched on"}`);
      load();
    } catch (err) {
      reportFormError(err, { fallback: "Could not change the status" });
    } finally {
      setToggling(null);
    }
  };

  const columns = [
    { title: "Order", dataIndex: "SortOrder", key: "order", width: 80, align: "right" as const },
    { title: "Value", dataIndex: "Value", key: "value", render: (v: string) => <b className="text-slate-800">{v}</b> },
    { title: "Used on challans", dataIndex: "UsedOn", key: "used", width: 140, align: "right" as const, render: (v: number) => Number(v) || <span className="text-slate-300">0</span> },
    { title: "Added by", dataIndex: "AddedBy", key: "by", render: (v: string, r: any) => <div className="text-xs"><div>{v?.trim() || <span className="text-slate-400">Starting value</span>}</div><div className="text-slate-400">{formatDate(r.InsertedOn)}</div></div> },
    { title: "Status", dataIndex: "IsActive", key: "status", width: 95, render: (a: boolean) => a ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
    { title: "Actions", key: "actions", width: 90, render: (_: any, r: any) => (
      <Space size="small">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(r)} /></Tooltip>
        <Tooltip title={r.IsActive ? "Switch off (hide from the dropdown)" : "Switch on"}><Button type="text" size="small" danger={r.IsActive} loading={toggling === r.TextListId} icon={r.IsActive ? <StopOutlined /> : <CheckCircleOutlined />} onClick={() => toggleActive(r)} /></Tooltip>
      </Space>
    ) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<OrderedListOutlined />} title="Text Lists" subtitle="Values behind the Delivery Challan dropdowns · values added from the challan form appear here · switch a value off to hide it"
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">Add {list.label}</Button>
        </>} />

      <StatStrip items={[
        { label: `${list.label} values`, value: inGroup.length },
        { label: "Active", value: inGroup.filter((r) => r.IsActive).length, tone: "ok" },
        { label: "Inactive", value: inGroup.filter((r) => !r.IsActive).length },
        { label: "Added from the form", value: inGroup.filter((r) => r.AddedBy?.trim()).length },
      ]} />

      <div className="filter-toolbar">
        <Segmented value={group} onChange={(v) => { setGroup(String(v)); setSearch(""); }}
          options={LISTS.map((l) => ({ value: l.group, label: `${l.label} (${rows.filter((r) => r.ListGroup === l.group).length})` }))} />
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder={`Search ${list.noun}...`} value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-72" />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="TextListId" size="middle" loading={loading} scroll={{ x: 800 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: `No ${list.noun} values yet` }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<OrderedListOutlined />} title={editing ? `Edit — ${editing.Value}` : `Add ${list.label}`} subtitle={list.hint}
          meta={<><DrawerChip label={list.label} tone="outline" /><DrawerChip label={editing ? "Edit" : "New"} tone="solid" /></>} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update" : "Save"}</Button></div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Renaming does not change challans already saved.</p>
          <FormSection number="01" title={`${list.label} value`} description="The text shown in the dropdown and its position in the list.">
            <div className="form-grid form-grid-three">
              <div className="entry-field-wide"><Form.Item name="Value" label={fieldLabel("Value")} rules={[{ required: true, whitespace: true, message: "Value is required" }, { max: 120 }]}><Input placeholder={`e.g. ${group === "Transporter" ? "VRL Logistics" : group === "PartyKind" ? "Job worker" : "Repair"}`} /></Form.Item></div>
              <Form.Item name="SortOrder" label={fieldLabel("Sort order")} extra="Lower comes first; same order sorts A–Z" rules={[{ required: true, message: "Sort order is required" }]}><InputNumber min={0} max={9999} precision={0} className="w-full" /></Form.Item>
              <Form.Item name="IsActive" label={fieldLabel("Active")} valuePropName="checked" extra="Off = hidden from the dropdown"><Switch /></Form.Item>
            </div>
          </FormSection>
        </Form>
      </Drawer>
    </div>
  );
}
