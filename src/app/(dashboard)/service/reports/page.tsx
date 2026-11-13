"use client";

import React, { useEffect, useState } from "react";
import { Button, Segmented, Select, Table, Tabs, Tag, Tooltip } from "antd";
import { BarChartOutlined, CalendarOutlined, CustomerServiceOutlined, EnvironmentOutlined, ProjectOutlined, ReloadOutlined, SafetyCertificateOutlined, ShopOutlined, SwapOutlined, ToolOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useServiceOpsStore } from "@/lib/store/useServiceOpsStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { PageHeader, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { DateRangeFilter, ExportExcelButton, rangeToApi, type DateRange } from "@/components/common/ReportTools";
import { FilterBar } from "@/components/common/FilterBar";
import { exportExcel as writeExcel, rangeLabel, type ExcelSheet } from "@/lib/utils/excelExport";

const STATUSES = ["New", "Assigned", "Visited", "In Approval", "Approved", "Resolved", "Closed", "Cancelled"];
/** Same status colours as the Service Dashboard "Calls by status" chart. */
const STATUS_COLOR: Record<string, string> = { New: "#2563eb", Assigned: "#7c3aed", Visited: "#06b6d4", "In Approval": "#f59e0b", Approved: "#16a34a", Resolved: "#0d9488", Closed: "#94a3b8", Cancelled: "#ef4444" };
type MatrixDim = "type" | "engineer" | "center";
const MATRIX_TITLE: Record<MatrixDim, string> = { type: "Call type (valid days)", engineer: "Engineer", center: "Service center" };
const MATRIX_LABEL: Record<MatrixDim, string> = { type: "By call type", engineer: "By engineer", center: "By service center" };

/** Pivot the status matrix rows for one dimension: a row per name, a column per status, plus overdue and average days to resolve. */
function pivot(rows: any[], dim: MatrixDim) {
  const byName = new Map<string, any>();
  rows.filter((r) => r.Dim === dim).forEach((r) => {
    const row = byName.get(r.Name) || { Name: r.Name, total: 0, overdue: 0, daysSum: 0, daysCount: 0 };
    const n = Number(r.Count || 0);
    row[r.Status] = n; row.total += n; row.overdue += Number(r.Overdue || 0);
    if (r.AvgDays != null) { row.daysSum += Number(r.AvgDays) * n; row.daysCount += n; }
    byName.set(r.Name, row);
  });
  return Array.from(byName.values()).map((r) => ({ ...r, avgDays: r.daysCount ? Math.round((r.daysSum / r.daysCount) * 10) / 10 : null })).sort((a, b) => b.total - a.total);
}

/** KPI tile in the Service Dashboard style (coloured left edge, big number, one-line hint). */
function Kpi({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub: string; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs px-4 py-3.5" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{label}</div>
      <div className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-none">{value}</div>
      <div className="text-xs text-slate-500 mt-2 truncate">{sub}</div>
    </div>
  );
}

