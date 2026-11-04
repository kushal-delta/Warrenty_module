"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import dayjs from "dayjs";
import { Button, Empty, Table, Tag } from "antd";
import { DashboardOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import { DonutChart, GroupedBarChart, Legend, RankedBars, VIZ } from "@/components/dashboard/Charts";
import { PageHeader, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { PageLoader } from "@/components/common/Loader";
import { reportFormError } from "@/lib/utils/formErrors";

const STATUS_ORDER = ["New", "Assigned", "Visited", "In Approval", "Approved", "Resolved", "Closed", "Cancelled"];
const STATUS_COLOR = [VIZ.blue, VIZ.orange, VIZ.aqua, VIZ.yellow, VIZ.magenta, VIZ.green, VIZ.violet, VIZ.red];
const inrShort = (v: number) => (v >= 1e7 ? `₹ ${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹ ${(v / 1e5).toFixed(2)} L` : `₹ ${inr(v)}`);

function Card({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col min-w-0 ${className}`}>
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">{title}</h2>{aside && <span className="text-xs text-slate-400">{aside}</span>}</header>
      <div className="p-5 flex-1 min-h-0">{children}</div>
    </section>
  );
}
function Kpi({ label, value, sub, accent, href }: { label: string; value: React.ReactNode; sub: string; accent: string; href?: string }) {
  const body = (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs px-4 py-3.5 h-full hover:shadow-md transition-all" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-none">{value}</div>
      <div className="text-xs text-slate-500 mt-2">{sub}</div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

/** Service Dashboard: call-type and project-wise view of every service call. */
export default function ServiceDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await axios.post("/api/service/dashboard", {})).data); }
    catch (err) { reportFormError(err, { fallback: "Could not load the service dashboard" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) return <PageLoader label="Loading service dashboard…" hint="Calls, job cards and approvals" minHeight="60vh" />;
  const k = data.kpis;
  const counts = new Map<string, number>(data.byStatus.map((s: any) => [s.status, s.count]));
  const segments = STATUS_ORDER.map((status, i) => ({ label: status, value: counts.get(status) || 0, color: STATUS_COLOR[i] })).filter((s) => s.value > 0);
  const total = segments.reduce((s, x) => s + x.value, 0);

  // Call type × project matrix.
  const projects: string[] = Array.from(new Set<string>(data.matrix.map((m: any) => m.project)));
  const types: string[] = Array.from(new Set<string>(data.matrix.map((m: any) => m.callType)));
  const cell = (t: string, p: string) => data.matrix.find((m: any) => m.callType === t && m.project === p)?.count || 0;
  const matrixRows = types.map((t) => ({ key: t, callType: t, ...Object.fromEntries(projects.map((p) => [p, cell(t, p)])), total: projects.reduce((s, p) => s + cell(t, p), 0) }));
  const matrixColumns = [
    { title: "Call type", dataIndex: "callType", key: "t", fixed: "left" as const, render: (v: string) => <b>{v}</b> },
    ...projects.map((p) => ({ title: p, dataIndex: p, key: p, align: "right" as const, render: (v: number) => v || <span className="text-slate-300">–</span> })),
    { title: "Total", dataIndex: "total", key: "total", align: "right" as const, render: (v: number) => <b>{v}</b> },
  ];
  const a = data.ageing;

  return (
    <div className="space-y-4">
      <PageHeader icon={<DashboardOutlined />} title="Service Dashboard" subtitle="Call-type and project-wise view of every service call"
        actions={<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>} />

      <div className={`space-y-4 transition-opacity ${loading ? "opacity-70" : ""}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
          <Kpi label="Open calls" value={k.open} sub={`${k.notAssigned} not yet assigned`} accent="#2563eb" href="/service/complaints" />
          <Kpi label="Overdue (past valid days)" value={k.overdue} sub="need escalation" accent="#dc2626" href="/service/complaints" />
          <Kpi label="Resolved / closed this month" value={k.doneThisMonth} sub={`avg ${k.avgDaysToResolve} days to resolve`} accent="#0d9488" />
          <Kpi label="Job cards awaiting approval" value={k.approvalCount} sub={`₹ ${inr(k.approvalAmount)}`} accent="#7c3aed" href="/service/approvals" />
          <Kpi label="Warranty cost (approved)" value={inrShort(k.warrantyCost)} sub="borne by company" accent="#16a34a" href="/service/reports" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card title="Calls by status">
            <div className="flex flex-col items-center gap-5"><DonutChart segments={segments} centerValue={total} centerLabel="calls" size={200} /><Legend items={segments.map((s) => ({ label: s.label, color: s.color, value: s.value }))} /></div>
          </Card>
          <Card title="Last 6 months · booked vs closed">
            <GroupedBarChart categories={data.months.map((m: any) => dayjs(m.month).format("MMM YY"))}
              series={[{ name: "Booked", color: VIZ.blue, values: data.months.map((m: any) => m.booked) }, { name: "Closed", color: VIZ.aqua, values: data.months.map((m: any) => m.closed) }]} />
            <div className="mt-3"><Legend items={[{ label: "Booked", color: VIZ.blue, value: data.months.reduce((s: number, m: any) => s + m.booked, 0) }, { label: "Closed", color: VIZ.aqua, value: data.months.reduce((s: number, m: any) => s + m.closed, 0) }]} /></div>
          </Card>
        </div>

        <Card title="Call type × project" aside="open + closed calls">
          <div className="-m-5"><Table size="middle" rowKey="key" dataSource={matrixRows} columns={matrixColumns} pagination={false} scroll={{ x: 600 }} locale={{ emptyText: "No calls yet" }} /></div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Open calls by age"><RankedBars items={[{ name: "0-3 days", value: a.d0_3 }, { name: "4-7 days", value: a.d4_7 }, { name: "8-15 days", value: a.d8_15 }, { name: "Over 15 days", value: a.d15plus }]} color={VIZ.orange} /></Card>
          <Card title="Open calls by service center">{data.centers.length ? <RankedBars items={data.centers.map((c: any) => ({ name: c.name, value: c.count }))} color={VIZ.blue} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No open calls" />}</Card>
          <Card title="Top faults found">{data.faults.length ? <RankedBars items={data.faults.map((f: any) => ({ name: f.name, value: f.count }))} color={VIZ.red} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No faults recorded yet" />}</Card>
        </div>

        <section className={TABLE_CARD}>
          <header className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Needs attention</h2><span className="text-xs text-slate-400">overdue or unassigned</span></header>
          <Table size="middle" rowKey="ComplaintId" dataSource={data.attention} pagination={false} scroll={{ x: 640 }} locale={{ emptyText: "All clear — nothing overdue or unassigned" }} columns={[
            { title: "Call", dataIndex: "ComplaintNo", render: (v: string) => <Link href={`/service/complaints?q=${encodeURIComponent(v)}`} className="font-mono font-bold text-blue-700">{v}</Link> },
            { title: "Customer", dataIndex: "CustomerName" },
            { title: "Place", key: "p", render: (_: any, r: any) => [r.Village, r.District].filter(Boolean).join(", ") || "—" },
            { title: "Due", dataIndex: "DueDate", render: (v: string) => <span className={v && dayjs(v).isBefore(dayjs(), "day") ? "font-bold text-red-600" : ""}>{v ? dayjs(v).format("DD-MMM-YYYY") : "—"}</span> },
            { title: "Status", dataIndex: "Status", render: (s: string) => <Tag>{s}</Tag> },
            { title: "", key: "go", width: 40, render: (_: any, r: any) => <Link href={`/service/complaints?q=${encodeURIComponent(r.ComplaintNo)}`}><RightOutlined className="text-slate-300" /></Link> },
          ]} />
        </section>
      </div>
    </div>
  );
}
