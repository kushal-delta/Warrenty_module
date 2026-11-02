"use client";

import React, { useEffect } from "react";
import { Card, Table, Tag, Button, Spin, Row, Col } from "antd";
import {
  SafetyCertificateOutlined,
  BarcodeOutlined,
  CustomerServiceOutlined,
  ShopOutlined,
  PlusOutlined,
  SearchOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { useDashboardStore } from "@/lib/store/useDashboardStore";
import { formatDate } from "@/lib/utils/dateFormat";

export default function DashboardPage() {
  const { stats, fetchStats, isLoading } = useDashboardStore();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const recentWarrantyColumns = [
    {
      title: "Warranty No",
      dataIndex: "WarrantyNo",
      key: "WarrantyNo",
      render: (text: string) => <span className="font-semibold text-blue-700">{text}</span>,
    },
    {
      title: "Serial No",
      dataIndex: "SerialNo",
      key: "SerialNo",
      render: (text: string) => <span className="font-mono font-medium">{text}</span>,
    },
    {
      title: "Category",
      dataIndex: "Category",
      key: "Category",
      render: (cat: string) => (
        <Tag color={cat === "PUMP" ? "blue" : cat === "MOTOR" ? "cyan" : "purple"}>
          {cat}
        </Tag>
      ),
    },
    {
      title: "Customer",
      dataIndex: "CustomerName",
      key: "CustomerName",
      render: (val: string) => val || "-",
    },
    {
      title: "Valid Until",
      dataIndex: "EndDate",
      key: "EndDate",
      render: (date: string) => formatDate(date, false),
    },
  ];

  const recentComplaintColumns = [
    {
      title: "Complaint No",
      dataIndex: "ComplaintNo",
      key: "ComplaintNo",
      render: (text: string) => <span className="font-semibold text-slate-800">{text}</span>,
    },
    {
      title: "Customer",
      dataIndex: "CustomerName",
      key: "CustomerName",
    },
    {
      title: "Call Type",
      dataIndex: "CallTypeName",
      key: "CallTypeName",
      render: (val: string) => <span className="text-xs text-slate-600">{val || "Warranty"}</span>,
    },
    {
      title: "Priority",
      dataIndex: "Priority",
      key: "Priority",
      render: (p: string) => {
        const color = p === "High" ? "red" : p === "Urgent" ? "magenta" : "orange";
        return <Tag color={color}>{p}</Tag>;
      },
    },
    {
      title: "Status",
      dataIndex: "Status",
      key: "Status",
      render: (s: string) => {
        const color =
          s === "New" ? "blue" : s === "Assigned" ? "purple" : s === "Closed" ? "green" : "default";
        return <Tag color={color}>{s}</Tag>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 bg-blue-500/20 px-3 py-1 rounded-full text-xs font-semibold text-blue-200 border border-blue-400/30 mb-2">
            <span>Solartive Techno Industries</span>
            <span>•</span>
            <span>Real-time PostgreSQL</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Warranty & Service Command Center
          </h1>
          <p className="text-sm text-blue-200/80 mt-1 max-w-2xl">
            Live tracking of component serial stickers, installation registrations, warranty
            claims, and field complaints.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link href="/warranty/verify">
            <Button
              size="large"
              icon={<SearchOutlined />}
              className="bg-white/10 hover:bg-white/20 text-white border-white/30 backdrop-blur-xs font-semibold"
            >
              Verify Serial
            </Button>
          </Link>
          <Link href="/warranty/register">
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-md border-none"
            >
              Register Unit
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Stickers */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Serials
            </span>
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-lg">
              <BarcodeOutlined />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {stats?.stickers?.total ?? 0}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
            <span className="text-green-600 font-medium">
              ● {stats?.stickers?.registered ?? 0} Registered
            </span>
            <span>● {stats?.stickers?.in_stock ?? 0} In Stock</span>
          </div>
        </div>

        {/* Card 2: Active Warranties */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Active Warranties
            </span>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
              <SafetyCertificateOutlined />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {stats?.warranties?.active ?? 0}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
            <span className="text-emerald-600 font-medium">
              ● {stats?.warranties?.active ?? 0} Under Coverage
            </span>
            <span className="text-slate-400">
              ● {stats?.warranties?.expired ?? 0} Expired
            </span>
          </div>
        </div>

        {/* Card 3: Complaints */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Service Complaints
            </span>
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-lg">
              <CustomerServiceOutlined />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {stats?.complaints?.total ?? 0}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Tag color="blue" className="mr-0 text-[11px]">
              {stats?.complaints?.new_count ?? 0} New
            </Tag>
            <Tag color="purple" className="mr-0 text-[11px]">
              {stats?.complaints?.assigned_count ?? 0} Assigned
            </Tag>
            <Tag color="green" className="mr-0 text-[11px]">
              {stats?.complaints?.closed_count ?? 0} Closed
            </Tag>
          </div>
        </div>

        {/* Card 4: Dealers */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Authorized Dealers
            </span>
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-lg">
              <ShopOutlined />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {stats?.dealers?.approved ?? 0}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <span>● Nationwide partner network</span>
          </div>
        </div>
      </div>

      {/* Two-Column Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Warranties */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Recent Warranty Registrations
              </h2>
              <p className="text-xs text-slate-500">Latest installations linked to serials</p>
            </div>
            <Link href="/warranty/active">
              <Button type="link" size="small" icon={<ArrowRightOutlined />}>
                View All
              </Button>
            </Link>
          </div>

          <Table
            dataSource={stats?.recentWarranties || []}
            columns={recentWarrantyColumns}
            rowKey="SerialNo"
            size="small"
            pagination={false}
          />
        </div>

        {/* Recent Service Calls */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Recent Service Complaints
              </h2>
              <p className="text-xs text-slate-500">Latest field calls and customer tickets</p>
            </div>
            <Link href="/service/complaints">
              <Button type="link" size="small" icon={<ArrowRightOutlined />}>
                View All
              </Button>
            </Link>
          </div>

          <Table
            dataSource={stats?.recentComplaints || []}
            columns={recentComplaintColumns}
            rowKey="ComplaintNo"
            size="small"
            pagination={false}
          />
        </div>
      </div>
    </div>
  );
}
