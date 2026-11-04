"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AutoComplete, Button, Drawer, Form, Input, InputNumber, Segmented, Select, Space, Switch, Table, Tag, Tooltip, message } from "antd";
import { CheckCircleOutlined, EditOutlined, HomeOutlined, LockOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, ShopOutlined, StopOutlined } from "@ant-design/icons";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { FormSection } from "@/components/common/FormSection";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { districtOptions } from "@/lib/utils/selectOptions";
import { reportFormError } from "@/lib/utils/formErrors";

const FIELDS = ["ServiceCenterCode", "ServiceCenterName", "ContactPerson", "Mobile", "Email", "Gstin", "Address", "City", "StateId", "District", "Pincode", "IsActive", "LoginUsername"];
const WH_FIELDS = ["WarehouseCode", "WarehouseName", "Location", "ContactNumber", "Email", "CapacitySqft", "Latitude", "Longitude", "Description", "IsActive", "LoginUsername"];
type Kind = "center" | "warehouse";
const KIND_OPTIONS = [{ value: "center", label: "Service center" }, { value: "warehouse", label: "Warehouse" }];

/**
 * Service Centers / Warehouses master.
 *  - Service center: also an iERP ledger ("Service Center" group) with its address in LgrAddresses (flow unchanged).
 *  - Warehouse: kept in the warranty database only (no iERP ledger), with a login of role WAREHOUSE.
 */