/** White card with a title row, used for every block inside a tab. */
function Section({ title, hint, extra, children, flush }: { title: string; hint?: string; extra?: React.ReactNode; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <div><h3 className="text-sm font-bold text-slate-800">{title}</h3>{hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}</div>
        {extra}
      </div>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

const tabLabel = (icon: React.ReactNode, text: string, count?: number) => (
  <span className="inline-flex items-center gap-2">{icon}{text}{count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{count}</span>}</span>
);

/** Service MIS: call summary (status matrix), job card detail, replacement (CN effect) and warranty claim summary. */
export default function ServiceReportsPage() {
  const { fetchReports } = useServiceOpsStore();
  const { states, serviceCenters, projects } = useMasterStore();
  const [range, setRange] = useState<DateRange>(null);
  const [stateId, setStateId] = useState<string>();
  const [centreId, setCentreId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [tab, setTab] = useState("calls");
  const [dim, setDim] = useState<MatrixDim>("type");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await fetchReports({ ...rangeToApi(range), stateId, serviceCenterId: centreId, projectId }));
    } catch (err) {
      reportFormError(err, { fallback: "Could not build reports" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [range, stateId, centreId, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const byStatus: Record<string, number> = Object.fromEntries((data?.calls.byStatus || []).map((r: any) => [r.Status, r.Calls]));
  const totalCalls = Object.values(byStatus).reduce((s, n) => s + Number(n), 0);
  const openCalls = Object.entries(byStatus).filter(([s]) => !["Closed", "Resolved", "Cancelled"].includes(s)).reduce((sum, [, n]) => sum + Number(n), 0);
  const ageing = data?.calls.ageing || {};
  const jc = (data?.jobCards || []) as any[];
  const lines = (data?.jobCardLines || []) as any[];
  const repl = (data?.replacements || []) as any[];
  const claimJcs = (data?.claimJobCards || []) as any[];
  const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const matrix = (data?.calls.statusMatrix || []) as any[];
  const overdueTotal = matrix.filter((r) => r.Dim === "type").reduce((s, r) => s + Number(r.Overdue || 0), 0);
  // A credit note reduces the invoiced value: show the effect of each replaced line as a negative amount.
  const effect = (r: any) => (r.CnNo ? -Number(r.NetValue || 0) : 0);
  const cnTotal = Array.from(new Map(repl.map((r) => [r.ReplNo, Number(r.CnAmount || 0)])).values()).reduce((s, n) => s + n, 0);
  const openOver7 = Number(ageing.d8_15 || 0) + Number(ageing.d15plus || 0);
  const resolved = Number(byStatus.Resolved || 0) + Number(byStatus.Closed || 0);
  const jcTotal = sum(jc, "Total"), jcWarranty = sum(jc, "Warranty");
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  const periodText = range?.[0] && range?.[1] ? `${range[0].format("DD MMM YYYY")} – ${range[1].format("DD MMM YYYY")}` : "All dates";

  const statusHead = (s: string) => <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />{s}</span>;
  const matrixColumns = (d: MatrixDim) => [
    { title: MATRIX_TITLE[d], dataIndex: "Name", key: "n", fixed: "left" as const, width: 220, render: (v: string) => <b className="text-slate-800">{v.trim()}</b> },
    ...STATUSES.map((s) => ({ title: statusHead(s), dataIndex: s, key: s, align: "right" as const, width: 105, render: (v: number) => v || <span className="text-slate-300">–</span> })),
    { title: "Total", dataIndex: "total", key: "t", align: "right" as const, width: 80, render: (v: number) => <b>{v}</b> },
    { title: "Overdue", dataIndex: "overdue", key: "o", align: "right" as const, width: 90, render: (v: number) => v ? <Tag color="red" className="!mr-0 font-semibold">{v}</Tag> : <span className="text-slate-300">–</span> },
    { title: "Avg days to resolve", dataIndex: "avgDays", key: "a", align: "right" as const, width: 150, render: (v: number | null) => v ?? <span className="text-slate-300">—</span> },
  ];
  const people = (title: string) => [
    { title, dataIndex: "Name", key: "n", render: (v: string) => <span className="font-medium text-slate-800">{v}</span> }, { title: "Total", dataIndex: "Total", key: "t", align: "right" as const, render: (v: number) => <b>{v}</b> },
    { title: "Open", dataIndex: "Open", key: "o", align: "right" as const, render: (v: number) => v ? <span className="font-semibold text-amber-600">{v}</span> : <span className="text-slate-300">0</span> },
    { title: "Closed / Resolved", dataIndex: "Closed", key: "c", align: "right" as const, render: (v: number) => <span className="text-emerald-600">{v}</span> },
  ];

  const exportExcel = () => {
    const filters = {
      Period: rangeLabel(range),
      State: states.find((s: any) => s.StateId === stateId)?.StateName,
      "Service center": serviceCenters.find((s: any) => s.ServiceCenterId === centreId)?.ServiceCenterName,
      Project: (() => { const p: any = projects.find((x: any) => x.ProjectId === projectId); return p ? (p.ProjectNo ? `${p.ProjectNo} — ${p.ProjectName}` : p.ProjectName) : null; })(),
    };
    if (tab === "calls") {
      return writeExcel({ title: "Service Report - Call Summary", filters, sheets: (["type", "engineer", "center"] as MatrixDim[]).map((d): ExcelSheet<any> => ({
        name: `By ${d}`, title: `Service Report - Call Summary (${MATRIX_LABEL[d].toLowerCase()})`, rows: pivot(matrix, d),
        columns: [
          { header: MATRIX_TITLE[d], value: (r: any) => r.Name.trim() },
          ...STATUSES.map((s) => ({ header: s, value: (r: any) => r[s] || 0, type: "number" as const, total: true })),
          { header: "Total", value: (r: any) => r.total, type: "number", total: true },
          { header: "Overdue", value: (r: any) => r.overdue, type: "number", total: true },
          { header: "Avg days to resolve", value: (r: any) => r.avgDays ?? null, type: "number" },
        ],
      })) });
    }
    // The call's project / scheme ("No – Name"), blank when the call has none.
    const projectText = (r: any) => (r.ProjectName ? (r.ProjectNo ? `${r.ProjectNo} — ${r.ProjectName}` : r.ProjectName) : "");
    if (tab === "jc") {
      return writeExcel({ title: "Service Report - Job Card Detail", filters, sheets: [{ name: "Job card lines", rows: lines, columns: [
        { header: "Job Card", value: (r: any) => r.JobCardNo },
        { header: "Date", value: (r: any) => r.JobCardDate, type: "date" },
        { header: "Call", value: (r: any) => r.ComplaintNo },
        { header: "Customer", value: (r: any) => r.CustomerName },
        { header: "Project", value: (r: any) => projectText(r) },
        { header: "Type", value: (r: any) => r.ItemType },
        { header: "Code", value: (r: any) => r.SpareCode },
        { header: "Item", value: (r: any) => r.SpareName },
        { header: "Component serial", value: (r: any) => r.SerialNo },
        { header: "Engineer", value: (r: any) => r.EngineerName?.trim() },
        { header: "Service center", value: (r: any) => r.ServiceCenterName },
        { header: "Qty", value: (r: any) => r.Qty, type: "number", total: true },
        { header: "Rate", value: (r: any) => r.Rate, type: "money" },
        { header: "Amount", value: (r: any) => r.Amount, type: "money", total: true },
        { header: "GST", value: (r: any) => r.GstAmount, type: "money", total: true },
        { header: "Basis", value: (r: any) => (r.IsWarranty ? "Warranty" : "Chargeable") },
        { header: "Status", value: (r: any) => r.Status },
      ] }] });
    }
    if (tab === "repl") {
      return writeExcel({ title: "Service Report - Replacement (CN effect)", filters, sheets: [{ name: "Replacements", rows: repl, columns: [
        { header: "Replacement", value: (r: any) => r.ReplNo },
        { header: "Date", value: (r: any) => r.ReplDate, type: "date" },
        { header: "Source", value: (r: any) => r.Source },
        { header: "Type", value: (r: any) => r.ReplacementType },
        { header: "Warranty", value: (r: any) => (r.VoucherType === "Without Serial No" ? "Out of warranty" : "In warranty") },
        { header: "Dealer", value: (r: any) => r.DealerName },
        { header: "Call", value: (r: any) => r.ComplaintNo },
        { header: "Project", value: (r: any) => projectText(r) },
        { header: "Category", value: (r: any) => r.Category },
        { header: "Invoiced item", value: (r: any) => r.InvoiceItem },
        { header: "Received item", value: (r: any) => r.ReceivedItem },
        { header: "Qty", value: (r: any) => Number(r.Qty || 0), type: "number", total: true },
        { header: "Old serial", value: (r: any) => r.OldSerialNo },
        { header: "New serial", value: (r: any) => r.NewSerialNo },
        { header: "Warranty days left", value: (r: any) => r.WarrantyDaysLeft, type: "number" },
        { header: "Net value", value: (r: any) => Number(r.NetValue || 0), type: "money", total: true },
        { header: "CN no", value: (r: any) => r.CnNo },
        { header: "CN effect", value: (r: any) => effect(r), type: "money", total: true },
        { header: "Status", value: (r: any) => r.Status },
      ] }] });
    }
    return writeExcel({ title: "Service Report - Warranty Claim Summary", filters, sheets: [
      { name: "Claim - job cards", rows: claimJcs, columns: [
        { header: "Job Card", value: (r: any) => r.JobCardNo },
        { header: "Date", value: (r: any) => r.JobCardDate, type: "date" },
        { header: "Customer", value: (r: any) => r.CustomerName },
        { header: "Project", value: (r: any) => projectText(r) },
        { header: "Service center", value: (r: any) => r.ServiceCenterName },
        { header: "Serials", value: (r: any) => r.Serials },
        { header: "Spares", value: (r: any) => r.SparesTotal, type: "money", total: true },
        { header: "Labour", value: (r: any) => r.LabourTotal, type: "money", total: true },
        { header: "Warranty claim", value: (r: any) => r.WarrantyAmount, type: "money", total: true },
        { header: "Customer pays", value: (r: any) => Math.max(0, Number(r.TotalEstimate) - Number(r.WarrantyAmount)), type: "money", total: true },
        { header: "Status", value: (r: any) => r.Status },
      ] },
      { name: "Claim - spare wise", rows: data?.claims || [], columns: [
        { header: "Spare", value: (r: any) => r.SpareName },
        { header: "Code", value: (r: any) => r.SpareCode },
        { header: "Qty", value: (r: any) => r.Qty, type: "number", total: true },
        { header: "Job cards", value: (r: any) => r.JobCards, type: "number", total: true },
        { header: "Claim value", value: (r: any) => r.Amount, type: "money", total: true },
      ] },
      { name: "Claim - month wise", rows: data?.claimByMonth || [], columns: [
        { header: "Month", value: (r: any) => dayjs(r.Month).format("MMM YYYY") },
        { header: "Job cards", value: (r: any) => r.JobCards, type: "number", total: true },
        { header: "Claim value", value: (r: any) => r.Amount, type: "money", total: true },
      ] },
      { name: "Claim - component", rows: data?.claimByComponent || [], columns: [
        { header: "Component", value: (r: any) => r.Component },
        { header: "Claim value", value: (r: any) => r.Amount, type: "money", total: true },
      ] },
    ] });
  };

  const spareSummary = (rows: readonly any[]) => rows.length ? <Table.Summary.Row><Table.Summary.Cell index={0}><b>Total</b></Table.Summary.Cell><Table.Summary.Cell index={1} /><Table.Summary.Cell index={2} /><Table.Summary.Cell index={3} align="right"><b>{inr(sum(rows as any[], "Amount"), 2)}</b></Table.Summary.Cell></Table.Summary.Row> : null;

  const ageingBuckets: [string, number, string][] = [["0–2 days", Number(ageing.d0_2 || 0), "#16a34a"], ["3–7 days", Number(ageing.d3_7 || 0), "#f59e0b"], ["8–15 days", Number(ageing.d8_15 || 0), "#f97316"], ["Over 15 days", Number(ageing.d15plus || 0), "#ef4444"]];
  const ageingMax = Math.max(1, ...ageingBuckets.map((b) => b[1]));
  const matrixRows = pivot(matrix, dim);
  const tabCount: Record<string, string> = { calls: "service calls", jc: "job card lines", repl: "replacement lines", claims: "warranty claim job cards" };

  return (
    <div className="space-y-4">
      <PageHeader icon={<BarChartOutlined />} title="Service Reports" subtitle={`Call summary, job card detail, replacement credit-note effect and warranty claim summary · ${periodText}`}
        actions={<>
          <Tooltip title={`Exports the ${tabCount[tab]} on the open tab, with the filters below`}><span><ExportExcelButton onExport={exportExcel} disabled={!data} /></span></Tooltip>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        </>} />

      <FilterBar
        storageKey="service-reports"
        filters={[
          { key: "date", label: "Period", icon: <CalendarOutlined />, pinned: true, active: !!(range?.[0] || range?.[1]), onClear: () => setRange(null),
            render: () => <DateRangeFilter variant="borderless" value={range} onChange={setRange} placeholder={["From", "To"]} className="" /> },
          { key: "center", label: "Service center", icon: <ShopOutlined />, pinned: true, active: !!centreId, onClear: () => setCentreId(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={centreId} onChange={setCentreId} popupMatchSelectWidth={false} options={serviceCenters.map((s: any) => ({ value: s.ServiceCenterId, label: s.ServiceCenterName }))} /> },
          { key: "state", label: "State", group: "Location", icon: <EnvironmentOutlined />, active: !!stateId, onClear: () => setStateId(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={stateId} onChange={setStateId} popupMatchSelectWidth={false} options={states.map((s: any) => ({ value: s.StateId, label: s.StateName }))} /> },
          { key: "project", label: "Project", group: "Call details", icon: <ProjectOutlined />, active: !!projectId, onClear: () => setProjectId(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={projectId} onChange={setProjectId} popupMatchSelectWidth={false} options={projects.map((p: any) => ({ value: p.ProjectId, label: p.ProjectNo ? `${p.ProjectNo} — ${p.ProjectName}` : p.ProjectName }))} /> },
        ]}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7 gap-3">
        <Kpi label="Calls" value={totalCalls} sub={`${resolved} resolved / closed · ${pct(resolved, totalCalls)}%`} accent="#2563eb" />
        <Kpi label="Open calls" value={openCalls} sub={`${pct(openCalls, totalCalls)}% of all calls`} accent="#f59e0b" />
        <Kpi label="Overdue" value={overdueTotal} sub="past the call type's valid days" accent="#ef4444" />
        <Kpi label="Open > 7 days" value={openOver7} sub={`${Number(ageing.d15plus || 0)} open for over 15 days`} accent="#f97316" />
        <Kpi label="Job card value" value={`₹ ${inr(jcTotal)}`} sub={`${sum(jc, "Count")} job cards`} accent="#0d9488" />
        <Kpi label="Warranty borne" value={`₹ ${inr(jcWarranty)}`} sub={`${pct(jcWarranty, jcTotal)}% of job card value`} accent="#16a34a" />
        <Kpi label="Credit notes" value={`₹ ${inr(cnTotal)}`} sub={`${new Set(repl.map((r) => r.ReplNo)).size} replacements`} accent="#7c3aed" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-xs px-4 pb-4">
        <Tabs activeKey={tab} onChange={setTab} items={[
          { key: "calls", label: tabLabel(<CustomerServiceOutlined />, "Call Summary", totalCalls), children: <div className="space-y-4">
            <Section title="Calls by status" hint={`${totalCalls} calls in the selected period`}>
              {totalCalls ? <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                  {STATUSES.filter((s) => byStatus[s]).map((s) => <Tooltip key={s} title={`${s}: ${byStatus[s]} (${pct(Number(byStatus[s]), totalCalls)}%)`}><div style={{ width: `${(Number(byStatus[s]) / totalCalls) * 100}%`, background: STATUS_COLOR[s] }} /></Tooltip>)}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
                  {STATUSES.map((s) => (
                    <div key={s} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />{s}</div>
                      <div className="mt-0.5 text-lg font-bold text-slate-900">{Number(byStatus[s] || 0)}</div>
                    </div>
                  ))}
                </div>
              </> : <p className="py-4 text-center text-sm text-slate-400">No calls in this period</p>}
            </Section>

            <Section title="Status matrix" hint="Calls per status, overdue count and average days to resolve" flush
              extra={<Segmented size="small" value={dim} onChange={(v) => setDim(v as MatrixDim)} options={(Object.keys(MATRIX_LABEL) as MatrixDim[]).map((d) => ({ value: d, label: MATRIX_LABEL[d] }))} />}>
              <Table size="middle" rowKey="Name" loading={loading} dataSource={matrixRows} columns={matrixColumns(dim)} pagination={false} scroll={{ x: 1340 }} locale={{ emptyText: "No calls in this period" }}
                summary={(rows) => rows.length > 1 ? (
                  <Table.Summary fixed>
                    <Table.Summary.Row className="bg-slate-50">
                      <Table.Summary.Cell index={0}><b>Total</b></Table.Summary.Cell>
                      {STATUSES.map((s, i) => <Table.Summary.Cell key={s} index={i + 1} align="right"><b>{sum(rows as any[], s) || <span className="text-slate-300">–</span>}</b></Table.Summary.Cell>)}
                      <Table.Summary.Cell index={STATUSES.length + 1} align="right"><b>{sum(rows as any[], "total")}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={STATUSES.length + 2} align="right"><b className={sum(rows as any[], "overdue") ? "text-red-600" : ""}>{sum(rows as any[], "overdue")}</b></Table.Summary.Cell>
                      <Table.Summary.Cell index={STATUSES.length + 3} />
                    </Table.Summary.Row>
                  </Table.Summary>
                ) : null} />
            </Section>

            <div className="grid xl:grid-cols-3 gap-4">
              <Section title="Open call ageing" hint={`${openCalls} open calls by days since the call date`}>
                <div className="space-y-3">
                  {ageingBuckets.map(([l, v, c]) => (
                    <div key={l}>
                      <div className="flex items-center justify-between text-xs"><span className="font-medium text-slate-600">{l}</span><b className="text-slate-900">{v}</b></div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${(v / ageingMax) * 100}%`, background: c }} /></div>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title="Service center performance" flush>
                <Table size="small" rowKey="Name" loading={loading} dataSource={data?.calls.byCenter || []} pagination={false} locale={{ emptyText: "No calls" }}
                  columns={[...people("Service center"), { title: "Avg days", dataIndex: "AvgDaysToClose", key: "a", align: "right" as const, render: (v: number) => v ?? <span className="text-slate-300">—</span> }]} />
              </Section>
              <Section title="Engineer performance" flush>
                <Table size="small" rowKey="Name" loading={loading} dataSource={data?.calls.byEngineer || []} pagination={false} locale={{ emptyText: "No calls" }}
                  columns={[...people("Engineer"), { title: "Visits", dataIndex: "Visits", key: "v", align: "right" as const }]} />
              </Section>
            </div>
          </div> },

          { key: "jc", label: tabLabel(<ToolOutlined />, "Job Card Detail", lines.length), children: <div className="space-y-4">
            <Section title="Job cards by status" hint="Estimate value split into spares, labour and the part borne under warranty" flush>
              <Table size="middle" rowKey="Status" loading={loading} dataSource={jc} pagination={false} locale={{ emptyText: "No job cards in this period" }} columns={[
                { title: "Status", dataIndex: "Status", render: (v: string) => <b className="text-slate-800">{v}</b> }, { title: "Job cards", dataIndex: "Count", align: "right" as const },
                { title: "Spares ₹", dataIndex: "Spares", align: "right" as const, render: (v: number) => inr(v, 2) }, { title: "Labour ₹", dataIndex: "Labour", align: "right" as const, render: (v: number) => inr(v, 2) },
                { title: "Total ₹", dataIndex: "Total", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> }, { title: "Warranty ₹", dataIndex: "Warranty", align: "right" as const, render: (v: number) => <span className="text-emerald-700">{inr(v, 2)}</span> },
              ]} summary={(rows) => rows.length > 1 ? (
                <Table.Summary.Row className="bg-slate-50">
                  <Table.Summary.Cell index={0}><b>Total</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right"><b>{sum(rows as any[], "Count")}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right"><b>{inr(sum(rows as any[], "Spares"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right"><b>{inr(sum(rows as any[], "Labour"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right"><b>{inr(sum(rows as any[], "Total"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right"><b className="text-emerald-700">{inr(sum(rows as any[], "Warranty"), 2)}</b></Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null} />
            </Section>
            <Section title="Job card lines" hint={`${lines.length} spare and labour lines`} flush>
              <Table size="middle" rowKey={(r: any) => `${r.JobCardNo}-${r.SpareCode}-${r.SerialNo}-${r.Qty}-${r.Amount}`} loading={loading} dataSource={lines} scroll={{ x: 1500 }} pagination={{ pageSize: 20, showSizeChanger: true }} locale={{ emptyText: "No job card lines in this period" }} columns={[
                { title: "Job Card", dataIndex: "JobCardNo", render: (v: string) => <span className="font-mono font-semibold text-blue-700">{v}</span> }, { title: "Date", dataIndex: "JobCardDate", render: (v: string) => formatDate(v) },
                { title: "Call", dataIndex: "ComplaintNo", render: (v: string) => <span className="font-mono text-xs">{v}</span> }, { title: "Customer", dataIndex: "CustomerName" },
                { title: "Type", dataIndex: "ItemType", render: (v: string) => <Tag color={v === "Labour" ? "blue" : "default"}>{v || "Spare"}</Tag> },
                { title: "Code", dataIndex: "SpareCode", render: (v: string) => <span className="font-mono text-xs">{v}</span> }, { title: "Item", dataIndex: "SpareName" },
                { title: "Component serial", dataIndex: "SerialNo", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : "—" },
                { title: "Engineer", dataIndex: "EngineerName", render: (v: string) => v?.trim() || "—" }, { title: "Service center", dataIndex: "ServiceCenterName", render: (v: string) => v || "—" },
                { title: "Qty", dataIndex: "Qty", align: "right" as const }, { title: "Amount ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => inr(v, 2) },
                { title: "Basis", dataIndex: "IsWarranty", render: (w: boolean) => w ? <Tag color="green">Warranty</Tag> : <Tag color="orange">Chargeable</Tag> }, { title: "Status", dataIndex: "Status" },
              ]} summary={(rows) => rows.length ? (
                <Table.Summary.Row className="bg-slate-50">
                  <Table.Summary.Cell index={0} colSpan={10}><b>Total (this page)</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={10} align="right"><b>{sum(rows as any[], "Qty")}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={11} align="right"><b>{inr(sum(rows as any[], "Amount"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={12} colSpan={2} />
                </Table.Summary.Row>
              ) : null} />
            </Section>
          </div> },

          { key: "repl", label: tabLabel(<SwapOutlined />, "Replacement (CN effect)", repl.length), children: (
            <Section title="Replacement lines" hint={`Credit notes ₹ ${inr(cnTotal, 2)} · a credit note reduces the invoiced value, shown as a negative effect`} flush>
              <Table size="middle" rowKey={(r: any) => `${r.ReplNo}-${r.OldSerialNo}-${r.NewSerialNo}-${r.InvoiceItem}`} loading={loading} dataSource={repl} scroll={{ x: 1800 }} pagination={{ pageSize: 20, showSizeChanger: true }} locale={{ emptyText: "No replacements in this period" }} columns={[
                { title: "Replacement", dataIndex: "ReplNo", render: (v: string) => <span className="font-mono font-semibold text-blue-700">{v}</span> }, { title: "Date", dataIndex: "ReplDate", render: (v: string) => formatDate(v) },
                { title: "Source", dataIndex: "Source" }, { title: "Type", dataIndex: "ReplacementType", render: (v: string) => v || "—" },
                { title: "Warranty", dataIndex: "VoucherType", render: (v: string) => v === "Without Serial No" ? <Tag color="red">Out of warranty</Tag> : <Tag color="green">In warranty</Tag> }, { title: "Dealer", dataIndex: "DealerName", render: (v: string) => v || "—" }, { title: "Category", dataIndex: "Category" },
                { title: "Invoiced item", dataIndex: "InvoiceItem", render: (v: string) => v || "—" }, { title: "Received item", dataIndex: "ReceivedItem", render: (v: string) => v || "—" },
                { title: "Qty", dataIndex: "Qty", align: "right" as const, render: (v: number) => v ?? "—" },
                { title: "Old → New", key: "sw", render: (_: any, r: any) => <span className="font-mono text-xs">{r.OldSerialNo || "—"} → {r.NewSerialNo || "—"}</span> },
                { title: "Days left", dataIndex: "WarrantyDaysLeft", align: "right" as const, render: (v: number) => v ?? "—" },
                { title: "Net ₹", dataIndex: "NetValue", align: "right" as const, render: (v: number) => inr(v, 2) },
                { title: "CN", key: "cn", render: (_: any, r: any) => r.CnNo ? `${r.CnNo} · ₹ ${inr(r.CnAmount, 2)}` : "—" },
                { title: "CN effect ₹", key: "ef", align: "right" as const, render: (_: any, r: any) => { const e = effect(r); return e ? <b className="text-red-600">-{inr(Math.abs(e), 2)}</b> : <span className="text-slate-300">–</span>; } },
                { title: "Status", dataIndex: "Status" },
              ]} />
            </Section>
          ) },

          { key: "claims", label: tabLabel(<SafetyCertificateOutlined />, "Warranty Claim Summary", claimJcs.length), children: <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Kpi label="Claim value" value={`₹ ${inr(sum(claimJcs, "WarrantyAmount"))}`} sub="borne by the company" accent="#16a34a" />
              <Kpi label="Job cards with claims" value={claimJcs.length} sub="approved / closed" accent="#2563eb" />
              <Kpi label="Customer pays" value={`₹ ${inr(claimJcs.reduce((s, r) => s + Math.max(0, Number(r.TotalEstimate) - Number(r.WarrantyAmount)), 0))}`} sub="chargeable part of those job cards" accent="#f59e0b" />
            </div>
            <Section title="Job card-wise claim" flush>
              <Table size="middle" rowKey="JobCardId" loading={loading} dataSource={claimJcs} scroll={{ x: 1100 }} pagination={{ pageSize: 10, showSizeChanger: true }} locale={{ emptyText: "No approved warranty job cards in this period" }} columns={[
                { title: "Job Card", dataIndex: "JobCardNo", render: (v: string) => <span className="font-mono font-semibold text-blue-700">{v}</span> }, { title: "Date", dataIndex: "JobCardDate", render: (v: string) => formatDate(v) },
                { title: "Customer", dataIndex: "CustomerName" }, { title: "Service center", dataIndex: "ServiceCenterName", render: (v: string) => v || "—" },
                { title: "Serials", dataIndex: "Serials", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : "—" },
                { title: "Spares ₹", dataIndex: "SparesTotal", align: "right" as const, render: (v: number) => inr(v, 2) }, { title: "Labour ₹", dataIndex: "LabourTotal", align: "right" as const, render: (v: number) => inr(v, 2) },
                { title: "Claim ₹", dataIndex: "WarrantyAmount", align: "right" as const, render: (v: number) => <b className="text-emerald-700">{inr(v, 2)}</b> },
                { title: "Customer pays ₹", key: "cp", align: "right" as const, render: (_: any, r: any) => inr(Math.max(0, Number(r.TotalEstimate) - Number(r.WarrantyAmount)), 2) },
                { title: "Status", dataIndex: "Status", render: (s: string) => <Tag color={s === "Closed" ? "green" : "blue"}>{s}</Tag> },
              ]} summary={(rows) => rows.length ? (
                <Table.Summary.Row className="bg-slate-50">
                  <Table.Summary.Cell index={0} colSpan={5}><b>Total</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right"><b>{inr(sum(rows as any[], "SparesTotal"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right"><b>{inr(sum(rows as any[], "LabourTotal"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right"><b className="text-emerald-700">{inr(sum(rows as any[], "WarrantyAmount"), 2)}</b></Table.Summary.Cell>
                  <Table.Summary.Cell index={8} colSpan={2} />
                </Table.Summary.Row>
              ) : null} />
            </Section>
            <div className="grid lg:grid-cols-2 gap-4">
              <Section title="Month-wise warranty cost" flush>
                <Table size="small" rowKey="Month" loading={loading} dataSource={data?.claimByMonth || []} pagination={false} locale={{ emptyText: "No claims yet" }} columns={[
                  { title: "Month", dataIndex: "Month", render: (v: string) => dayjs(v).format("MMM YYYY") }, { title: "Job cards", dataIndex: "JobCards", align: "right" as const },
                  { title: "Claim ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
                ]} />
              </Section>
              <Section title="Component-wise warranty cost" flush>
                <Table size="small" rowKey="Component" loading={loading} dataSource={data?.claimByComponent || []} pagination={false} locale={{ emptyText: "No claims yet" }} columns={[
                  { title: "Component", dataIndex: "Component" }, { title: "Claim ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
                ]} />
              </Section>
            </div>
            <Section title="Spare-wise claim" flush>
              <Table size="small" rowKey="SpareCode" loading={loading} dataSource={data?.claims || []} pagination={false} locale={{ emptyText: "No claims yet" }} columns={[
                { title: "Spare", key: "s", render: (_: any, r: any) => <span><b>{r.SpareName}</b> <span className="text-xs text-slate-400">{r.SpareCode}</span></span> },
                { title: "Qty replaced", dataIndex: "Qty", align: "right" as const, render: (v: number, r: any) => `${v} ${r.Uom || ""}` },
                { title: "Job cards", dataIndex: "JobCards", align: "right" as const },
                { title: "Claim value ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
              ]} summary={spareSummary} />
            </Section>
          </div> },
        ]} />
      </div>
    </div>
  );
}
