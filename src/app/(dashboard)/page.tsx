"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import dayjs from "dayjs";
import { Button, Empty, Spin, message } from "antd";
import { PlusOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DonutChart, GroupedBarChart, Legend, RankedBars, VIZ } from "@/components/dashboard/Charts";
import { reportFormError } from "@/lib/utils/formErrors";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";
import { canUseForm } from "@/lib/auth/forms";
import { PortalHome } from "@/components/portal/PortalHome";
import { WarehouseDashboard } from "@/components/dashboard/WarehouseDashboard";
import { PageLoader } from "@/components/common/Loader";

interface Overview {
  kpis: Record<string, number>;
  trend: { month: string; installations: number; calls: number }[];
  warrantyPosition: { key: string; label: string; value: number }[];
  callsByStatus: { status: string; count: number }[];
  installationsByDealer: { name: string; count: number }[];
  attention: { kind: string; title: string; subtitle: string; url: string }[];
}

/** Call statuses in workflow order, mapped onto the validated categorical order. */
const CALL_STATUS_ORDER = ["New", "Assigned", "Visited", "In Approval", "Approved", "Resolved", "Closed", "Cancelled"];
const CALL_STATUS_COLOR = [VIZ.blue, VIZ.orange, VIZ.aqua, VIZ.yellow, VIZ.magenta, VIZ.green, VIZ.violet, VIZ.red];
const POSITION_COLOR: Record<string, string> = { active: VIZ.aqua, ending: VIZ.yellow, expired: VIZ.red, replaced: VIZ.violet, other: VIZ.blue };
const ATTENTION_STRIPE: Record<string, string> = { approval: "#f59e0b", dealer: "#7c3aed", overdue: "#dc2626", assign: "#2563eb", reminder: "#0891b2", ending: "#f59e0b" };

const inrShort = (v: number) => v >= 1e7 ? `₹ ${(v / 1e7).toFixed(1)} Cr` : v >= 1e5 ? `₹ ${(v / 1e5).toFixed(1)} L` : v >= 1e3 ? `₹ ${(v / 1e3).toFixed(1)} K` : `₹ ${Math.round(v)}`;