export default function ServiceCentersPage() {
  const [form] = Form.useForm();
  const [whForm] = Form.useForm();
  const { states, districts, fetchBootstrap } = useMasterStore();
  const [rows, setRows] = useState<any[]>([]);
  const [whRows, setWhRows] = useState<any[]>([]);
  const [view, setView] = useState<Kind>("center");
  const [kind, setKind] = useState<Kind>("center");
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
  const loginName = Form.useWatch("LoginUsername", form);
  const hasLogin = Boolean(editing?.LoginUsername);
  const whHasLogin = Boolean(editing?.LoginUserId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sc, wh] = await Promise.all([axios.post("/api/masters/service-centers/get", {}), axios.post("/api/masters/warehouses/get", {})]);
      setRows(sc.data.centers);
      setWhRows(wh.data.warehouses);
    }
    catch (err) { reportFormError(err, { fallback: "Could not load service centers and warehouses" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openForm = (row?: any) => {
    setEditing(row || null);
    setKind("center");
    form.resetFields();
    form.setFieldsValue(row ? Object.fromEntries(FIELDS.map((f) => [f, row[f] ?? undefined])) : { IsActive: true });
    setDrawerOpen(true);
  };

  const openWarehouse = (row?: any) => {
    setEditing(row || null);
    setKind("warehouse");
    whForm.resetFields();
    whForm.setFieldsValue(row ? Object.fromEntries(WH_FIELDS.map((f) => [f, row[f] ?? undefined])) : { IsActive: true });
    setDrawerOpen(true);
  };

  // "Add": the Type field picks the form — service center (unchanged flow) or warehouse.
  const openNew = () => (view === "warehouse" ? openWarehouse() : openForm());
  const changeKind = (k: Kind) => (k === "warehouse" ? openWarehouse() : openForm());

  const saveWarehouse = async (values: any, id?: string) => {
    const { data } = await axios.post("/api/masters/warehouses/save", { ...values, WarehouseId: id });
    await load();
    return data.warehouse;
  };

  const save = async (values: any, id?: string) => {
    const { data } = await axios.post("/api/masters/service-centers/save", { ...values, ServiceCenterId: id });
    await load();
    fetchBootstrap();
    return data.center;
  };

  const handleSave = async () => {
    if (kind === "warehouse") return handleSaveWarehouse();
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

  const handleSaveWarehouse = async () => {
    try {
      const values = await whForm.validateFields();
      setSaving(true);
      const wh = await saveWarehouse(values, editing?.WarehouseId);
      message.success(`${wh.WarehouseName} ${editing ? "updated" : "added"} — login @${wh.LoginUsername}`);
      setView("warehouse");
      setDrawerOpen(false);
    } catch (err) {
      reportFormError(err, { form: whForm, fallback: "Could not save warehouse" });
    } finally {
      setSaving(false);
    }
  };

  // Warehouses are switched off rather than deleted; the login follows.
  const toggleWarehouse = async (row: any) => {
    setToggling(row.WarehouseId);
    try {
      await saveWarehouse({ ...Object.fromEntries(WH_FIELDS.map((f) => [f, row[f]])), IsActive: !row.IsActive }, row.WarehouseId);
      message.success(`${row.WarehouseName} ${row.IsActive ? "deactivated" : "activated"}`);
    } catch (err) {
      reportFormError(err, { fallback: "Could not change the status" });
    } finally {
      setToggling(null);
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
    { title: "Login", dataIndex: "LoginUsername", key: "login", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : <span className="text-slate-400">—</span> },
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

  const whFiltered = whRows.filter((r) => {
    const q = search.toLowerCase();
    return (!q || [r.WarehouseCode, r.WarehouseName, r.Location, r.ContactNumber, r.LoginUsername].some((v) => v?.toLowerCase().includes(q)))
      && (!statusFilter || (r.IsActive ? "Active" : "Inactive") === statusFilter);
  });

  const whColumns = [
    { title: "Code", dataIndex: "WarehouseCode", key: "code", width: 110, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Warehouse", dataIndex: "WarehouseName", key: "name", render: (v: string, r: any) => <div><b className="text-slate-800">{v}</b>{r.Description && <div className="text-[11px] text-slate-400 truncate max-w-xs">{r.Description}</div>}</div> },
    { title: "Location", dataIndex: "Location", key: "loc", render: (v: string) => <span className="text-xs">{v}</span> },
    { title: "Contact number", dataIndex: "ContactNumber", key: "mobile", width: 130 },
    { title: "E-mail", dataIndex: "Email", key: "email", render: (v: string) => v || "—" },
    { title: "Capacity (sq ft)", dataIndex: "CapacitySqft", key: "cap", width: 130, align: "right" as const, render: (v: number) => (v == null ? "—" : Number(v).toLocaleString("en-IN")) },
    { title: "Login", dataIndex: "LoginUsername", key: "login", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : <span className="text-slate-400">—</span> },
    { title: "Status", dataIndex: "IsActive", key: "status", width: 95, render: (a: boolean) => a ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag> },
    { title: "Actions", key: "actions", width: 90, render: (_: any, r: any) => (
      <Space size="small">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openWarehouse(r)} /></Tooltip>
        <Tooltip title={r.IsActive ? "Deactivate" : "Activate"}><Button type="text" size="small" danger={r.IsActive} loading={toggling === r.WarehouseId} icon={r.IsActive ? <StopOutlined /> : <CheckCircleOutlined />} onClick={() => toggleWarehouse(r)} /></Tooltip>
      </Space>
    ) },
  ];

  const stateOptions = states.map((s: any) => ({ value: s.StateId, label: s.StateName }));
  const isWh = kind === "warehouse";

  return (
    <div className="space-y-4">
      <PageHeader icon={<ShopOutlined />} title="Service Centers / Warehouses" subtitle={`${rows.length} service centers · ${whRows.length} warehouses · each service center is a ledger in the iERP; warehouses are kept in this system only`}
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openNew} className="bg-blue-600 shadow-sm">Add Service Center / Warehouse</Button>
        </>} />

      {view === "warehouse" ? <StatStrip items={[
        { label: "Warehouses", value: whRows.length },
        { label: "Active", value: whRows.filter((r) => r.IsActive).length, tone: "ok" },
        { label: "Inactive", value: whRows.filter((r) => !r.IsActive).length },
        { label: "Total capacity (sq ft)", value: whRows.reduce((s, r) => s + Number(r.CapacitySqft || 0), 0).toLocaleString("en-IN") },
      ]} /> : <StatStrip items={[
        { label: "Service centers", value: rows.length },
        { label: "Active", value: rows.filter((r) => r.IsActive).length, tone: "ok" },
        { label: "Engineers", value: rows.reduce((s, r) => s + Number(r.Engineers || 0), 0) },
        { label: "Open calls", value: rows.reduce((s, r) => s + Number(r.OpenCalls || 0), 0), tone: "warn" },
        { label: "Not yet in iERP", value: rows.filter((r) => !r.LedgerCode).length, tone: rows.some((r) => !r.LedgerCode) ? "danger" : undefined },
      ]} />}

      <div className="filter-toolbar">
        <Segmented value={view} onChange={(v) => setView(v as Kind)} options={[{ value: "center", label: `Service Centers (${rows.length})` }, { value: "warehouse", label: `Warehouses (${whRows.length})` }]} />
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder={view === "warehouse" ? "Search warehouse…" : "Search service center…"} value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        {view === "center" && <Select allowClear showSearch optionFilterProp="label" placeholder="State: All" value={stateFilter} onChange={setStateFilter} options={stateOptions} className="w-48" />}
        <Select allowClear placeholder="Status: All" value={statusFilter} onChange={setStatusFilter} options={["Active", "Inactive"].map((s) => ({ value: s, label: s }))} className="w-36" />
      </div>

      <div className={TABLE_CARD}>
        {view === "warehouse"
          ? <Table dataSource={whFiltered} columns={whColumns} rowKey="WarehouseId" size="middle" loading={loading} scroll={{ x: 1200 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} locale={{ emptyText: "No warehouses yet — add one with Type = Warehouse" }} />
          : <Table dataSource={filtered} columns={columns} rowKey="ServiceCenterId" size="middle" loading={loading} scroll={{ x: 1370 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} />}
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={isWh ? <HomeOutlined /> : <ShopOutlined />} title={editing ? `Edit — ${isWh ? editing.WarehouseName : editing.ServiceCenterName}` : isWh ? "Add Warehouse" : "Add Service Center"} subtitle={isWh ? "Saved in this system only (not an iERP ledger), with a warehouse login" : "Saved here and as a ledger (with address) in the iERP"}
          meta={<>{!isWh && editing?.LedgerCode && <DrawerChip label={`iERP ${editing.LedgerCode}`} tone="outline" />}<DrawerChip label={editing ? "Edit" : "New"} tone="solid" /></>}
          maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update" : "Save"}</Button></div>}
      >
        {!editing && (
          <div className="entry-form mb-5">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3">
              <span className="text-xs font-semibold text-slate-700"><span className="text-rose-600">* </span>Type</span>
              <Select value={kind} onChange={changeKind} options={KIND_OPTIONS} className="w-56" />
              <span className="text-xs text-slate-500">{isWh ? "Warehouse: kept in this system only, with its own login (role Warehouse)." : "Service center: also created as a ledger in the iERP."}</span>
            </div>
          </div>
        )}
        {isWh ? (
        <Form form={whForm} layout="vertical" requiredMark scrollToFirstError className="entry-form">
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · The warehouse is not created in the iERP.</p>
          <FormSection number="01" title="Warehouse details" description="Code, name, location and contact.">
            <div className="form-grid form-grid-two">
              <Form.Item name="WarehouseCode" label={fieldLabel("Warehouse code")} rules={[{ required: true, message: "Warehouse code is required" }, { max: 30 }]} normalize={(v) => v?.toUpperCase()}><Input placeholder="e.g. WH-NOIDA" className="font-mono" /></Form.Item>
              <Form.Item name="WarehouseName" label={fieldLabel("Warehouse name")} rules={[{ required: true, message: "Warehouse name is required" }, { max: 150 }]}><Input placeholder="e.g. Central Warehouse Noida" /></Form.Item>
              <Form.Item name="Location" label={fieldLabel("Location")} rules={[{ required: true, message: "Location is required" }, { max: 300 }]}><Input placeholder="Address / area of the warehouse" /></Form.Item>
              <Form.Item name="ContactNumber" label={fieldLabel("Contact number")} rules={[{ required: true, message: "Contact number is required" }, { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit mobile number" }]}><Input maxLength={10} placeholder="10-digit mobile" /></Form.Item>
              <Form.Item name="Email" label={fieldLabel("E-mail")} rules={[{ type: "email", message: "Enter a valid e-mail address" }, { max: 120 }]}><Input /></Form.Item>
              <Form.Item name="CapacitySqft" label={fieldLabel("Capacity (sq ft)")}><InputNumber min={0} precision={0} className="w-full" placeholder="e.g. 5000" /></Form.Item>
              <Form.Item name="Latitude" label={fieldLabel("Latitude")}><InputNumber min={-90} max={90} precision={6} className="w-full" placeholder="e.g. 28.474388" /></Form.Item>
              <Form.Item name="Longitude" label={fieldLabel("Longitude")}><InputNumber min={-180} max={180} precision={6} className="w-full" placeholder="e.g. 77.503990" /></Form.Item>
              <div className="entry-field-wide md:col-span-2"><Form.Item name="Description" label={fieldLabel("Description")} rules={[{ max: 500 }]}><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item></div>
              <Form.Item name="IsActive" label={fieldLabel("Active")} valuePropName="checked" extra="Off also switches the warehouse login off"><Switch /></Form.Item>
            </div>
          </FormSection>

          <FormSection number="02" title="Warehouse login" description="Sign-in for the warehouse (role Warehouse) — shown in User Management.">
            <div className="form-grid form-grid-two">
              <Form.Item name="LoginUsername" label={fieldLabel("User name (login)")} extra="Used to sign in" normalize={(v) => v?.toLowerCase().replace(/\s/g, "")}
                rules={[{ required: true, message: "User name is required" }, { pattern: /^[a-z0-9._-]{3,50}$/, message: "3–50 lowercase letters, digits, dot, dash or underscore" }]}><Input prefix="@" placeholder="e.g. wh.noida" /></Form.Item>
              <Form.Item name="LoginPassword" label={fieldLabel("Password")} extra={whHasLogin ? "Leave blank to keep the current password" : "Stored as a salted hash"}
                rules={[{ required: !whHasLogin, message: "Password is required" }, { min: 6, message: "At least 6 characters" }]}><Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder={whHasLogin ? "Unchanged" : undefined} autoComplete="new-password" /></Form.Item>
            </div>
          </FormSection>
        </Form>
        ) : (
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

          <FormSection number="03" title="Service center login" description="Optional sign-in for the centre (role Service Center) — shown in User Management. Sees only this centre's calls.">
            <div className="form-grid form-grid-three">
              <Form.Item name="LoginUsername" label={fieldLabel("User name (login)")} extra={hasLogin ? "Used to sign in" : "Leave blank for no login"} normalize={(v) => v?.toLowerCase().replace(/\s/g, "")}
                rules={[{ required: hasLogin, message: "User name is required" }, { pattern: /^[a-z0-9._-]{3,50}$/, message: "3–50 lowercase letters, digits, dot, dash or underscore" }]}><Input prefix="@" placeholder="e.g. sc.pune" /></Form.Item>
              <Form.Item name="LoginPassword" label={fieldLabel("Password")} extra={hasLogin ? "Leave blank to keep the current password" : "Stored as a salted hash"}
                rules={[{ required: !hasLogin && Boolean(loginName), message: "Password is required" }, { min: 6, message: "At least 6 characters" }]}><Input.Password prefix={<LockOutlined className="text-slate-400" />} placeholder={hasLogin ? "Unchanged" : undefined} autoComplete="new-password" /></Form.Item>
            </div>
          </FormSection>
        </Form>
        )}
      </Drawer>
    </div>
  );
}
