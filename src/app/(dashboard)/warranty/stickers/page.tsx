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
  AppstoreOutlined,
  BarcodeOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
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
import { FilterBar } from "@/components/common/FilterBar";
import { BulkUploadWizard } from "@/components/common/BulkUploadWizard";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import dayjs from "dayjs";
import { DateRangeFilter, ExportExcelButton, inDateRange, type DateRange } from "@/components/common/ReportTools";
import { exportTable, rangeLabel } from "@/lib/utils/excelExport";

const BULK_CATEGORIES = ["PUMP", "MOTOR", "CONTROLLER"];
const BULK_STATUSES = ["Generated", "Registered", "Replaced"];
/** Bulk-upload Status cell → canonical value; blank means "Generated" (same default as the form). */
function bulkStatus(v: any): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "Generated";
  return BULK_STATUSES.find((x) => s === x.toLowerCase() || s.startsWith(x.toLowerCase() + " ")) || null;
}
const MONTHS_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/**
 * Bulk-upload date cell → "YYYY-MM-DD". Accepts Excel date cells (serial numbers), DD-MM-YYYY, DD/MM/YYYY,
 * DD.MM.YYYY, DD-MMM-YYYY and YYYY-MM-DD. Blank → "" (field left empty); anything else → null (invalid).
 */
