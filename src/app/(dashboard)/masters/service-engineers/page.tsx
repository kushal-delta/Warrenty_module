"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Button, Drawer, Form, Input, Select, Space, Switch, Table, Tag, Tooltip, message } from "antd";
import { CheckCircleOutlined, EditOutlined, IdcardOutlined, LockOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, StopOutlined } from "@ant-design/icons";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { FormSection } from "@/components/common/FormSection";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { parseList } from "@/lib/auth/forms";
import { reportFormError } from "@/lib/utils/formErrors";

const FIELDS = ["FirstName", "LastName", "Username", "Phone", "Email", "ServiceCenterId", "Address", "IsActive"];
const DEFAULT_PASSWORD = "delta@2026";
const fullName = (r: any) => [r.FirstName, r.LastName].filter(Boolean).join(" ");

/** Service Engineers master — field engineer logins; every engineer is also an iERP ledger ("Service Engineers" group) under the centre's ledger. */
export default function ServiceEngineersPage() {
  const [form] = Form.useForm();
  const { states, fetchBootstrap } = useMasterStore();
  const me = useAuthStore((s) => s.user?.UserId);
  const [rows, setRows] = useState<any[]>([]);
  const [centers, setCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [centerFilter, setCenterFilter] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eng, sc] = await Promise.all([axios.post("/api/masters/service-engineers/get", {}), axios.post("/api/masters/service-centers/get", {})]);
      setRows(eng.data.engineers);
      setCenters(sc.data.centers);
    } catch (err) {
      reportFormError(err, { fallback: "Could not load service engineers" });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openForm = (row?: any) => {
    setEditing(row || null);
    form.resetFields();
    form.setFieldsValue(row
      ? { ...Object.fromEntries(FIELDS.map((f) => [f, row[f] ?? undefined])), StateRights: parseList(row.StateRights) }
      : { IsActive: true, Password: DEFAULT_PASSWORD, StateRights: [] });
    setDrawerOpen(true);
  };

  const save = async (values: any, id?: string) => {
    const { data } = await axios.post("/api/masters/service-engineers/save", { ...values, UserId: id });
    await load();
    fetchBootstrap();
    return data.engineer;
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const engineer = await save(values, editing?.UserId);
      message.success(`${fullName(engineer)} ${editing ? "updated" : "added"} — iERP ledger ${engineer.LedgerCode || ""}`.trim());
      setDrawerOpen(false);
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save service engineer" });
    } finally {
      setSaving(false);
    }
  };

  // Engineers are switched off rather than deleted (calls, visits and van stock refer to them), as in the prototype.
  const toggleActive = async (row: any) => {
    setToggling(row.UserId);
    try {
      await save({ ...Object.fromEntries(FIELDS.map((f) => [f, row[f]])), StateRights: parseList(row.StateRights), IsActive: !row.IsActive }, row.UserId);
      message.success(`${fullName(row)} ${row.IsActive ? "deactivated" : "activated"}`);
    } catch (err) {
      reportFormError(err, { fallback: "Could not change the status" });
    } finally {
      setToggling(null);
    }
  };

  const stateShort = (id: string) => { const s = states.find((x: any) => String(x.StateId).toLowerCase() === id.toLowerCase()); return s?.ShortName || s?.StateName || id; };
  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (!q || [fullName(r), r.Username, r.Phone, r.ServiceCenterName, r.LedgerCode].some((v) => v?.toLowerCase().includes(q)))
      && (!centerFilter || r.ServiceCenterId === centerFilter) && (!statusFilter || (r.IsActive ? "Active" : "Inactive") === statusFilter);
  });

  const columns = [
    { title: "Engineer", key: "name", render: (_: any, r: any) => <b className="text-slate-800">{fullName(r)}</b> },
    { title: "Login", dataIndex: "Username", key: "login", render: (v: string) => <span className="font-mono text-xs">{v}</span> },
    { title: "Service center", dataIndex: "ServiceCenterName", key: "sc", render: (v: string) => v || <Tag color="warning">Not set</Tag> },
    { title: "Mobile", dataIndex: "Phone", key: "mobile", width: 120, render: (v: string) => v || "—" },
    { title: "States", dataIndex: "StateRights", key: "states", render: (v: string) => <span className="text-xs text-slate-500">{v ? parseList(v).map(stateShort).join(", ") : "All"}</span> },
    { title: "Open calls", dataIndex: "OpenCalls", key: "open", width: 100, align: "right" as const },
    { title: "iERP ledger", key: "ledger", width: 130, render: (_: any, r: any) => r.LedgerCode ? <Tooltip title={r.LedgerGroup}><Tag color="geekblue" className="font-mono">{r.LedgerCode}</Tag></Tooltip> : <Tooltip title="Created in the iERP on the next save"><Tag color="warning">Not in iERP</Tag></Tooltip> },
    { title: "Status", dataIndex: "IsActive", key: "status", width: 95, render: (a: boolean) => a ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
    { title: "Actions", key: "actions", width: 90, render: (_: any, r: any) => (
      <Space size="small">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(r)} /></Tooltip>
        {r.UserId !== me && <Tooltip title={r.IsActive ? "Deactivate" : "Activate"}><Button type="text" size="small" danger={r.IsActive} loading={toggling === r.UserId} icon={r.IsActive ? <StopOutlined /> : <CheckCircleOutlined />} onClick={() => toggleActive(r)} /></Tooltip>}
      </Space>
    ) },
  ];

  const centerOptions = centers.filter((c) => c.IsActive || c.ServiceCenterId === editing?.ServiceCenterId).map((c) => ({ value: c.ServiceCenterId, label: `${c.ServiceCenterName}${c.ServiceCenterCode ? ` (${c.ServiceCenterCode})` : ""}` }));

  return (
    <div className="space-y-4">
      <PageHeader icon={<IdcardOutlined />} title="Service Engineers" subtitle={`${rows.length} field engineers · each carries van stock and is assigned calls · each engineer is a ledger in the iERP`}
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">Add Engineer</Button>
        </>} />

      <StatStrip items={[
        { label: "Engineers", value: rows.length },
        { label: "Active", value: rows.filter((r) => r.IsActive).length, tone: "ok" },
        { label: "Open calls", value: rows.reduce((s, r) => s + Number(r.OpenCalls || 0), 0), tone: "warn" },
        { label: "Not yet in iERP", value: rows.filter((r) => !r.LedgerCode).length, tone: rows.some((r) => !r.LedgerCode) ? "danger" : undefined },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search engineer…" value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Service center: All" value={centerFilter} onChange={setCenterFilter} options={centers.map((c) => ({ value: c.ServiceCenterId, label: c.ServiceCenterName }))} className="w-56" />
        <Select allowClear placeholder="Status: All" value={statusFilter} onChange={setStatusFilter} options={["Active", "Inactive"].map((s) => ({ value: s, label: s }))} className="w-36" />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="UserId" size="middle" loading={loading} scroll={{ x: 1150 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: "No engineers yet — add one to assign service calls and carry van stock" }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<IdcardOutlined />} title={editing ? `Edit — ${fullName(editing)}` : "Add Service Engineer"} subtitle="Login for the field engineer, also saved as a ledger (with address) in the iERP"
          meta={<>{editing?.LedgerCode && <DrawerChip label={`iERP ${editing.LedgerCode}`} tone="outline" />}<DrawerChip label={editing ? "Edit" : "New"} tone="solid" /></>}
          maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update" : "Save"}</Button></div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · The iERP ledger name is the engineer&apos;s full name and must be unique in the iERP.</p>
          <FormSection number="01" title="Engineer & login" description="Name and sign-in details.">
            <div className="form-grid form-grid-three">
              <Form.Item name="FirstName" label={fieldLabel("First name")} rules={[{ required: true, message: "First name is required" }, { max: 80 }]}><Input placeholder="e.g. Ajay" /></Form.Item>
              <Form.Item name="LastName" label={fieldLabel("Last name")} rules={[{ max: 80 }]}><Input placeholder="e.g. Patil" /></Form.Item>
              <Form.Item name="Username" label={fieldLabel("User name (login)")} extra="Used to sign in" normalize={(v) => v?.toLowerCase().replace(/\s/g, "")}
                rules={[{ required: true, message: "User name is required" }, { pattern: /^[a-z0-9._-]{3,50}$/, message: "3–50 lowercase letters, digits, dot, dash or underscore" }]}><Input prefix="@" placeholder="e.g. eng.pun1" /></Form.Item>
              <Form.Item name="Password" label={fieldLabel("Password")} extra={editing ? "Leave blank to keep the current password" : "Stored as a salted hash"}
                rules={[{ required: !editing, message: "Password is required" }, { min: 6, message: "At least 6 characters" }]}><Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder={editing ? "Unchanged" : undefined} autoComplete="new-password" /></Form.Item>
              <Form.Item name="Phone" label={fieldLabel("Mobile")} rules={[{ pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit mobile number" }]}><Input maxLength={10} placeholder="10-digit mobile" /></Form.Item>
              <Form.Item name="Email" label={fieldLabel("E-mail")} rules={[{ type: "email", message: "Enter a valid e-mail address" }, { max: 120 }]}><Input /></Form.Item>
            </div>
          </FormSection>

          <FormSection number="02" title="Service center & rights" description="The engineer's centre (their iERP ledger sits under the centre's ledger) and the states they can see.">
            <div className="form-grid form-grid-three">
              <Form.Item name="ServiceCenterId" label={fieldLabel("Service center")} extra="Required for engineers" rules={[{ required: true, message: "Select the service center of this engineer" }]}>
                <Select showSearch optionFilterProp="label" placeholder="Select service center" options={centerOptions} />
              </Form.Item>
              <div className="entry-field-wide"><Form.Item name="StateRights" label={fieldLabel("State rights")} extra="Blank = all states. Data is limited to the ticked states.">
                <Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="All states" options={states.map((s: any) => ({ value: s.StateId, label: s.StateName }))} />
              </Form.Item></div>
              <div className="entry-field-wide"><Form.Item name="Address" label={fieldLabel("Address")} extra="Saved to the iERP ledger address (LgrAddresses)" rules={[{ max: 255 }]}><Input.TextArea rows={2} maxLength={255} /></Form.Item></div>
              <Form.Item name="IsActive" label={fieldLabel("Active")} valuePropName="checked"><Switch disabled={editing?.UserId === me} /></Form.Item>
            </div>
          </FormSection>
        </Form>
      </Drawer>
    </div>
  );
}
