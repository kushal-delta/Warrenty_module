"use client";

import { FormSection } from "@/components/common/FormSection";
import { DistrictSelect } from "@/components/common/DistrictSelect";
import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Drawer,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Tooltip,
  message,
} from "antd";
import {
  ShopOutlined,
  PlusOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useWarrantyStore, Dealer } from "@/lib/store/useWarrantyStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import {
  DrawerHeader,
  DrawerChip,
  DRAWER_WIDTH,
  DRAWER_HEADER_STYLE,
} from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { BulkUploadWizard } from "@/components/common/BulkUploadWizard";
import { reportFormError } from "@/lib/utils/formErrors";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";

export default function DealersPage() {
  const [form] = Form.useForm();
  const {
    dealers,
    fetchDealers,
    addDealer,
    updateDealer,
    deleteDealer,
    isLoading,
  } = useWarrantyStore();

  const { states } = useMasterStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  useUrlQuery("q", (q) => { setSearch(q); setStatusFilter(undefined); });

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingDealer, setDeletingDealer] = useState<Dealer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk upload modal state
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    fetchDealers();
  }, [fetchDealers]);

  const handleOpenCreate = () => {
    setEditingDealer(null);
    form.resetFields();
    form.setFieldsValue({ Status: "Approved", WarrantyMonths: 24 });
    setDrawerOpen(true);
  };

  const handleOpenEdit = (record: Dealer) => {
    setEditingDealer(record);
    form.resetFields();
    form.setFieldsValue({ ...record });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingDealer) {
        await updateDealer({
          DealerId: editingDealer.DealerId,
          ...values,
        });
        message.success(`Dealer ${values.FirmName} updated successfully`);
      } else {
        await addDealer(values);
        message.success(`Dealer ${values.FirmName} created successfully`);
      }

      setDrawerOpen(false);
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Could not save dealer record" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingDealer) return;
    try {
      setDeleting(true);
      await deleteDealer(deletingDealer.DealerId);
      message.success(`Dealer ${deletingDealer.FirmName} deleted successfully`);
      setDeleteModalOpen(false);
      setDeletingDealer(null);
    } catch (err: any) {
      message.error(err.response?.data?.error || "Could not delete dealer");
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      title: "Dealer Code",
      dataIndex: "DealerCode",
      key: "DealerCode",
      width: 120,
      render: (code: string) => (
        <span className="font-mono font-semibold text-blue-700">{code || "-"}</span>
      ),
    },
    {
      title: "Firm Name",
      dataIndex: "FirmName",
      key: "FirmName",
      render: (name: string, row: Dealer) => (
        <div>
          <div className="font-bold text-slate-800">{name}</div>
          <div className="text-xs text-slate-400">{row.ContactPerson || "Contact Person"}</div>
        </div>
      ),
    },
    {
      title: "Contact & Phone",
      dataIndex: "Mobile",
      key: "Mobile",
      render: (mobile: string, row: Dealer) => (
        <div className="text-xs">
          <div className="font-mono font-medium text-slate-700">{mobile}</div>
          {row.Email && <div className="text-slate-400">{row.Email}</div>}
        </div>
      ),
    },
    {
      title: "Location",
      key: "location",
      render: (_: any, row: Dealer) => (
        <div className="text-xs text-slate-600">
          <div>
            {row.City || "-"}, {row.District || ""}
          </div>
          <div className="text-slate-400">{row.StateName || ""}</div>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "Status",
      key: "Status",
      width: 120,
      render: (status: string) => {
        const color =
          status === "Approved"
            ? "green"
            : status === "Pending"
            ? "orange"
            : status === "Blocked"
            ? "red"
            : "default";
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_: any, record: Dealer) => (
        <Space size="small">
          <Tooltip title="Edit Dealer">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined className="text-blue-600" />}
              onClick={() => handleOpenEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Delete Dealer">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setDeletingDealer(record);
                setDeleteModalOpen(true);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const filtered = dealers.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      d.FirmName.toLowerCase().includes(q) ||
      d.Mobile.includes(q) ||
      (d.DealerCode && d.DealerCode.toLowerCase().includes(q)) ||
      (d.City && d.City.toLowerCase().includes(q));
    const matchStatus = !statusFilter || d.Status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShopOutlined className="text-blue-600" />
            Authorized Dealers Master
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Network of authorized solar pump distributors, partners, and regional dealers
          </p>
        </div>

        <div className="page-actions">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchDealers()}
            loading={isLoading}
          >
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            className="bg-blue-600 shadow-sm"
          >
            Add Dealer
          </Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="filter-toolbar">
        <Input
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search dealers by Firm Name, Mobile, City, or Code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="w-80"
        />

        <Select
          placeholder="All Statuses"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          className="w-40"
        >
          <Select.Option value="Approved">Approved</Select.Option>
          <Select.Option value="Pending">Pending</Select.Option>
          <Select.Option value="Blocked">Blocked</Select.Option>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="DealerId"
          size="middle"
          loading={isLoading}
          pagination={{
            defaultPageSize: 15,
            showSizeChanger: true,
            pageSizeOptions: ["10", "15", "20", "50", "100"],
            showTotal: (total, range) => `Showing ${range[0]}-${range[1]} of ${total} dealers`,
          }}
          scroll={{ x: 900 }}
        />
      </div>

      {/* Drawer */}
      <Drawer
        rootClassName="entry-drawer"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        closable={false}
        width={maximized ? "100%" : DRAWER_WIDTH}
        styles={{ header: DRAWER_HEADER_STYLE }}
        destroyOnClose
        title={
          <DrawerHeader
            icon={<ShopOutlined />}
            title={editingDealer ? "Edit Dealer Profile" : "Register New Authorized Dealer"}
            subtitle="Distributor profile and regional credentials"
            meta={
              editingDealer ? (
                <>
                  <DrawerChip label={editingDealer.FirmName} tone="solid" />
                  <DrawerChip label={editingDealer.Status} />
                </>
              ) : (
                <DrawerChip label="New Dealer" tone="solid" />
              )
            }
            maximized={maximized}
            onToggleMaximize={() => setMaximized(!maximized)}
            onClose={() => setDrawerOpen(false)}
          />
        }
        footer={
          <div className="flex items-center justify-end space-x-2 py-2">
            <Button onClick={() => setDrawerOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">
              {editingDealer ? "Save Changes" : "Save Dealer"}
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form"><p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Review the details before saving.</p><FormSection number="01" title="Dealer identity" description="Enter the firm details and primary contact."><div className="form-grid form-grid-two"><div className=""><Form.Item
              name="FirmName"
              label={<span className="text-xs font-semibold text-slate-700">Firm Name</span>}
              rules={[{ required: true, message: "Firm name is required" }]}
            >
              <Input placeholder="e.g. Kisan Solar Systems" />
            </Form.Item></div>
<div className=""><Form.Item
              name="DealerCode"
              label={<span className="text-xs font-semibold text-slate-700">Dealer Code</span>}
            >
              <Input placeholder="e.g. 1008" />
            </Form.Item></div>
<div className=""><Form.Item
              name="ContactPerson"
              label={<span className="text-xs font-semibold text-slate-700">Contact Person</span>}
            >
              <Input placeholder="e.g. Rajesh Tyagi" />
            </Form.Item></div>
<div className=""><Form.Item
              name="Status"
              label={<span className="text-xs font-semibold text-slate-700">Status</span>}
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="Approved">Approved</Select.Option>
                <Select.Option value="Pending">Pending Review</Select.Option>
                <Select.Option value="Blocked">Blocked</Select.Option>
              </Select>
            </Form.Item></div></div></FormSection>
<FormSection number="02" title="Contact &amp; territory" description="Add contact details and the region served by this dealer."><div className="form-grid form-grid-two"><div className=""><Form.Item
              name="Mobile"
              label={<span className="text-xs font-semibold text-slate-700">Primary Mobile</span>}
              rules={[{ required: true, message: "Mobile number is required" }]}
            >
              <Input placeholder="e.g. 9810011001" maxLength={10} />
            </Form.Item></div>
<div className=""><Form.Item
              name="Email"
              label={<span className="text-xs font-semibold text-slate-700">Email Address</span>}
            >
              <Input placeholder="dealer@example.com" />
            </Form.Item></div>
<div className=""><Form.Item
              name="StateId"
              label={<span className="text-xs font-semibold text-slate-700">State</span>}
            >
              <Select placeholder="Select state">
                {states.map((s) => (
                  <Select.Option key={s.StateId} value={s.StateId}>
                    {s.StateName}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item></div>
<div className=""><Form.Item
              name="District"
              label={<span className="text-xs font-semibold text-slate-700">District</span>}
            ><DistrictSelect stateField="StateId" />
            </Form.Item></div>
<div className=""><Form.Item
              name="City"
              label={<span className="text-xs font-semibold text-slate-700">City</span>}
            >
              <Input placeholder="e.g. Meerut" />
            </Form.Item></div></div></FormSection>
<FormSection number="03" title="Address &amp; notes" description="Provide the full address and any useful internal notes."><div className="form-grid form-grid-two"><div className="entry-field-wide"><Form.Item
            name="Address"
            label={<span className="text-xs font-semibold text-slate-700">Office / Shop Address</span>}
          >
            <Input.TextArea rows={2} placeholder="Shop No, Main Market..." />
          </Form.Item></div>
<div className="entry-field-wide"><Form.Item
            name="Remarks"
            label={<span className="text-xs font-semibold text-slate-700">Internal Remarks</span>}
          >
            <Input.TextArea rows={2} placeholder="Territory notes, credit terms..." />
          </Form.Item></div></div></FormSection></Form>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteModalOpen}
        title="Delete Dealer Profile"
        description={`Are you sure you want to delete ${deletingDealer?.FirmName}?`}
        items={deletingDealer ? [deletingDealer.FirmName, deletingDealer.Mobile] : []}
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeletingDealer(null);
        }}
      />
    </div>
  );
}
