"use client";

import React, { useEffect, useState } from "react";
import { Drawer, Empty, Image, Spin, Table, Tabs, Tag } from "antd";
import { CameraOutlined, CarOutlined, CheckCircleOutlined, ClockCircleOutlined, CustomerServiceOutlined, EnvironmentOutlined, HistoryOutlined, InfoCircleOutlined, PhoneOutlined, SafetyCertificateOutlined, ShopOutlined, ToolOutlined, UnorderedListOutlined, UserOutlined } from "@ant-design/icons";
import { CategoryIcon } from "@/components/warranty/SerialPassport";
import axios from "axios";
import dayjs from "dayjs";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { reportFormError } from "@/lib/utils/formErrors";
import { PageLoader } from "@/components/common/Loader";
import { ActivityTimeline } from "@/components/common/ActivityTimeline";
import { ServiceCallProgress } from "./ServiceCallProgress";
import { VideoList } from "@/components/common/VideoAttachments";

const day = (v?: string) => (v ? dayjs(v).format("DD-MMM-YYYY") : "—");
const STATE_TAG: Record<string, string> = { in: "green", out: "red", unreg: "default", unk: "red" };
const STATUS_COLOR: Record<string, string> = { New: "blue", Assigned: "purple", Visited: "cyan", "In Approval": "gold", Approved: "green", Resolved: "green", Closed: "default", Cancelled: "red" };
const JOB_COLOR: Record<string, string> = { Draft: "default", "In Approval": "gold", Approved: "green", Rejected: "red", Closed: "blue" };
const OPEN = (s?: string) => !["Closed", "Resolved", "Cancelled"].includes(String(s));

const tabLabel = (icon: React.ReactNode, text: string, count?: number) => (
  <span className="inline-flex items-center gap-1.5">{icon}{text}{count !== undefined && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{count}</span>}</span>
);