function sheetDate(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return "";
  let d: dayjs.Dayjs | null = null;
  let m: RegExpMatchArray | null;
  if (/^\d{5}(\.\d+)?$/.test(s)) d = dayjs("1899-12-30").add(Math.floor(Number(s)), "day");
  else if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) d = ymd(+m[1], +m[2], +m[3]);
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) d = ymd(year(m[3]), +m[2], +m[1]);
  else if ((m = s.match(/^(\d{1,2})[-/. ]([a-z]{3})[a-z]*[-/. ,]+(\d{2}|\d{4})$/i))) d = ymd(year(m[3]), MONTHS_SHORT.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return d && d.isValid() ? d.format("YYYY-MM-DD") : null;
}
const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
function ymd(y: number, mo: number, day: number): dayjs.Dayjs | null {
  if (mo < 1 || mo > 12 || day < 1 || day > 31 || y < 1900 || y > 2100) return null;
  const d = dayjs(new Date(y, mo - 1, day));
  return d.month() === mo - 1 && d.date() === day ? d : null; // rejects 31-02-2026 etc.
}

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
  const [range, setRange] = useState<DateRange>(null); // added-on date

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

  const filtered = stickers.filter((s) => {
    const matchesSearch =
      !search ||
      s.SerialNo.toLowerCase().includes(search.toLowerCase()) ||
      (s.InvoiceNo && s.InvoiceNo.toLowerCase().includes(search.toLowerCase())) ||
      (s.ModelName && s.ModelName.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = !categoryFilter || s.Category === categoryFilter;
    const matchesStatus = !statusFilter || s.Status === statusFilter;
    return matchesSearch && matchesCat && matchesStatus && inDateRange(s.InsertedOn, range);
  });

  const exportExcel = () => exportTable("Serial & Sticker Register", [
    { header: "Serial No", value: (s: Sticker) => s.SerialNo },
    { header: "Category", value: (s: Sticker) => s.Category },
    { header: "Model Name", value: (s: Sticker) => s.ModelName || "Standard Model" },
    { header: "Model Code", value: (s: Sticker) => s.ModelCode },
    { header: "Status", value: (s: Sticker) => s.Status },
    { header: "Invoice No", value: (s: Sticker) => s.InvoiceNo },
    { header: "Invoice Location", value: (s: Sticker) => s.InvoiceLocation },
    { header: "Mfg Date", value: (s: Sticker) => s.MfgDate, type: "date" },
    { header: "Added On", value: (s: Sticker) => s.InsertedOn, type: "datetime" },
  ], filtered, { "Added On": rangeLabel(range), Category: categoryFilter, Status: statusFilter, Search: search || null }, "Serials");

  // Bulk upload columns spec — same fields, in the same order, as the Register Serial form.
  const modelByCode = new Map(productModels.map((m) => [String(m.ModelCode || "").trim().toUpperCase(), m]));
  const bulkColumns = [
    { key: "SerialNo", header: "Serial No", required: true },
    { key: "Category", header: "Category", required: true,
      validate: (v: string) => (BULK_CATEGORIES.includes(v.toUpperCase()) ? null : "Category must be PUMP, MOTOR or CONTROLLER") },
    { key: "ModelCode", header: "Model Code", required: true,
      validate: (v: string, raw: any) => {
        const model = modelByCode.get(v.toUpperCase());
        if (!model) return `Model Code "${v}" is not in Product Models`;
        const cat = String(raw?.Category ?? raw?.category ?? "").trim().toUpperCase();
        return cat && model.Category && model.Category !== cat ? `Model ${v} is a ${model.Category} model, not ${cat}` : null;
      } },
    { key: "ProductGroup", header: "Product Group", required: false,
      validate: (v: string) => (v.length > 60 ? "Product Group can be at most 60 characters" : null) },
    { key: "Status", header: "Status", required: false,
      validate: (v: string) => (bulkStatus(v) ? null : "Status must be Generated, Registered or Replaced") },
    { key: "MfgDate", header: "Manufacturing Date", required: false,
      validate: (v: string) => (sheetDate(v) ? null : `Manufacturing Date "${v}" is not a valid date (use DD-MM-YYYY)`) },
    { key: "InvoiceNo", header: "Invoice No", required: false },
    { key: "InvoiceDate", header: "Invoice Date", required: false,
      validate: (v: string) => (sheetDate(v) ? null : `Invoice Date "${v}" is not a valid date (use DD-MM-YYYY)`) },
    { key: "InvoiceLocation", header: "Invoice Location", required: false },
    { key: "SupplierName", header: "Supplier Name", required: false },
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
          <ExportExcelButton onExport={exportExcel} disabled={!filtered.length} />
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
      <FilterBar
        storageKey="stickers"
        search={{ value: search, onChange: setSearch, placeholder: "Search by Serial No, Invoice, or Model..." }}
        filters={[
          { key: "date", label: "Added on", icon: <CalendarOutlined />, pinned: true, active: !!(range?.[0] || range?.[1]), onClear: () => setRange(null),
            render: () => <DateRangeFilter variant="borderless" value={range} onChange={setRange} placeholder={["From", "To"]} className="" /> },
          { key: "status", label: "Status", icon: <CheckCircleOutlined />, pinned: true, active: !!statusFilter, onClear: () => setStatusFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear value={statusFilter} onChange={setStatusFilter} popupMatchSelectWidth={false}
              options={[{ value: "Generated", label: "Generated (In Stock)" }, { value: "Registered", label: "Registered (Installed)" }, { value: "Replaced", label: "Replaced" }]} /> },
          { key: "category", label: "Category", group: "Serial details", icon: <AppstoreOutlined />, active: !!categoryFilter, onClear: () => setCategoryFilter(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear value={categoryFilter} onChange={setCategoryFilter} popupMatchSelectWidth={false}
              options={[{ value: "PUMP", label: "Pump" }, { value: "MOTOR", label: "Motor" }, { value: "CONTROLLER", label: "Controller" }]} /> },
        ]}
      />

      {/* Register Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <Table
          dataSource={filtered}
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
            </Form.Item></div>
<div className="entry-field-wide"><Form.Item
              name="ProductGroup"
              label={<span className="text-xs font-semibold text-slate-700">Product Group</span>}
              rules={[{ max: 60, message: "Product group can be at most 60 characters" }]}
            >
              <Input placeholder="Enter Product Group" maxLength={60} />
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
            ProductGroup: "Solar Submersible Pump Set",
            Status: "Generated",
            MfgDate: "01-11-2026",
            InvoiceNo: "SI/26/5001",
            InvoiceDate: "05-11-2026",
            InvoiceLocation: "Greater Noida HO",
            SupplierName: "Solartive Techno Industries",
          },
        ]}
        onUpload={async (validRows) => {
          // Send what the form would: model/category/status in canonical case, dates as YYYY-MM-DD.
          const rows = validRows.map((r) => ({
            ...r,
            Category: String(r.Category || "").trim().toUpperCase(),
            ModelCode: String(r.ModelCode || "").trim().toUpperCase(),
            Status: bulkStatus(r.Status) || "Generated",
            MfgDate: sheetDate(r.MfgDate) || null,
            InvoiceDate: sheetDate(r.InvoiceDate) || null,
          }));
          const res = await bulkUploadStickers(rows);
          return res;
        }}
        onClose={() => setBulkOpen(false)}
      />
    </div>
  );
}