function Card({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col min-w-0 ${className}`}>
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {aside && <span className="text-xs text-slate-400">{aside}</span>}
      </header>
      <div className="p-5 flex-1 min-h-0">{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub, accent, href }: { label: string; value: React.ReactNode; sub: string; accent: string; href: string }) {
  return (
    <Link href={href} className="group block bg-white rounded-xl border border-slate-200 shadow-xs px-4 py-3.5 hover:shadow-md hover:border-slate-300 transition-all" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{label}</div>
      <div className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-none">{value}</div>
      <div className="text-xs text-slate-500 mt-2 truncate">{sub}</div>
    </Link>
  );
}

/** Staff see the operations dashboard; dealer and customer logins get their portal home (Dealer Dashboard / My Products). */
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  // The middleware sends users here with ?denied=<screen> when they open a screen they have no rights to.
  useUrlQuery("denied", (screen) => {
    message.warning(`You do not have rights to “${screen}”. Ask your administrator for access.`, 5);
    window.history.replaceState(null, "", "/");
  });

  if (!user) return <PageLoader label="Loading your workspace…" minHeight="60vh" />;
  const portal = !user.IsAdmin && (user.Role === "DEALER" || user.Role === "CUSTOMER") ? user.Role : null;
  if (portal) return <PortalHome portal={portal as "DEALER" | "CUSTOMER"} />;
  // Warehouse logins get their own stock / receipt / return dashboard.
  if (!user.IsAdmin && user.Role === "WAREHOUSE") return <WarehouseDashboard />;
  return <StaffDashboard />;
}

function StaffDashboard() {
  const company = useMasterStore((s) => s.company);
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await axios.post("/api/dashboard/overview", {})).data); }
    catch (err) { reportFormError(err, { fallback: "Could not load the dashboard" }); }
    finally { setLoading(false); }
  }, []);

  // Live: load now, then refresh every 2 minutes while the tab is visible.
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 120000);
    return () => clearInterval(timer);
  }, [load]);

  const k = data?.kpis || {};
  const statusCounts = new Map((data?.callsByStatus || []).map((s) => [s.status, s.count]));
  const extraStatuses = (data?.callsByStatus || []).map((s) => s.status).filter((s) => !CALL_STATUS_ORDER.includes(s));
  const callSegments = [...CALL_STATUS_ORDER, ...extraStatuses]
    .map((status, i) => ({ label: status, value: statusCounts.get(status) || 0, color: CALL_STATUS_COLOR[i] || VIZ.violet }))
    .filter((s) => s.value > 0);
  const totalCalls = callSegments.reduce((s, x) => s + x.value, 0);
  const position = (data?.warrantyPosition || []).map((p) => ({ label: p.label, value: p.value, color: POSITION_COLOR[p.key] || VIZ.blue }));
  const totalSerials = position.reduce((s, x) => s + x.value, 0);
  const trend = data?.trend || [];
  const canRegister = canUseForm(user, "warranty.register");

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            <span className="uppercase">{company?.CompanyName || "Solartive Techno Industries Private Limited"}</span> · warranty &amp; service at a glance · {dayjs().format("DD-MMM-YYYY")}
          </p>
        </div>
        <div className="page-actions">
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
          {canRegister && <Link href="/warranty/register"><Button type="primary" icon={<PlusOutlined />} className="bg-blue-600 shadow-sm">Register Warranty</Button></Link>}
        </div>
      </div>

      {loading && !data ? <PageLoader label="Loading dashboard…" hint="Warranty, service calls and approvals" minHeight="50vh" /> : null}
      <Spin spinning={false}>
        <div className={`space-y-4 transition-opacity ${!data ? "hidden" : loading ? "opacity-70" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
            <Kpi label="Pump sets under warranty" value={k.pumpSets ?? "–"} sub={`${k.installations ?? 0} installations · ${k.serials ?? 0} serials registered`} accent="#0d9488" href="/warranty/active" />
            <Kpi label="Warranty ending in 45 days" value={k.ending45 ?? "–"} sub={`${k.expired ?? 0} already expired`} accent="#f59e0b" href="/warranty/active" />
            <Kpi label="Open service calls" value={k.openCalls ?? "–"} sub={`${k.overdueCalls ?? 0} overdue · ${k.unassignedCalls ?? 0} to assign`} accent="#dc2626" href="/service/complaints" />
            <Kpi label="Job cards awaiting approval" value={k.jobCardsInApproval ?? "–"} sub={`${k.jobCardsForMe ?? 0} waiting for you`} accent="#7c3aed" href="/service/approvals" />
            <Kpi label="Dealer sign-ups to approve" value={k.dealersPending ?? "–"} sub={`${k.dealersApproved ?? 0} approved dealers`} accent="#f59e0b" href="/warranty/dealers" />
            <Kpi label="Warranty cost (approved)" value={data ? inrShort(k.warrantyCost || 0) : "–"} sub={`borne by the company · ${k.warrantyJobCards ?? 0} job cards`} accent="#16a34a" href="/service/reports" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Registrations and service calls" aside="last 6 months">
              <GroupedBarChart
                categories={trend.map((t) => dayjs(t.month).format("MMM YY"))}
                series={[
                  { name: "Installations registered", color: VIZ.blue, values: trend.map((t) => t.installations) },
                  { name: "Service calls booked", color: VIZ.orange, values: trend.map((t) => t.calls) },
                ]} />
              <div className="mt-3">
                <Legend items={[
                  { label: "Installations registered", color: VIZ.blue, value: trend.reduce((s, t) => s + t.installations, 0) },
                  { label: "Service calls booked", color: VIZ.orange, value: trend.reduce((s, t) => s + t.calls, 0) },
                ]} />
              </div>
            </Card>

            <Card title="Warranty position" aside="per serial">
              <div className="flex flex-col items-center justify-center gap-5 h-full">
                <DonutChart segments={position} centerValue={totalSerials} centerLabel="serials" size={230} />
                <Legend items={position.map((p) => ({ label: p.label, color: p.color, value: p.value }))} />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4">
            <Card title="Needs attention" aside={data ? `${data.attention.length} items` : undefined} className="lg:col-span-2">
              {data && !data.attention.length ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="All clear — nothing needs attention" />
              ) : (
                <div className="-m-5 max-h-[460px] overflow-y-auto divide-y divide-slate-100">
                  {(data?.attention || []).map((a, i) => (
                    <Link key={`${a.url}-${i}`} href={a.url} className="group flex items-center gap-3 pl-4 pr-5 py-3 hover:bg-slate-50 transition-colors" style={{ borderLeft: `4px solid ${ATTENTION_STRIPE[a.kind] || "#94a3b8"}` }}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-slate-900 truncate">{a.title}</div>
                        <div className="text-xs text-slate-500 truncate">{a.subtitle}</div>
                      </div>
                      <RightOutlined className="text-[10px] text-slate-300 group-hover:text-slate-500" />
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Calls by status" aside={<Link href="/service/complaints" className="text-blue-600">open register</Link>}>
              <div className="flex flex-col items-center gap-5">
                <DonutChart segments={callSegments} centerValue={totalCalls} centerLabel="calls" size={190} />
                <Legend items={callSegments.map((s) => ({ label: s.label, color: s.color, value: s.value }))} />
              </div>
            </Card>

            <Card title="Installations by dealer" aside="top 6">
              {data && !data.installationsByDealer.length
                ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No installations yet" />
                : <RankedBars items={(data?.installationsByDealer || []).map((d) => ({ name: d.name, value: d.count }))} color={VIZ.blue} />}
            </Card>
          </div>
        </div>
      </Spin>
    </div>
  );
}
