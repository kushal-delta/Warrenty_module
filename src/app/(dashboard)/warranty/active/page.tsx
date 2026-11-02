"use client";

import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Tag,
  Input,
  Select,
  Modal,
  Space,
  Tooltip,
} from "antd";
import {
  SafetyCertificateOutlined,
  QrcodeOutlined,
  SearchOutlined,
  ReloadOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import { useWarrantyStore, Warranty } from "@/lib/store/useWarrantyStore";
import { formatDate } from "@/lib/utils/dateFormat";
import QRCode from "qrcode";

export default function ActiveWarrantiesPage() {
  const { warranties, fetchWarranties, isLoading } = useWarrantyStore();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  // QR Modal state
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState<Warranty | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    fetchWarranties();
  }, [fetchWarranties]);

  const handleOpenQr = async (w: Warranty) => {
    setSelectedWarranty(w);
    try {
      const qrText = `https://solartive.example/verify?serial=${w.SerialNo}`;
      const url = await QRCode.toDataURL(qrText, { width: 220, margin: 1 });
      setQrDataUrl(url);
    } catch (_) {
      setQrDataUrl("");
    }
    setQrModalOpen(true);
  };

  const columns = [
    {
      title: "Warranty No",
      dataIndex: "WarrantyNo",
      key: "WarrantyNo",
      render: (no: string) => <span className="font-semibold text-blue-700">{no}</span>,
    },
    {
      title: "Serial No",
      dataIndex: "SerialNo",
      key: "SerialNo",
      render: (serial: string) => (
        <span className="font-mono font-bold text-slate-800">{serial}</span>
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
      title: "Customer & Site",
      key: "customer",
      render: (_: any, row: Warranty) => (
        <div>
          <div className="font-semibold text-slate-900">{row.CustomerName || "Customer"}</div>
          <div className="text-xs text-slate-500">
            {row.CustomerMobile} {row.Village ? `• ${row.Village}` : ""} {row.District ? `(${row.District})` : ""}
          </div>
        </div>
      ),
    },
    {
      title: "Validity Status",
      key: "status",
      width: 170,
      render: (_: any, row: Warranty) => {
        const isExpired = row.isExpired;
        return (
          <div className="space-y-1">
            <Tag
              color={isExpired ? "default" : "success"}
              icon={isExpired ? <CloseCircleOutlined /> : <CheckCircleOutlined />}
              className="font-medium"
            >
              {isExpired ? "Warranty Expired" : "Under Warranty"}
            </Tag>
            {!isExpired && (
              <div className="text-[11px] text-emerald-700 font-semibold">
                {row.daysLeft} days remaining
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "Period",
      key: "period",
      width: 150,
      render: (_: any, row: Warranty) => (
        <div className="text-xs text-slate-600">
          <div>From: {formatDate(row.StartDate, false)}</div>
          <div>To: {formatDate(row.EndDate, false)}</div>
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 110,
      render: (_: any, row: Warranty) => (
        <Space size="small">
          <Tooltip title="View QR Card">
            <Button
              type="text"
              size="small"
              icon={<QrcodeOutlined className="text-blue-600 text-base" />}
              onClick={() => handleOpenQr(row)}
            />
          </Tooltip>
          <Tooltip title="Print Certificate">
            <Button
              type="text"
              size="small"
              icon={<PrinterOutlined className="text-slate-600" />}
              onClick={() => handleOpenQr(row)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const filtered = warranties.filter((w) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      w.SerialNo.toLowerCase().includes(q) ||
      w.WarrantyNo.toLowerCase().includes(q) ||
      (w.CustomerName && w.CustomerName.toLowerCase().includes(q)) ||
      (w.CustomerMobile && w.CustomerMobile.includes(q));
    const matchCat = !categoryFilter || w.Category === categoryFilter;
    const matchStatus =
      !statusFilter ||
      (statusFilter === "Active" && !w.isExpired) ||
      (statusFilter === "Expired" && w.isExpired);
    return matchSearch && matchCat && matchStatus;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <SafetyCertificateOutlined className="text-blue-600" />
            Active Warranty Register
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Active warranties linked to registered installations with real-time status and expiry
          </p>
        </div>

        <Button
          icon={<ReloadOutlined />}
          onClick={() => fetchWarranties()}
          loading={isLoading}
        >
          Refresh Register
        </Button>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <Input
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search by Serial No, Customer Name, Mobile..."
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

        <Select
          placeholder="All Statuses"
          value={statusFilter}
          onChange={setStatusFilter}
          allowClear
          className="w-40"
        >
          <Select.Option value="Active">Under Warranty</Select.Option>
          <Select.Option value="Expired">Expired</Select.Option>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="WarrantyId"
          size="middle"
          loading={isLoading}
          pagination={{ pageSize: 15, showTotal: (total) => `Total ${total} warranties` }}
          scroll={{ x: 1000 }}
        />
      </div>

      {/* QR Certificate Modal */}
      <Modal
        open={qrModalOpen}
        title={
          <div className="flex items-center space-x-2 text-slate-800">
            <SafetyCertificateOutlined className="text-blue-600" />
            <span>Digital Warranty Card & QR</span>
          </div>
        }
        onCancel={() => setQrModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setQrModalOpen(false)}>
            Close
          </Button>,
          <Button
            key="print"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => window.print()}
            className="bg-blue-600"
          >
            Print Card
          </Button>,
        ]}
        centered
      >
        {selectedWarranty && (
          <div className="py-4 space-y-4 text-center">
            {qrDataUrl && (
              <div className="inline-block p-3 bg-white rounded-xl border border-slate-200 shadow-md">
                <img src={qrDataUrl} alt="Serial QR" className="w-44 h-44 mx-auto" />
                <div className="font-mono font-bold text-slate-800 mt-2 text-sm">
                  {selectedWarranty.SerialNo}
                </div>
              </div>
            )}

            <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-slate-500">Warranty Card No:</span>
                <span className="font-bold text-slate-800">{selectedWarranty.WarrantyNo}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-slate-500">Component / Category:</span>
                <span className="font-semibold text-slate-800">{selectedWarranty.Category}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-slate-500">Beneficiary Customer:</span>
                <span className="font-semibold text-slate-800">{selectedWarranty.CustomerName}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-slate-500">Mobile:</span>
                <span className="font-semibold text-slate-800">{selectedWarranty.CustomerMobile}</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-slate-500">Valid From:</span>
                <span>{formatDate(selectedWarranty.StartDate, false)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valid Until:</span>
                <span className="font-bold text-blue-700">
                  {formatDate(selectedWarranty.EndDate, false)}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
