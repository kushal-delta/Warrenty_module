"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Alert, Button, Card, Empty, Skeleton, Table, Tag } from "antd";
import { BarChartOutlined, ReloadOutlined, DownloadOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";

const colors = ["#2563eb", "#0d9488", "#8b5cf6", "#f59e0b", "#64748b", "#e11d48", "#06b6d4", "#16a34a"];
const n = (v: unknown) => Number(v || 0);
const money = (v: unknown) => `₹${n(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
type Count = { Name: string; Count: number };

function Breakdown({ title, rows }: { title: string; rows: Count[] }) {
  const max = Math.max(1, ...rows.map(r => n(r.Count)));
  return <Card title={title} className="h-full"><div className="space-y-4">{rows.length ? rows.map((r, i) => <div key={r.Name}><div className="mb-2 flex justify-between gap-3 text-xs"><span className="text-slate-600">{r.Name}</span><b>{r.Count}</b></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${n(r.Count) / max * 100}%`, background: colors[i % colors.length] }} /></div></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No records yet" />}</div></Card>;
}

export default function ServiceDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try { setData((await axios.post("/api/service/dashboard")).data); }
    catch (e: any) { setError(e.response?.data?.error || "Unable to load dashboard. Please try again."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const s = data?.summary || {}, j = data?.jobs || {};
  const projects: string[] = Array.from(new Set<string>((data?.matrix || []).map((r: any) => r.Project)));
  const types: string[] = Array.from(new Set<string>((data?.matrix || []).map((r: any) => r.CallType)));
  const matrix = types.map(type => ({ key: type, type, ...Object.fromEntries(projects.map((p, i) => [`p${i}`, n(data.matrix.find((r: any) => r.CallType === type && r.Project === p)?.Count)])), total: data.matrix.filter((r: any) => r.CallType === type).reduce((sum: number, r: any) => sum + n(r.Count), 0) }));
  const statuses: Count[] = data?.statuses || [];
  const total = statuses.reduce((sum, r) => sum + n(r.Count), 0);
  let angle = 0;
  const gradient = statuses.map((r, i) => { const start = angle; angle += n(r.Count) / (total || 1) * 360; return `${colors[i % colors.length]} ${start}deg ${angle}deg`; }).join(",");
  const monthly: any[] = data?.monthly || [];
  const max = Math.max(1, ...monthly.flatMap(r => [n(r.Booked), n(r.Closed)]));
  async function exportMatrix() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([["Call type", ...projects, "Total"], ...matrix.map((r: any) => [r.type, ...projects.map((_, i) => r[`p${i}`]), r.total])]);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Service calls"); XLSX.writeFile(book, "service-call-summary.xlsx");
  }
  return <div className="space-y-5">
    <PageHeader icon={<BarChartOutlined />} title="Service Dashboard" subtitle="Workload, response times and service performance at a glance" actions={<Button icon={<ReloadOutlined />} loading={loading} onClick={load}>Refresh</Button>} />
    {error && <Alert type="error" showIcon message={error} />}
    {!data && loading ? <Card><Skeleton active paragraph={{ rows: 10 }} /></Card> : data && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[
        ["Open calls", n(s.OpenCalls), `${n(s.Unassigned)} awaiting assignment`],
        ["Overdue calls", n(s.Overdue), "Past due date / call validity"],
        ["Resolved this month", n(s.ClosedMonth), s.AvgDays == null ? "No resolution history yet" : `${n(s.AvgDays).toFixed(1)} days average resolution`],
        ["Awaiting approval", n(j.Pending), `${money(j.PendingAmount)} estimated value`],
        ["Approved warranty cost", money(j.Warranty), "Approved and closed job card lines"],
      ].map(([label, value, detail], i) => <Card key={String(label)} styles={{ body: { padding: 20 } }}><div className="mb-3 h-1 w-8 rounded-full" style={{ background: colors[i] }} /><div className="text-xs font-medium text-slate-500">{label}</div><div className="my-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div><div className="text-xs text-slate-500">{detail}</div></Card>)}</div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Calls by status"><div className="flex min-h-[260px] flex-wrap items-center justify-center gap-8"><div role="img" aria-label={`${total} calls. ${statuses.map(r => `${r.Name}: ${r.Count}`).join(", ")}`} className="flex h-48 w-48 shrink-0 items-center justify-center rounded-full" style={{ background: total ? `conic-gradient(${gradient})` : "#e2e8f0" }}><div className="flex h-36 w-36 flex-col items-center justify-center rounded-full bg-white"><strong className="text-4xl text-slate-900">{total}</strong><span className="mt-1 text-xs text-slate-500">service calls</span></div></div><div className="min-w-[160px] space-y-3">{statuses.map((r, i) => <div key={r.Name} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[i % colors.length] }} /><span className="flex-1 text-slate-600">{r.Name}</span><b>{r.Count}</b></div>)}</div></div></Card>
        <Card title="Call activity · last six months"><div className="mb-5 flex gap-4 text-xs text-slate-500"><span>● <span className="text-blue-600">Booked</span></span><span>● <span className="text-teal-600">Resolved / closed</span></span></div><div className="flex h-[220px] items-end gap-3 border-b border-slate-200 pb-1">{monthly.map(r => <div key={r.Label} className="flex h-full min-w-0 flex-1 flex-col"><div className="flex flex-1 items-end justify-center gap-1.5">{["Booked", "Closed"].map((key, i) => <div key={key} title={`${r.Label}: ${r[key]} ${key.toLowerCase()}`} className="relative w-5 rounded-t sm:w-7" style={{ height: `${n(r[key]) / max * 85}%`, background: i ? "#0d9488" : "#2563eb" }}><span className="absolute -top-5 left-0 w-full text-center text-[10px] text-slate-600">{n(r[key])}</span></div>)}</div><span className="mt-3 text-center text-[10px] text-slate-500">{r.Label}</span></div>)}</div></Card>
      </div>
      <Card title="Call type × project" extra={<Button size="small" icon={<DownloadOutlined />} disabled={!matrix.length} onClick={exportMatrix}>Export Excel</Button>}><Table size="small" rowKey="key" dataSource={matrix} pagination={false} scroll={{ x: Math.max(700, projects.length * 180) }} columns={[{ title: "Call type", dataIndex: "type", width: 240 }, ...projects.map((p, i) => ({ title: p, dataIndex: `p${i}`, width: 180, align: "right" as const })), { title: "Total", dataIndex: "total", width: 90, align: "right" as const }]} /></Card>
      <div className="grid gap-5 lg:grid-cols-3"><Breakdown title="Open calls by age" rows={["0–3 days", "4–7 days", "8–15 days", "Over 15 days"].map(Name => ({ Name, Count: n(data.ages.find((r: Count) => r.Name === Name)?.Count) }))} /><Breakdown title="Open calls by service center" rows={data.centers} /><Breakdown title="Top recorded faults" rows={data.faults} /></div>
      <Card title="Needs attention" extra={<span className="text-xs text-slate-500">Overdue or unassigned</span>}><Table rowKey="ComplaintId" size="small" dataSource={data.attention} scroll={{ x: 850 }} pagination={{ pageSize: 10, showSizeChanger: true }} columns={[{ title: "Call", dataIndex: "ComplaintNo", render: v => <span className="font-semibold text-blue-700">{v}</span> }, { title: "Customer", dataIndex: "CustomerName" }, { title: "Place", render: (_, r: any) => [r.Village, r.District].filter(Boolean).join(", ") || "—" }, { title: "Due", dataIndex: "EffectiveDue", render: v => v ? formatDate(v) : "Not set" }, { title: "Status", dataIndex: "Status", render: v => <Tag>{v}</Tag> }, { title: "Attention", render: (_, r: any) => <><Tag color={r.IsOverdue ? "red" : "orange"}>{r.IsOverdue ? "Overdue" : "Unassigned"}</Tag>{r.IsOverdue && !r.EngineerUserId && <Tag color="orange">Unassigned</Tag>}</> }]} /></Card>
    </>}
  </div>;
}
