"use client";

import React, { useEffect, useState } from "react";
import { Button, Input, Select, Table, Tag } from "antd";
import { PlusOutlined, ReloadOutlined, SearchOutlined, ToolOutlined } from "@ant-design/icons";
import { useJobCardStore, JobCard } from "@/lib/store/useJobCardStore";
import { JobCardFormDrawer } from "@/components/service/JobCardFormDrawer";
import { JobCardViewDrawer, JOBCARD_STATUS_COLOR } from "@/components/service/JobCardViewDrawer";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { JOBCARD_STATUSES } from "@/lib/config/service";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";

export default function JobCardsPage() {
  const { jobCards, fetchJobCards, isLoading } = useJobCardStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>();
  const [formState, setFormState] = useState<{ open: boolean; jobCardId?: string | null; complaintId?: string | null }>({ open: false });
  const [viewId, setViewId] = useState<string | null>(null);

  const refresh = () => fetchJobCards().catch((err) => reportFormError(err, { fallback: "Could not load job cards" }));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ?call=<ComplaintId> opens a new job card for that call; ?open=<JobCardId> (global search) opens the card.
  useUrlQuery("call", (call) => setFormState({ open: true, complaintId: call }));
  useUrlQuery("open", (id) => setViewId(id));

  const filtered = jobCards.filter((j) => {
    const q = search.toLowerCase();
    return (!q || [j.JobCardNo, j.ComplaintNo, j.CustomerName, j.Mobile].some((v) => v?.toLowerCase().includes(q))) && (!statusFilter || j.Status === statusFilter);
  });
  const count = (s: string) => jobCards.filter((j) => j.Status === s).length;

  const columns = [
    { title: "Job Card", dataIndex: "JobCardNo", key: "no", width: 140, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Date", dataIndex: "JobCardDate", key: "date", width: 100, render: (v: string) => formatDate(v) },
    { title: "Call / Customer", key: "call", render: (_: any, j: JobCard) => <div><div className="font-mono text-xs text-slate-500">{j.ComplaintNo}</div><div className="font-semibold text-slate-800">{j.CustomerName}</div></div> },
    { title: "Engineer / Center", key: "eng", render: (_: any, j: JobCard) => <div className="text-xs"><div className="font-medium text-slate-800">{j.EngineerName?.trim() || "Unassigned"}</div><div className="text-slate-400">{j.ServiceCenterName || "-"}</div></div> },
    { title: "Total ₹", dataIndex: "TotalEstimate", key: "total", width: 110, align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
    { title: "Warranty ₹", dataIndex: "WarrantyAmount", key: "w", width: 110, align: "right" as const, render: (v: number) => <span className="text-emerald-700">{inr(v, 2)}</span> },
    { title: "Customer Pays ₹", dataIndex: "CustomerPayable", key: "p", width: 130, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Level", key: "lvl", width: 110, render: (_: any, j: JobCard) => j.Status === "In Approval" ? <div className="text-xs"><b>L{j.LevelPosition} of {j.LevelsRequired}</b><div className="text-slate-400">{j.PendingRole}</div></div> : "—" },
    { title: "Status", dataIndex: "Status", key: "status", width: 120, render: (s: string, j: JobCard) => <span><Tag color={JOBCARD_STATUS_COLOR[s]}>{s}</Tag>{j.CanAct && <Tag color="magenta">Your turn</Tag>}</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<ToolOutlined />} title="Job Cards (Repair Estimate)" subtitle="Spares and labour estimate for a service call · multi-level approval by amount · stock is consumed on final approval"
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={isLoading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormState({ open: true })} className="bg-blue-600 shadow-sm">New Job Card</Button>
        </>} />

      <StatStrip items={[
        { label: "Draft", value: count("Draft") },
        { label: "In approval", value: count("In Approval"), tone: "warn" },
        { label: "Approved", value: count("Approved"), tone: "ok" },
        { label: "Rejected", value: count("Rejected"), tone: "danger" },
        { label: "Closed", value: count("Closed") },
        { label: "Customer payable ₹", value: inr(jobCards.reduce((s, j) => s + Number(j.CustomerPayable || 0), 0)) },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search job card, call no, customer, mobile..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select placeholder="All Statuses" value={statusFilter} onChange={setStatusFilter} allowClear className="w-40" options={JOBCARD_STATUSES.map((s) => ({ value: s, label: s }))} />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="JobCardId" size="middle" loading={isLoading} scroll={{ x: 1150 }} pagination={{ defaultPageSize: 15, showSizeChanger: true }}
          onRow={(j) => ({ onClick: () => setViewId(j.JobCardId), className: "cursor-pointer" })} />
      </div>

      <JobCardFormDrawer open={formState.open} jobCardId={formState.jobCardId} complaintId={formState.complaintId}
        onClose={() => setFormState({ open: false })}
        onSaved={(id) => { setFormState({ open: false }); refresh(); setViewId(id); }} />
      <JobCardViewDrawer jobCardId={viewId} onClose={() => setViewId(null)} onChanged={refresh}
        onEdit={(id) => { setViewId(null); setFormState({ open: true, jobCardId: id }); }} />
    </div>
  );
}
