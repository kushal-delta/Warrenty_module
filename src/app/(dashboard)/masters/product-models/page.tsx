"use client";

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
  Switch,
  message,
} from "antd";
import {
  AppstoreOutlined,
  PlusOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useMasterStore, ProductModel } from "@/lib/store/useMasterStore";
import {
  DrawerHeader,
  DrawerChip,
  DRAWER_WIDTH,
  DRAWER_HEADER_STYLE,
} from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { BulkUploadWizard } from "@/components/common/BulkUploadWizard";
import { reportFormError } from "@/lib/utils/formErrors";

export default function ProductModelsPage() {
  const [form] = Form.useForm();
  const {
    productModels,
    fetchProductModels,
    addProductModel,
    updateProductModel,
    deleteProductModel,
    bulkUploadProductModels,
    isLoading,
  } = useMasterStore();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editingModel, setEditingModel] = useState<ProductModel | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingModel, setDeletingModel] = useState<ProductModel | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk modal state
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    fetchProductModels();
  }, [fetchProductModels]);

  const handleOpenCreate = () => {
    setEditingModel(null);
    form.resetFields();
    form.setFieldsValue({
      Category: "PUMP",
      WarrantyMonths: 24,
      IsActive: true,
      Hp: "3",
      Kw: "2.2",
    });
    setDrawerOpen(true);
  };

  const handleOpenEdit = (model: ProductModel) => {
    setEditingModel(model);
    form.resetFields();
    form.setFieldsValue({ ...model });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingModel) {
        await updateProductModel({
          ProductModelId: editingModel.ProductModelId,
          ...values,
        });
        message.success(`Model ${values.ModelCode} updated successfully`);
      } else {
        await addProductModel(values);
        message.success(`Model ${values.ModelCode} created successfully in database`);
      }

      setDrawerOpen(false);
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Could not save product model" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingModel) return;
    try {
      setDeleting(true);
      await deleteProductModel(deletingModel.ProductModelId);
      message.success(`Model ${deletingModel.ModelCode} deleted from database`);
      setDeleteModalOpen(false);
      setDeletingModel(null);
    } catch (err: any) {
      message.error(err.response?.data?.error || "Could not delete product model");
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      title: "Model Code",
      dataIndex: "ModelCode",
      key: "ModelCode",
      width: 140,
      render: (code: string) => (
        <span className="font-mono font-bold text-blue-700">{code}</span>
      ),
    },
    {
      title: "Category",
      dataIndex: "Category",
      key: "Category",
      width: 110,
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
      render: (name: string, row: ProductModel) => (
        <div>
          <div className="font-semibold text-slate-800 whitespace-normal break-words leading-tight">
            {name}
          </div>
          {row.Technology && (
            <div className="text-[11px] text-slate-400 mt-0.5">{row.Technology}</div>
          )}
        </div>
      ),
    },
    {
      title: "Rating (HP / kW)",
      key: "rating",
      width: 130,
      render: (_: any, row: ProductModel) => (
        <span className="text-xs font-mono font-medium text-slate-700">
          {row.Hp ? `${row.Hp} HP` : "-"} {row.Kw ? `(${row.Kw} kW)` : ""}
        </span>
      ),
    },
    {
      title: "Standard Warranty",
      dataIndex: "WarrantyMonths",
      key: "WarrantyMonths",
      width: 140,
      render: (m: number) => (
        <span className="text-xs font-semibold text-slate-800">{m} Months</span>
      ),
    },
    {
      title: "Status",
      dataIndex: "IsActive",
      key: "IsActive",
      width: 100,
      render: (active: boolean) => (
        <Tag color={active ? "success" : "default"}>{active ? "Active" : "Inactive"}</Tag>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_: any, record: ProductModel) => (
        <Space size="small">
          <Tooltip title="Edit Model">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined className="text-blue-600" />}
              onClick={() => handleOpenEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Delete Model">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setDeletingModel(record);
                setDeleteModalOpen(true);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const filtered = productModels.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      m.ModelCode.toLowerCase().includes(q) ||
      m.ModelName.toLowerCase().includes(q) ||
      (m.Technology && m.Technology.toLowerCase().includes(q));
    const matchCat = !categoryFilter || m.Category === categoryFilter;
    return matchSearch && matchCat;
  });

  const bulkColumns = [
    { key: "ModelCode", header: "Model Code", required: true },
    { key: "ModelName", header: "Model Name", required: true },
    { key: "Category", header: "Category", required: true },
    { key: "Hp", header: "Hp", required: false },
    { key: "Kw", header: "Kw", required: false },
    { key: "WarrantyMonths", header: "Warranty Months", required: false },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <AppstoreOutlined className="text-blue-600" />
            Product Models Master
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configured pump, motor, and controller models with warranty durations and technical specifications
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchProductModels()}
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
            Add Model
          </Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <Input
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search models by code, name, technology..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="w-80"
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="ProductModelId"
          size="middle"
          loading={isLoading}
          pagination={{ pageSize: 15 }}
          scroll={{ x: 900 }}
        />
      </div>

      {/* Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        closable={false}
        width={maximized ? "100%" : DRAWER_WIDTH}
        styles={{ header: DRAWER_HEADER_STYLE }}
        destroyOnClose
        title={
          <DrawerHeader
            icon={<AppstoreOutlined />}
            title={editingModel ? "Edit Product Model" : "Create Product Model"}
            subtitle="Configure model parameters and warranty rules"
            meta={
              editingModel ? (
                <>
                  <DrawerChip label={editingModel.ModelCode} tone="solid" />
                  <DrawerChip label={editingModel.Category} />
                </>
              ) : (
                <DrawerChip label="New Model" tone="solid" />
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
              {editingModel ? "Save Changes" : "Create Model"}
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" requiredMark={false} className="py-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
            <Form.Item
              name="ModelCode"
              label={<span className="text-xs font-semibold text-slate-700">Model Code</span>}
              rules={[{ required: true, message: "Model code is required" }]}
            >
              <Input placeholder="e.g. SSP-30-DC" className="font-mono uppercase" />
            </Form.Item>

            <Form.Item
              name="Category"
              label={<span className="text-xs font-semibold text-slate-700">Category</span>}
              rules={[{ required: true, message: "Category is required" }]}
            >
              <Select placeholder="Select category">
                <Select.Option value="PUMP">Pump</Select.Option>
                <Select.Option value="MOTOR">Motor</Select.Option>
                <Select.Option value="CONTROLLER">Controller</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="WarrantyMonths"
              label={<span className="text-xs font-semibold text-slate-700">Standard Warranty (Months)</span>}
              rules={[{ required: true }]}
            >
              <Input type="number" placeholder="24" />
            </Form.Item>
          </div>

          <Form.Item
            name="ModelName"
            label={<span className="text-xs font-semibold text-slate-700">Full Model Name</span>}
            rules={[{ required: true, message: "Model name is required" }]}
          >
            <Input placeholder="e.g. Solartive SolarFlow 3 HP DC Submersible Pump (4\u0022)" />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-x-4">
            <Form.Item
              name="Hp"
              label={<span className="text-xs font-semibold text-slate-700">Power (HP)</span>}
            >
              <Input placeholder="3" />
            </Form.Item>

            <Form.Item
              name="Kw"
              label={<span className="text-xs font-semibold text-slate-700">Power (kW)</span>}
            >
              <Input placeholder="2.2" />
            </Form.Item>

            <Form.Item
              name="SizeInch"
              label={<span className="text-xs font-semibold text-slate-700">Outer Size</span>}
            >
              <Input placeholder="4 Inch" />
            </Form.Item>

            <Form.Item
              name="IsActive"
              label={<span className="text-xs font-semibold text-slate-700">Status</span>}
              valuePropName="checked"
            >
              <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
            </Form.Item>
          </div>

          <Form.Item
            name="Technology"
            label={<span className="text-xs font-semibold text-slate-700">Technology / Type</span>}
          >
            <Input placeholder="Multistage centrifugal, DC BLDC, MPPT..." />
          </Form.Item>

          <Form.Item
            name="Description"
            label={<span className="text-xs font-semibold text-slate-700">Technical Description</span>}
          >
            <Input.TextArea rows={2} placeholder="Shaft material, protection grade, voltage range..." />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteModalOpen}
        title="Delete Product Model"
        description={`Are you sure you want to delete ${deletingModel?.ModelCode}?`}
        items={deletingModel ? [deletingModel.ModelCode, deletingModel.ModelName] : []}
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeletingModel(null);
        }}
      />

      {/* Bulk Upload Wizard */}
      <BulkUploadWizard
        open={bulkOpen}
        title="Bulk Upload Product Models"
        templateFileName="Product_Models"
        columns={bulkColumns}
        sampleData={[
          {
            ModelCode: "SSP-50-DC",
            ModelName: "Solartive SolarFlow 5 HP DC Pump",
            Category: "PUMP",
            Hp: "5",
            Kw: "3.7",
            WarrantyMonths: 24,
          },
        ]}
        onUpload={async (validRows) => {
          const res = await bulkUploadProductModels(validRows);
          return res;
        }}
        onClose={() => setBulkOpen(false)}
      />
    </div>
  );
}