/** Small white card with a title row, used inside the tabs. */
function Panel({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5"><h3 className="text-sm font-bold text-slate-800">{title}</h3>{extra}</div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ---------- shared bits (same look as the job card view) ---------- */

const CAT_COLOR: Record<string, string> = { PUMP: "#2563eb", MOTOR: "#0891b2", CONTROLLER: "#7c3aed" };
const PRIORITY_COLOR: Record<string, string> = { Low: "default", Medium: "blue", Normal: "blue", High: "orange", Urgent: "red", Critical: "red" };
const initials = (name?: string) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const warrantyBadge = (v?: string) => v === "In Warranty" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : v === "Partial" ? "border-amber-200 bg-amber-50 text-amber-700" : /out|expired/i.test(String(v)) ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600";
const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="jc-fact"><span>{label}</span><b>{children || "—"}</b></div>
);

/** Call summary: the call, a due-date countdown, and who is handling it. */
function CallSummary({ c }: { c: any }) {
  const open = OPEN(c.Status);
  const start = c.CallDate ? dayjs(c.CallDate).startOf("day") : null, due = c.DueDate ? dayjs(c.DueDate).startOf("day") : null;
  const today = dayjs().startOf("day");
  const left = due ? due.diff(today, "day") : null;
  const span = start && due ? Math.max(1, due.diff(start, "day")) : 1;
  const pct = start && due ? Math.min(100, Math.max(4, (today.diff(start, "day") / span) * 100)) : 0;
  const tone = !open ? "#10b981" : left === null ? "#94a3b8" : left < 0 ? "#dc2626" : left <= 1 ? "#f59e0b" : "#2563eb";
  const countdown = !open ? `Call ${String(c.Status).toLowerCase()}` : left === null ? "No due date set" : left < 0 ? `${-left} day${left === -1 ? "" : "s"} overdue` : left === 0 ? "Due today" : `${left} day${left === 1 ? "" : "s"} left`;
  return (
    <section className="jc-money verify-pop">
      <div className="jc-money-total">
        <span className="jc-label">Service call</span>
        <strong className="font-mono !text-[22px] text-blue-700">{c.ComplaintNo}</strong>
        <span className="text-xs text-slate-500">{c.CallTypeName || "Call"} · booked {day(c.CallDate)}</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Tag color={STATUS_COLOR[c.Status] || "default"} className="m-0">{c.Status}</Tag>
          {c.Priority && <Tag color={PRIORITY_COLOR[c.Priority] || "default"} className="m-0">{c.Priority} priority</Tag>}
        </div>
      </div>
      <div className="jc-money-parts">
        <span className="jc-label">Due by</span>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
          <span className="text-xl font-extrabold text-slate-900">{day(c.DueDate)}</span>
          <span className="text-sm font-bold" style={{ color: tone }}><ClockCircleOutlined /> {countdown}</span>
        </div>
        <div className="jc-stack" aria-hidden="true"><i style={{ width: `${open ? pct : 100}%`, background: tone }} /></div>
        <div className="flex justify-between text-[11px] text-slate-500"><span>Booked {day(c.CallDate)}</span><span>Due {day(c.DueDate)}</span></div>
      </div>
      <div className="jc-money-split">
        <span className="jc-label">Handled by</span>
        <div className="mt-2 flex items-center gap-3">
          <span className="jc-avatar !h-10 !w-10 !text-sm" style={c.EngineerName ? undefined : { background: "#fef3c7", color: "#b45309" }}>{c.EngineerName ? initials(c.EngineerName) : <UserOutlined />}</span>
          <div className="min-w-0">
            <div className={`truncate text-sm font-bold ${c.EngineerName ? "text-slate-900" : "text-amber-600"}`}>{c.EngineerName || "Engineer not assigned"}</div>
            <div className="truncate text-xs text-slate-500"><ShopOutlined /> {c.ServiceCenterName || "No service center"}</div>
          </div>
        </div>
        <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${warrantyBadge(c.WarrantyStatus)}`}><SafetyCertificateOutlined /> {c.WarrantyStatus || "Warranty unknown"}</span>
      </div>
    </section>
  );
}

/** Details tab: customer & site, call facts, problem, resolution and the components on the call. */
function CallDetails({ c, components, onOpenComponents }: { c: any; components: any[]; onOpenComponents: () => void }) {
  const site = [c.Address, c.Village, c.District, c.StateName, c.Pincode].filter(Boolean).join(", ");
  return (
    <div className="jc-details">
      <div className="jc-card">
        <div className="flex items-center gap-3">
          <span className="jc-avatar">{initials(c.CustomerName)}</span>
          <div className="min-w-0 flex-1">
            <div className="jc-label">Customer</div>
            <div className="truncate text-base font-bold text-slate-900">{c.CustomerName || "—"}</div>
            {c.Mobile && <a href={`tel:${c.Mobile}`} className="text-xs font-semibold text-blue-600"><PhoneOutlined /> +91 {c.Mobile}</a>}
          </div>
        </div>
        <div className="jc-note !mt-4"><EnvironmentOutlined className="mt-0.5 text-slate-400" /><span>{site || "No site address"}</span></div>
      </div>

      <div className="jc-card">
        <div className="jc-label mb-3">Call details</div>
        <div className="jc-facts">
          <Fact label="Call date">{day(c.CallDate)}</Fact>
          <Fact label="Call type">{c.CallTypeName}</Fact>
          <Fact label="Source">{c.Source}</Fact>
          <Fact label="Service center">{c.ServiceCenterName}</Fact>
          <Fact label="Dealer">{c.DealerName || "Direct"}</Fact>
          <Fact label="Project / Scheme">{c.ProjectName}</Fact>
        </div>
      </div>

      <div className="jc-card jc-wide jc-problem">
        <div className="jc-label mb-2">Problem reported by the customer</div>
        <p className="whitespace-pre-line">{c.ComplaintText || "—"}</p>
      </div>

      {c.Resolution && (
        <div className="jc-card jc-wide jc-resolution">
          <div className="jc-label mb-2"><CheckCircleOutlined /> Resolution</div>
          <p className="whitespace-pre-line">{c.Resolution}</p>
        </div>
      )}

      <div className="jc-card jc-wide">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="jc-label">Components on the call</span>
          <span className="flex items-center gap-2"><span className="jc-count">{components.length}</span>{components.length > 0 && <button type="button" className="text-xs font-semibold text-blue-600 hover:underline" onClick={onOpenComponents}>Open table</button>}</span>
        </div>
        {components.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {components.map((it, i) => {
              const color = CAT_COLOR[String(it.Category).toUpperCase()] || "#64748b", w = it.Warranty;
              return (
                <div key={it.ComplaintItemLnId || `${it.SerialNo}-${i}`} className="jc-fault" style={{ ["--c" as any]: color }}>
                  <span className="jc-fault-icon"><CategoryIcon category={it.Category} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="jc-fault-cat">{it.Category}{it.ModelName ? ` · ${it.ModelName}` : ""}</span>
                    <span className="jc-fault-name font-mono">{it.SerialNo || "No serial"}</span>
                    {it.ReportedFault && <span className="block truncate text-[11px] text-slate-500" title={it.ReportedFault}>{it.ReportedFault}</span>}
                  </span>
                  {w && <span className="shrink-0 text-right"><Tag color={STATE_TAG[w.State]} className="m-0">{w.Label}</Tag>{w.EndDate && <span className="mt-0.5 block text-[10.5px] text-slate-400">till {day(w.EndDate)}</span>}</span>}
                </div>
              );
            })}
          </div>
        ) : <span className="text-xs text-slate-400">No components recorded</span>}
      </div>
    </div>
  );
}

/** Read-only view of a service call: details, faulty components with current warranty, visits & job cards, photos / videos and the activity trail. */
export function ServiceCallDetailDrawer({ complaintId, onClose }: { complaintId: string | null; onClose: () => void }) {
  const [callNo, setCallNo] = useState<string>();
  return <Drawer open={!!complaintId} onClose={onClose} closable={false} width={DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
    title={<DrawerHeader icon={<CustomerServiceOutlined />} title={callNo ? `Service call ${callNo}` : "Service call details"} meta={callNo ? <DrawerChip label="View" tone="solid" /> : undefined} onClose={onClose} />}>
    <ServiceCallDetails complaintId={complaintId} onLoaded={(c) => setCallNo(c?.ComplaintNo)} />
  </Drawer>;
}

export function ServiceCallDetails({ complaintId, showProgress = true, onLoaded }: { complaintId: string | null; showProgress?: boolean; onLoaded?: (complaint: any) => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("details");

  useEffect(() => {
    if (!complaintId) return;
    let active = true;
    setData(null);
    setTab("details");
    setLoading(true);
    axios.post("/api/service/complaints/detail", { ComplaintId: complaintId })
      .then((res) => { if (active) { setData(res.data); onLoaded?.(res.data.complaint); } })
      .catch((err) => reportFormError(err, { fallback: "Could not load the service call" }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [complaintId]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = data?.complaint;
  const visits: any[] = data?.visits || [], jobCards: any[] = data?.jobCards || [], photos: any[] = data?.photos || [], videos: any[] = data?.videos || [];
  const activity: any[] = data?.activity || [];

  return (
    <>
      {loading && !data && <PageLoader label="Loading service call…" hint="Components, warranty, photos and activity" minHeight="60vh" />}
      <Spin spinning={loading && !!data}>
        {c && <div className="jc-view space-y-4">
          {showProgress && <ServiceCallProgress status={c.Status} />}

          {/* At a glance: the call, the due-date countdown, who handles it */}
          <CallSummary c={c} />

          <Tabs activeKey={tab} onChange={setTab} items={[
            { key: "details", label: tabLabel(<InfoCircleOutlined />, "Details"), children: (
              <CallDetails c={c} components={data.components || []} onOpenComponents={() => setTab("components")} />
            ) },
            { key: "components", label: tabLabel(<UnorderedListOutlined />, "Components", data.components?.length || 0), children: (
              <Table size="middle" rowKey="ComplaintItemLnId" dataSource={data.components} pagination={false} scroll={{ x: 640 }} locale={{ emptyText: "No components recorded" }} columns={[
                { title: "Component", dataIndex: "Category", render: (v: string) => <b className="text-slate-800">{v}</b> },
                { title: "Serial no", dataIndex: "SerialNo", render: (v: string) => v ? <span className="font-mono">{v}</span> : "—" },
                { title: "Model", dataIndex: "ModelName", render: (v: string) => v || "—" },
                { title: "Warranty", dataIndex: "Warranty", render: (w: any) => w ? <span><Tag color={STATE_TAG[w.State]}>{w.Label}</Tag>{w.EndDate && <span className="text-xs text-slate-400">till {day(w.EndDate)}</span>}</span> : "—" },
                { title: "Fault reported", dataIndex: "ReportedFault", render: (v: string) => v || "—" },
              ]} />
            ) },
            { key: "work", label: tabLabel(<ToolOutlined />, "Visits & Job cards", visits.length + jobCards.length), children: (
              <div className="grid gap-4 md:grid-cols-2">
                <Panel title="Visit reports" extra={<span className="text-xs text-slate-400">{visits.length}</span>}>
                  {visits.length ? <div className="divide-y divide-slate-100">{visits.map((v) => (
                    <div key={v.VisitReportId || v.VisitNo} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold text-slate-800"><CarOutlined className="mr-1.5 text-cyan-600" />{v.VisitNo}</span><span className="text-xs text-slate-500">{day(v.VisitDate)}</span></div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">{v.Status && <Tag className="!mr-0">{v.Status}</Tag>}{v.EngineerName?.trim() && <span>by {v.EngineerName.trim()}</span>}</div>
                      {(v.Observations || v.ActionTaken) && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{v.ActionTaken || v.Observations}</p>}
                    </div>
                  ))}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No visits recorded yet" />}
                </Panel>
                <Panel title="Job cards" extra={<span className="text-xs text-slate-400">{jobCards.length}</span>}>
                  {jobCards.length ? <div className="divide-y divide-slate-100">{jobCards.map((j) => (
                    <div key={j.JobCardId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div><div className="font-mono text-sm font-semibold text-slate-800">{j.JobCardNo}</div><div className="text-xs text-slate-500">{day(j.JobCardDate)}</div></div>
                      <div className="flex items-center gap-3"><Tag color={JOB_COLOR[j.Status] || "default"} className="!mr-0">{j.Status}</Tag><b className="text-sm">₹ {Number(j.TotalEstimate || 0).toLocaleString("en-IN")}</b></div>
                    </div>
                  ))}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No job cards yet" />}
                </Panel>
              </div>
            ) },
            { key: "media", label: tabLabel(<CameraOutlined />, "Photos & Videos", photos.length + videos.length), children: (
              <div className="space-y-4">
                <Panel title="Photos" extra={<span className="text-xs text-slate-400">{photos.length}</span>}>
                  {photos.length ? (
                    <Image.PreviewGroup>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                        {photos.map((p) => (
                          <div key={p.AttachmentId} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <Image src={p.FileUrl} alt={p.FileName} width="100%" height={130} className="object-cover" />
                            <div className="truncate px-2 py-1 text-[11px] text-slate-500" title={p.FileName}>{p.Caption || p.FileName}</div>
                          </div>
                        ))}
                      </div>
                    </Image.PreviewGroup>
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No photos" />}
                </Panel>
                <Panel title="Videos" extra={<span className="text-xs text-slate-400">{videos.length}</span>}>
                  {videos.length ? <VideoList videos={videos} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No videos" />}
                </Panel>
              </div>
            ) },
            { key: "activity", label: tabLabel(<HistoryOutlined />, "Activity", activity.length || 1), children: (
              <Panel title="Activity" extra={<span className="text-xs text-slate-400">newest first · service call, visits and job cards</span>}>
                <ActivityTimeline items={activity} booked={{ on: c.InsertedOn || c.CallDate, by: c.CreatedBy || c.Source }} />
              </Panel>
            ) },
          ]} />
        </div>}
      </Spin>
    </>
  );
}
