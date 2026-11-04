"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AutoComplete, Button, Drawer, Form, Input, Select, Space, Switch, Table, Tag, Tooltip, message } from "antd";
import { CheckCircleOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, ShopOutlined, StopOutlined } from "@ant-design/icons";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { FormSection } from "@/components/common/FormSection";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { districtOptions } from "@/lib/utils/selectOptions";
import { reportFormError } from "@/lib/utils/formErrors";

const FIELDS = ["ServiceCenterCode", "ServiceCenterName", "ContactPerson", "Mobile", "Email", "Gstin", "Address", "City", "StateId", "District", "Pincode", "IsActive"];

/** Service Centers master — every centre is also an iERP ledger ("Service Center" group) with its address in LgrAddresses. */
export default function ServiceCentersPage() {
  const [form] = Form.useForm();
  const { states, districts, fetchBootstrap } = useMasterStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const stateId = Form.useWatch("StateId", form);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.post("/api/masters/service-centers/get", {})).data.centers); }
    catch (err) { reportFormError(err, { fallback: "Could not load service centers" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openForm = (row?: any) => {
    setEditing(row || null);
    form.resetFields();
    form.setFieldsValue(row ? Object.fromEntries(FIELDS.map((f) => [f, row[f] ?? undefined])) : { IsActive: true });
    setDrawerOpen(true);
  };

  const save = async (values: any, id?: string) => {
    const { data } = await axios.post("/api/masters/service-centers/save", { ...values, ServiceCenterId: id });
    await load();
    fetchBootstrap();
    return data.center;
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const center = await save(values, editing?.ServiceCenterId);
      message.success(`${center.ServiceCenterName} ${editing ? "updated" : "added"} — iERP ledger ${center.LedgerCode || ""}`.trim());
      setDrawerOpen(false);
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save service center" });
    } finally {
      setSaving(false);
    }
  };

  // Centres are never deleted (calls, stock and engineers refer to them) — they are switched off, as in the prototype.
  const toggleActive = async (row: any) => {
    setToggling(row.ServiceCenterId);
    try {
      await save({ ...Object.fromEntries(FIELDS.map((f) => [f, row[f]])), IsActive: !row.IsActive }, row.ServiceCenterId);
      message.success(`${row.ServiceCenterName} ${row.IsActive ? "deactivated" : "activated"}`);
    } catch (err) {
      reportFormError(err, { fallback: "Could not change the status" });
    } finally {
      setToggling(null);
    }
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (!q || [r.ServiceCenterCode, r.ServiceCenterName, r.City, r.District, r.ContactPerson, r.LedgerCode].some((v) => v?.toLowerCase().includes(q)))
      && (!stateFilter || r.StateId === stateFilter) && (!statusFilter || (r.IsActive ? "Active" : "Inactive") === statusFilter);
  });

  const columns = [
    { title: "Code", dataIndex: "ServiceCenterCode", key: "code", width: 110, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v || "—"}</span> },
    { title: "Service center", dataIndex: "ServiceCenterName", key: "name", render: (v: string, r: any) => <div><b className="text-slate-800">{v}</b>{r.District && <div className="text-[11px] text-slate-400">{r.District}</div>}</div> },
    { title: "Contact", dataIndex: "ContactPerson", key: "contact", render: (v: string) => v || "—" },
    { title: "Mobile", dataIndex: "Mobile", key: "mobile", width: 120, render: (v: string) => v || "—" },
    { title: "City", dataIndex: "City", key: "city", render: (v: string) => v || "—" },
    { title: "State", dataIndex: "StateName", key: "state", render: (v: string) => v || "—" },
    { title: "Engineers", dataIndex: "Engineers", key: "eng", width: 95, align: "right" as const },
    { title: "Open calls", dataIndex: "OpenCalls", key: "open", width: 100, align: "right" as const },
    { title: "iERP ledger", key: "ledger", width: 130, render: (_: any, r: any) => r.LedgerCode ? <Tooltip title={r.LedgerGroup}><Tag color="geekblue" className="font-mono">{r.LedgerCode}</Tag></Tooltip> : <Tooltip title="Created in the iERP on the next save"><Tag color="warning">Not in iERP</Tag></Tooltip> },
    { title: "Status", dataIndex: "IsActive", key: "status", width: 95, render: (a: boolean) => a ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
    { title: "Actions", key: "actions", width: 90, render: (_: any, r: any) => (
      <Space size="small">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(r)} /></Tooltip>
        <Tooltip title={r.IsActive ? "Deactivate" : "Activate"}><Button type="text" size="small" danger={r.IsActive} loading={toggling === r.ServiceCenterId} icon={r.IsActive ? <StopOutlined /> : <CheckCircleOutlined />} onClick={() => toggleActive(r)} /></Tooltip>
      </Space>
    ) },
  ];

  const stateOptions = states.map((s: any) => ({ value: s.StateId, label: s.StateName }));

  return (
    <div className="space-y-4">
      <PageHeader icon={<ShopOutlined />} title="Service Centers" subtitle={`${rows.length} service centers · calls are routed by state; stock is held per center · each center is a ledger in the iERP`}
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">Add Service Center</Button>
        </>} />

      <StatStrip items={[
        { label: "Service centers", value: rows.length },
        { label: "Active", value: rows.filter((r) => r.IsActive).length, tone: "ok" },
        { label: "Engineers", value: rows.reduce((s, r) => s + Number(r.Engineers || 0), 0) },
        { label: "Open calls", value: rows.reduce((s, r) => s + Number(r.OpenCalls || 0), 0), tone: "warn" },
        { label: "Not yet in iERP", value: rows.filter((r) => !r.LedgerCode).length, tone: rows.some((r) => !r.LedgerCode) ? "danger" : undefined },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search service center…" value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select allowClear showSearch optionFilterProp="label" placeholder="State: All" value={stateFilter} onChange={setStateFilter} options={stateOptions} className="w-48" />
        <Select allowClear placeholder="Status: All" value={statusFilter} onChange={setStatusFilter} options={["Active", "Inactive"].map((s) => ({ value: s, label: s }))} className="w-36" />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="ServiceCenterId" size="middle" loading={loading} scroll={{ x: 1250 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<ShopOutlined />} title={editing ? `Edit — ${editing.ServiceCenterName}` : "Add Service Center"} subtitle="Saved here and as a ledger (with address) in the iERP"
          meta={<>{editing?.LedgerCode && <DrawerChip label={`iERP ${editing.LedgerCode}`} tone="outline" />}<DrawerChip label={editing ? "Edit" : "New"} tone="solid" /></>}
          maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update" : "Save"}</Button></div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · The iERP ledger name is the center name and must be unique in the iERP.</p>
          <FormSection number="01" title="Center details" description="Code, name and contact.">
            <div className="form-grid form-grid-three">
              <Form.Item name="ServiceCenterCode" label={fieldLabel("Center code")} rules={[{ required: true, message: "Center code is required" }, { max: 30 }]} normalize={(v) => v?.toUpperCase()}><Input placeholder="e.g. SC-PUN" className="font-mono" /></Form.Item>
              <Form.Item name="ServiceCenterName" label={fieldLabel("Center name")} rules={[{ required: true, message: "Center name is required" }, { max: 150 }]}><Input placeholder="e.g. Pune Service Center" /></Form.Item>
              <Form.Item name="ContactPerson" label={fieldLabel("Contact person")} rules={[{ max: 100 }]}><Input /></Form.Item>
              <Form.Item name="Mobile" label={fieldLabel("Mobile")} rules={[{ pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit mobile number" }]}><Input maxLength={10} placeholder="10-digit mobile" /></Form.Item>
              <Form.Item name="Email" label={fieldLabel("E-mail")} rules={[{ type: "email", message: "Enter a valid e-mail address" }, { max: 120 }]}><Input /></Form.Item>
              <Form.Item name="Gstin" label={fieldLabel("GSTIN")} normalize={(v) => v?.toUpperCase()} rules={[{ pattern: /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, message: "Enter a valid 15-character GSTIN" }]}><Input maxLength={15} className="font-mono" /></Form.Item>
            </div>
          </FormSection>

          <FormSection number="02" title="Address" description="Saved to the iERP ledger address (LgrAddresses).">
            <div className="form-grid form-grid-three">
              <div className="entry-field-wide"><Form.Item name="Address" label={fieldLabel("Address")} rules={[{ max: 300 }]}><Input.TextArea rows={2} maxLength={300} /></Form.Item></div>
              <Form.Item name="City" label={fieldLabel("City")} rules={[{ max: 80 }]}><Input /></Form.Item>
              <Form.Item name="StateId" label={fieldLabel("State")} rules={[{ required: true, message: "State is required" }]}><Select showSearch optionFilterProp="label" placeholder="Select state" options={stateOptions} onChange={() => form.setFieldValue("District", undefined)} /></Form.Item>
              <Form.Item name="District" label={fieldLabel("District")} rules={[{ max: 80 }]}><AutoComplete options={districtOptions(districts, stateId)} placeholder={stateId ? "Select or type district" : "Select state first"} filterOption={(input, o) => String(o?.value || "").toLowerCase().includes(input.toLowerCase())} /></Form.Item>
              <Form.Item name="Pincode" label={fieldLabel("Pin code")} rules={[{ pattern: /^\d{6}$/, message: "Pin code must be 6 digits" }]}><Input maxLength={6} /></Form.Item>
              <Form.Item name="IsActive" label={fieldLabel("Active")} valuePropName="checked"><Switch /></Form.Item>
            </div>
          </FormSection>
        </Form>
      </Drawer>
    </div>
  );
}
