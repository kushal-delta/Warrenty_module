"use client";

import { FormSection } from "@/components/common/FormSection";
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
  BarcodeOutlined,
  PlusOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useWarrantyStore, Sticker } from "@/lib/store/useWarrantyStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import {
  DrawerHeader,
  DrawerChip,
  DRAWER_WIDTH,
  DRAWER_HEADER_STYLE,
} from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { BulkUploadWizard } from "@/components/common/BulkUploadWizard";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import dayjs from "dayjs";

export default function StickersPage() {
  const [form] = Form.useForm();
  const {
    stickers,
    fetchStickers,
    addSticker,
    updateSticker,
    deleteSticker,
    bulkUploadStickers,
    isLoading,
  } = useWarrantyStore();

  const { productModels, fetchProductModels } = useMasterStore();

  // Local UI states
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editingSticker, setEditingSticker] = useState<Sticker | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingSticker, setDeletingSticker] = useState<Sticker | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk upload modal state
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    fetchStickers();
    fetchProductModels();
  }, [fetchStickers, fetchProductModels]);

  const handleOpenCreate = () => {
    setEditingSticker(null);
    form.resetFields();
    form.setFieldsValue({
      Category: "PUMP",
      Status: "Generated",
      SupplierName: "Solartive Techno Industries",
      ProductGroup: "Solar Submersible Pump Set",
      InvoiceLocation: "Greater Noida HO",
      MfgDate: dayjs(),
      InvoiceDate: dayjs(),
    });
    setDrawerOpen(true);
  };

  const handleOpenEdit = (record: Sticker) => {
    setEditingSticker(record);
    form.resetFields();
    form.setFieldsValue({
      ...record,
      MfgDate: record.MfgDate ? dayjs(record.MfgDate) : null,
      InvoiceDate: record.InvoiceDate ? dayjs(record.InvoiceDate) : null,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        ...values,
        MfgDate: values.MfgDate ? values.MfgDate.toISOString() : null,
        InvoiceDate: values.InvoiceDate ? values.InvoiceDate.toISOString() : null,
      };

      if (editingSticker) {
        await updateSticker({
          StickerId: editingSticker.StickerId,
          ...payload,
        });
        message.success(`Serial ${values.SerialNo} updated successfully`);
      } else {
        await addSticker(payload);
        message.success(`Serial ${values.SerialNo} registered successfully`);
      }

      setDrawerOpen(false);
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Could not save sticker record" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSticker) return;
    try {
      setDeleting(true);
      await deleteSticker(deletingSticker.StickerId);
      message.success(`Serial ${deletingSticker.SerialNo} deleted successfully`);
      setDeleteModalOpen(false);
      setDeletingSticker(null);
    } catch (err: any) {
      message.error(err.response?.data?.error || "Could not delete sticker record");
    } finally {
      setDeleting(false);
    }
  };

  // Filter models based on selected category in the form
  const selectedFormCategory = Form.useWatch("Category", form);
  const filteredModels = productModels.filter(
    (m) => !selectedFormCategory || m.Category === selectedFormCategory
  );

  const columns = [
    {
      title: "Serial No",
      dataIndex: "SerialNo",
      key: "SerialNo",
      render: (serial: string) => (
        <span className="font-mono font-bold text-blue-700 tracking-wide">{serial}</span>
      ),
    },
    {
      title: "Category",
      dataIndex: "Category",
      key: "Category",
      width: 120,
      render: (cat: string) => (
        <Tag color={cat === "PUMP" ? "blue" : cat === "MOTOR" ? "cyan" : "purple"}>
          {cat}
        </Tag>
      ),
    },
    {
      title: "Model Name",
      dataIndex: "ModelName",
      key: "ModelName",
      render: (name: string, row: Sticker) => (
        <div>
          <div className="font-medium text-slate-800 whitespace-normal break-words leading-tight">
            {name || "Standard Model"}
          </div>
          {row.ModelCode && (
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">{row.ModelCode}</div>
          )}
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "Status",
      key: "Status",
      width: 130,
      render: (status: string) => {
        const color =
          status === "Registered"
            ? "green"
            : status === "Generated"
            ? "blue"
            : status === "Replaced"
            ? "orange"
            : "default";
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: "Invoice & Location",
      key: "invoice",
      render: (_: any, row: Sticker) => (
        <div className="text-xs text-slate-600">
          <div>{row.InvoiceNo || "-"}</div>
          <div className="text-[11px] text-slate-400">{row.InvoiceLocation || "-"}</div>
        </div>
      ),
    },
    {
      title: "Mfg Date",
      dataIndex: "MfgDate",
      key: "MfgDate",
      width: 110,
      render: (val: string) => formatDate(val, false),
    },
    {
      title: "Added On",
      dataIndex: "InsertedOn",
      key: "InsertedOn",
      width: 150,
      render: (val: string) => formatDate(val, true),
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_: any, record: Sticker) => (
        <Space size="small">
          <Tooltip title="Edit Serial">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined className="text-blue-600" />}
              onClick={() => handleOpenEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Delete Serial">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setDeletingSticker(record);
                setDeleteModalOpen(true);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Bulk upload columns spec
  const bulkColumns = [
    { key: "SerialNo", header: "Serial No", required: true },
    { key: "Category", header: "Category", required: true },
    { key: "ModelCode", header: "Model Code", required: false },
    { key: "InvoiceNo", header: "Invoice No", required: false },
    { key: "InvoiceLocation", header: "Invoice Location", required: false },
  ];

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarcodeOutlined className="text-blue-600" />
            Serial & Sticker Register
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage component serials, product models, and installation status.
          </p>
        </div>

        <div className="page-actions">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchStickers()}
            loading={isLoading}
          >
            Refresh
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() => setBulkOpen(true)}
          >
            Bulk Upload
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            className="bg-blue-600 shadow-sm"
          >
            Register Serial
          </Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="filter-toolbar">
        <Input
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search by Serial No, Invoice, or Model..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="w-72"
        />

        <Select
          placeholder="All Categories"
          value={categoryFilter}
          onChange={setCategoryFilter}
          allowClear
          className="w-40"
        >
          <Select.Option value="PUMP">Pump</Select.Option>
          <Select.Option value="MOTOR">Motor</Select.Option>
          <Select.Option value="CONTROLLER">Controller</Select.Option>
        </Select>

        <Select
          placeholder="All Statuses"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          className="w-40"
        >
          <Select.Option value="Generated">Generated (In Stock)</Select.Option>
          <Select.Option value="Registered">Registered (Installed)</Select.Option>
          <Select.Option value="Replaced">Replaced</Select.Option>
        </Select>
      </div>

      {/* Register Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <Table
          dataSource={stickers.filter((s) => {
            const matchesSearch =
              !search ||
              s.SerialNo.toLowerCase().includes(search.toLowerCase()) ||
              (s.InvoiceNo && s.InvoiceNo.toLowerCase().includes(search.toLowerCase())) ||
              (s.ModelName && s.ModelName.toLowerCase().includes(search.toLowerCase()));
            const matchesCat = !categoryFilter || s.Category === categoryFilter;
            const matchesStatus = !statusFilter || s.Status === statusFilter;
            return matchesSearch && matchesCat && matchesStatus;
          })}
          columns={columns}
          rowKey="StickerId"
          loading={isLoading}
          pagination={{
            defaultPageSize: 15,
            showSizeChanger: true,
            pageSizeOptions: ["10", "15", "20", "50", "100"],
            showTotal: (total, range) => `Showing ${range[0]}-${range[1]} of ${total} serials`,
          }}
          scroll={{ x: 1000 }}
        />
      </div>

      {/* Create / Edit Drawer adhering to RULES §44 */}
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
            icon={<BarcodeOutlined />}
            title={editingSticker ? "Edit Serial Record" : "Register New Component Serial"}
            subtitle="Add component details, stock status, and invoice information."
            meta={
              editingSticker ? (
                <>
                  <DrawerChip label={editingSticker.SerialNo} tone="solid" />
                  <DrawerChip label={editingSticker.Status} />
                </>
              ) : (
                <DrawerChip label="New Record" tone="solid" />
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
              {editingSticker ? "Save Changes" : "Register Serial"}
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form"><p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Review the details before saving.</p><FormSection number="01" title="Component identity" description="Match the serial printed on the component with its category and product model."><div className="form-grid form-grid-two"><div className=""><Form.Item
              name="SerialNo"
              label={<span className="text-xs font-semibold text-slate-700">Serial Number</span>}
              rules={[{ required: true, message: "Serial number is required" }]}
            >
              <Input
                placeholder="e.g. 2605PU30001"
                className="font-mono uppercase"
                disabled={Boolean(editingSticker)}
              />
            </Form.Item></div>
<div className=""><Form.Item
              name="Category"
              label={<span className="text-xs font-semibold text-slate-700">Category</span>}
              rules={[{ required: true, message: "Category is required" }]}
            >
              <Select placeholder="Select Category">
                <Select.Option value="PUMP">Pump</Select.Option>
                <Select.Option value="MOTOR">Motor</Select.Option>
                <Select.Option value="CONTROLLER">Controller</Select.Option>
              </Select>
            </Form.Item></div>
<div className="entry-field-wide"><Form.Item
              name="ProductModelId"
              label={<span className="text-xs font-semibold text-slate-700">Product Model</span>}
              rules={[{ required: true, message: "Product model is required" }]}
            >
              <Select
                placeholder="Select product model"
                showSearch
                optionFilterProp="children"
              >
                {filteredModels.map((m) => (
                  <Select.Option key={m.ProductModelId} value={m.ProductModelId}>
                    {m.ModelName} ({m.ModelCode})
                  </Select.Option>
                ))}
              </Select>
            </Form.Item></div></div></FormSection>
<FormSection number="02" title="Stock &amp; manufacturing" description="Set the current stock status and the manufacturing date."><div className="form-grid form-grid-two"><div className=""><Form.Item
              name="Status"
              label={<span className="text-xs font-semibold text-slate-700">Status</span>}
              rules={[{ required: true, message: "Status is required" }]}
            >
              <Select>
                <Select.Option value="Generated">Generated (In Stock)</Select.Option>
                <Select.Option value="Registered">Registered (Installed)</Select.Option>
                <Select.Option value="Replaced">Replaced</Select.Option>
              </Select>
            </Form.Item></div>
<div className=""><Form.Item
              name="MfgDate"
              label={<span className="text-xs font-semibold text-slate-700">Manufacturing Date</span>}
            >
              <SmartDatePicker placeholder="Select or type date" />
            </Form.Item></div></div></FormSection>
<FormSection number="03" title="Invoice &amp; supplier" description="Add purchase details to help trace this component later."><div className="form-grid form-grid-two"><div className=""><Form.Item
              name="InvoiceNo"
              label={<span className="text-xs font-semibold text-slate-700">Invoice Number</span>}
            >
              <Input placeholder="e.g. SI/26/1042" />
            </Form.Item></div>
<div className=""><Form.Item
              name="InvoiceDate"
              label={<span className="text-xs font-semibold text-slate-700">Invoice Date</span>}
            >
              <SmartDatePicker placeholder="Select invoice date" />
            </Form.Item></div>
<div className=""><Form.Item
              name="InvoiceLocation"
              label={<span className="text-xs font-semibold text-slate-700">Invoice Location</span>}
            >
              <Input placeholder="e.g. Greater Noida HO" />
            </Form.Item></div>
<div className=""><Form.Item
              name="SupplierName"
              label={<span className="text-xs font-semibold text-slate-700">Supplier Name</span>}
            >
              <Input placeholder="e.g. Solartive Techno Industries" />
            </Form.Item></div></div></FormSection></Form>
      </Drawer>

      {/* Delete Confirmation Modal adhering to RULES §16 */}
      <ConfirmModal
        open={deleteModalOpen}
        title="Delete Serial Record"
        description={`Are you sure you want to delete serial ${deletingSticker?.SerialNo}? This will permanently delete the record.`}
        items={deletingSticker ? [deletingSticker.SerialNo, deletingSticker.ModelName || ""] : []}
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeletingSticker(null);
        }}
      />

      {/* 4-Step Bulk Upload Wizard adhering to RULES §8 */}
      <BulkUploadWizard
        open={bulkOpen}
        title="Bulk Upload Component Serials"
        templateFileName="Component_Serials"
        columns={bulkColumns}
        sampleData={[
          {
            SerialNo: "2611PU30001",
            Category: "PUMP",
            ModelCode: "SSP-30-DC",
            InvoiceNo: "SI/26/5001",
            InvoiceLocation: "Greater Noida HO",
          },
        ]}
        onUpload={async (validRows) => {
          const res = await bulkUploadStickers(validRows);
          return res;
        }}
        onClose={() => setBulkOpen(false)}
      />
    </div>
  );
}
