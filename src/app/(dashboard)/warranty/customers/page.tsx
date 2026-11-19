"use client";

import React, { useEffect, useState } from "react";
import { Button, Drawer, Form, Input, Select, Space, Table, Tag, Tooltip, message } from "antd";
import { DeleteOutlined, EditOutlined, EyeOutlined, PhoneOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, TeamOutlined } from "@ant-design/icons";
import { useCustomerStore, Customer, CustomerDetail } from "@/lib/store/useCustomerStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { FormSection } from "@/components/common/FormSection";
import { DistrictSelect } from "@/components/common/DistrictSelect";
import { PageHeader, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";
import { ExportExcelButton } from "@/components/common/ReportTools";
import { CustomerProfile } from "@/components/warranty/CustomerProfile";
import { exportTable } from "@/lib/utils/excelExport";

const LANGUAGES = [{ value: "EN", label: "English" }, { value: "HI", label: "Hindi" }, { value: "GU", label: "Gujarati" }];

export default function CustomersPage() {
  const [form] = Form.useForm();
  const { customers, fetchCustomers, fetchCustomerDetail, saveCustomer, deleteCustomer, isLoading } = useCustomerStore();
  const { states } = useMasterStore();
  const role = useAuthStore((s) => s.user?.Role);
  const isHO = role === "SUPER" || role === "HO";

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>();
  useUrlQuery("q", (q) => { setSearch(q); setStateFilter(undefined); });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => { fetchCustomers().catch((err) => reportFormError(err, { fallback: "Could not load customers" })); }, [fetchCustomers]);

  const openForm = (row?: Customer) => {
    setEditing(row || null);
    form.resetFields();
    form.setFieldsValue(row ? { ...row } : { Language: "HI" });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await saveCustomer({ ...values, CustomerId: editing?.CustomerId });
      message.success(editing ? "Customer updated" : "Customer created");
      setDrawerOpen(false);
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save customer" });
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (row: Customer) => {
    try { setDetail(await fetchCustomerDetail(row.CustomerId)); } catch (err) { reportFormError(err, { fallback: "Could not load customer" }); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteCustomer(deleting.CustomerId);
      message.success("Customer deleted");
      setDeleting(null);
    } catch (err) {
      reportFormError(err, { fallback: "Could not delete customer" });
    } finally {
      setDeleteBusy(false);
    }
  };

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matches = !q || [c.CustomerName, c.Mobile, c.Village, c.District, c.Pincode].some((v) => v?.toLowerCase().includes(q));
    return matches && (!stateFilter || c.StateId === stateFilter);
  });

  const exportExcel = () => exportTable("Customers", [
    { header: "Customer", value: (c: Customer) => c.CustomerName },
    { header: "Mobile", value: (c: Customer) => c.Mobile },
    { header: "Village / Area", value: (c: Customer) => c.Village },
    { header: "District", value: (c: Customer) => c.District },
    { header: "State", value: (c: Customer) => c.StateName },
    { header: "Pincode", value: (c: Customer) => c.Pincode },
    { header: "Pump Sets", value: (c: Customer) => c.InstallationCount, type: "number", total: true },
    { header: "Active Warranties", value: (c: Customer) => c.ActiveWarrantyCount || 0, type: "number", total: true },
    { header: "Service Calls", value: (c: Customer) => c.ComplaintCount, type: "number", total: true },
  ], filtered, { State: states.find((s) => s.StateId === stateFilter)?.StateName, Search: search || null });

  const columns = [
    { title: "Customer", dataIndex: "CustomerName", key: "name", render: (name: string, row: Customer) => (
      <div><div className="font-semibold text-slate-800">{name}</div><div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5"><PhoneOutlined className="text-slate-400" /><span className="font-mono">{row.Mobile}</span></div></div>
    ) },
    { title: "Village / Area", dataIndex: "Village", key: "village", render: (v: string) => v || "-" },
    { title: "District", dataIndex: "District", key: "district", render: (v: string) => v || "-" },
    { title: "State", dataIndex: "StateName", key: "state", render: (v: string) => v || "-" },
    { title: "Pincode", dataIndex: "Pincode", key: "pin", width: 90, render: (v: string) => v || "-" },
    { title: "Pump Sets", dataIndex: "InstallationCount", key: "inst", width: 95, align: "right" as const },
    { title: "Active Warranties", dataIndex: "ActiveWarrantyCount", key: "war", width: 130, align: "right" as const, render: (v: number) => <Tag color={v ? "green" : "default"}>{v || 0}</Tag> },
    { title: "Service Calls", dataIndex: "ComplaintCount", key: "calls", width: 105, align: "right" as const },
    { title: "Actions", key: "actions", width: 120, render: (_: any, row: Customer) => (
      <Space size="small">
        <Tooltip title="Customer 360"><Button type="text" size="small" icon={<EyeOutlined className="text-blue-600" />} onClick={() => openDetail(row)} /></Tooltip>
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined className="text-slate-600" />} onClick={() => openForm(row)} /></Tooltip>
        {isHO && <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(row)} /></Tooltip>}
      </Space>
    ) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<TeamOutlined />}
        title="Customers"
        subtitle="End-user customers · created automatically at warranty registration; the mobile number is their login"
        actions={<>
          <ExportExcelButton onExport={exportExcel} disabled={!filtered.length} />
          <Button icon={<ReloadOutlined />} onClick={() => fetchCustomers()} loading={isLoading}>Refresh</Button>
          {isHO && <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">Add Customer</Button>}
        </>}
      />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search name, mobile, village, district, pincode..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select placeholder="All States" value={stateFilter} onChange={setStateFilter} allowClear showSearch optionFilterProp="label" className="w-48" options={states.map((s) => ({ value: s.StateId, label: s.StateName }))} />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="CustomerId" size="middle" loading={isLoading} scroll={{ x: 1000 }}
          pagination={{ defaultPageSize: 15, showSizeChanger: true, showTotal: (total, range) => `Showing ${range[0]}-${range[1]} of ${total} customers` }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<TeamOutlined />} title={editing ? `Edit Customer — ${editing.CustomerName}` : "Add Customer"} subtitle="Contact and location details of the end user." meta={<DrawerChip label={editing ? "Edit" : "New Customer"} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update Customer" : "Save Customer"}</Button></div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · The mobile number must be unique.</p>
          <FormSection number="01" title="Contact" description="Name, phone numbers and preferred language.">
            <div className="form-grid form-grid-two">
              <div className="entry-field-wide"><Form.Item name="CustomerName" label={fieldLabel("Customer Name")} rules={[{ required: true, message: "Customer name is required" }, { max: 120 }]}><Input placeholder="e.g. Mohan Lal Yadav" /></Form.Item></div>
              <Form.Item name="Mobile" label={fieldLabel("Mobile")} rules={[{ required: true, message: "Mobile number is required" }, { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit mobile number" }]}><Input maxLength={10} placeholder="e.g. 9822000001" /></Form.Item>
              <Form.Item name="AltMobile" label={fieldLabel("Alternate Mobile")} rules={[{ pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit mobile number" }]}><Input maxLength={10} /></Form.Item>
              <Form.Item name="Email" label={fieldLabel("Email")} rules={[{ type: "email", message: "Email address is invalid" }]}><Input /></Form.Item>
              <Form.Item name="Language" label={fieldLabel("Preferred Language")} rules={[{ required: true }]}><Select options={LANGUAGES} /></Form.Item>
            </div>
          </FormSection>
          <FormSection number="02" title="Address" description="Where the customer lives or the pump is installed.">
            <div className="form-grid form-grid-two">
              <div className="entry-field-wide"><Form.Item name="Address" label={fieldLabel("Address")}><Input.TextArea rows={2} maxLength={300} /></Form.Item></div>
              <Form.Item name="Village" label={fieldLabel("Village / Area")}><Input maxLength={100} /></Form.Item>
              <Form.Item name="City" label={fieldLabel("City / Town")}><Input maxLength={80} /></Form.Item>
              <Form.Item name="StateId" label={fieldLabel("State")} rules={[{ required: true, message: "State is required" }]}><Select showSearch optionFilterProp="label" placeholder="Select state" options={states.map((s) => ({ value: s.StateId, label: s.StateName }))} onChange={() => form.setFieldValue("District", undefined)} /></Form.Item>
              <Form.Item name="District" label={fieldLabel("District")}><DistrictSelect stateField="StateId" /></Form.Item>
              <Form.Item name="Pincode" label={fieldLabel("Pincode")} rules={[{ pattern: /^\d{6}$/, message: "Pincode must be 6 digits" }]}><Input maxLength={6} /></Form.Item>
            </div>
          </FormSection>
        </Form>
      </Drawer>

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={DRAWER_WIDTH} closable={false} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={detail && <DrawerHeader icon={<TeamOutlined />} title={detail.customer.CustomerName} subtitle={`${detail.customer.Mobile} · ${[detail.customer.Village, detail.customer.District, detail.customer.StateName].filter(Boolean).join(", ")}`} meta={<DrawerChip label="Customer 360" tone="solid" />} onClose={() => setDetail(null)} />}
      >
        {detail && <CustomerProfile detail={detail as any} />}
      </Drawer>

      <ConfirmModal open={!!deleting} title="Delete Customer" description={`Delete customer ${deleting?.CustomerName}? This cannot be undone.`} warningText="Customers with installations, warranties or service calls cannot be deleted." loading={deleteBusy} onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
    </div>
  );
}
