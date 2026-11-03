"use client";

import React, { useEffect, useState } from "react";
import { Button, Empty, Table, Tag } from "antd";
import { AuditOutlined, ReloadOutlined } from "@ant-design/icons";
import { useJobCardStore, JobCard } from "@/lib/store/useJobCardStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { JobCardFormDrawer } from "@/components/service/JobCardFormDrawer";
import { JobCardViewDrawer } from "@/components/service/JobCardViewDrawer";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

/** Job cards waiting on the signed-in approver. */
export default function ApprovalsPage() {
  const { fetchJobCards, isLoading } = useJobCardStore();
  const { approvalRules } = useMasterStore();
  const [pending, setPending] = useState<JobCard[]>([]);
  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const refresh = () => fetchJobCards({ pendingForMe: true }).then(setPending).catch((err) => reportFormError(err, { fallback: "Could not load approvals" }));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { title: "Job Card", dataIndex: "JobCardNo", key: "no", width: 140, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Date", dataIndex: "JobCardDate", key: "date", width: 100, render: (v: string) => formatDate(v) },
    { title: "Call / Customer", key: "call", render: (_: any, j: JobCard) => <div><div className="font-mono text-xs text-slate-500">{j.ComplaintNo}</div><div className="font-semibold text-slate-800">{j.CustomerName}</div></div> },
    { title: "Engineer / Center", key: "eng", render: (_: any, j: JobCard) => <div className="text-xs"><div className="font-medium">{j.EngineerName?.trim() || "-"}</div><div className="text-slate-400">{j.ServiceCenterName || "-"}</div></div> },
    { title: "Total ₹", dataIndex: "TotalEstimate", key: "t", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
    { title: "Warranty ₹", dataIndex: "WarrantyAmount", key: "w", align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "At Level", key: "lvl", render: (_: any, j: JobCard) => <span><Tag color="gold">L{j.LevelPosition} of {j.LevelsRequired}</Tag><span className="text-xs text-slate-500">{j.PendingRole}</span></span> },
    { title: "", key: "open", width: 90, render: (_: any, j: JobCard) => <Button size="small" type="primary" className="bg-blue-600" onClick={() => setViewId(j.JobCardId)}>Review</Button> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<AuditOutlined />} title="Job Card Approvals" subtitle="Repair estimates waiting for your decision · levels are set in Configuration → Approval Rules"
        actions={<Button icon={<ReloadOutlined />} onClick={refresh} loading={isLoading}>Refresh</Button>} />

      <StatStrip items={[
        { label: "Waiting for you", value: pending.length, tone: pending.length ? "warn" : "ok" },
        { label: "Value pending ₹", value: inr(pending.reduce((s, j) => s + Number(j.TotalEstimate || 0), 0)) },
        { label: "Active approval levels", value: approvalRules.filter((r: any) => r.IsActive).length },
      ]} />

      <div className={TABLE_CARD}>
        <Table dataSource={pending} columns={columns} rowKey="JobCardId" size="middle" loading={isLoading} scroll={{ x: 1000 }} pagination={false}
          locale={{ emptyText: <Empty description="Nothing waiting for your approval" /> }} />
      </div>

      <JobCardViewDrawer jobCardId={viewId} onClose={() => setViewId(null)} onChanged={refresh} onEdit={(id) => { setViewId(null); setEditId(id); }} />
      <JobCardFormDrawer open={!!editId} jobCardId={editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); refresh(); }} />
    </div>
  );
}
