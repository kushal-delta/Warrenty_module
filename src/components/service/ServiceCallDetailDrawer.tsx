"use client";

import React, { useEffect, useState } from "react";
import { Descriptions, Drawer, Empty, Image, Spin, Table, Tabs, Tag } from "antd";
import { CameraOutlined, CarOutlined, CustomerServiceOutlined, HistoryOutlined, InfoCircleOutlined, ToolOutlined, UnorderedListOutlined } from "@ant-design/icons";
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

/** One summary figure in the strip under the progress bar. */
const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-0.5 truncate text-sm font-semibold text-slate-800">{children}</div></div>
);

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
  const overdue = c?.DueDate && dayjs(c.DueDate).isBefore(dayjs(), "day") && OPEN(c?.Status);
  const visits: any[] = data?.visits || [], jobCards: any[] = data?.jobCards || [], photos: any[] = data?.photos || [], videos: any[] = data?.videos || [];
  const activity: any[] = data?.activity || [];

  return (
    <>
      {loading && !data && <PageLoader label="Loading service call…" hint="Components, warranty, photos and activity" minHeight="60vh" />}
      <Spin spinning={loading && !!data}>
        {c && <div className="space-y-4">
          {showProgress && <ServiceCallProgress status={c.Status} />}

          {/* At a glance */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
            <Fact label="Call no."><span className="font-mono text-blue-700">{c.ComplaintNo}</span></Fact>
            <Fact label="Status"><Tag color={STATUS_COLOR[c.Status] || "default"} className="!mr-0">{c.Status}</Tag></Fact>
            <Fact label="Priority">{c.Priority || "—"}</Fact>
            <Fact label="Warranty">{c.WarrantyStatus ? <Tag color={c.WarrantyStatus === "In Warranty" ? "green" : c.WarrantyStatus === "Partial" ? "orange" : "default"} className="!mr-0">{c.WarrantyStatus}</Tag> : "—"}</Fact>
            <Fact label="Engineer">{c.EngineerName || <span className="text-amber-600">Unassigned</span>}</Fact>
            <Fact label="Due by"><span className={overdue ? "text-red-600" : ""}>{day(c.DueDate)}{overdue ? " · overdue" : ""}</span></Fact>
          </div>

          <Tabs activeKey={tab} onChange={setTab} items={[
            { key: "details", label: tabLabel(<InfoCircleOutlined />, "Details"), children: (
              <div className="space-y-4">
                <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
                  { key: "d", label: "Call date", children: day(c.CallDate) },
                  { key: "t", label: "Call type", children: c.CallTypeName || "—" },
                  { key: "s", label: "Source", children: c.Source || "—" },
                  { key: "pr", label: "Project / Scheme", children: c.ProjectName || "—" },
                  { key: "dl", label: "Dealer", children: c.DealerName || "Direct" },
                  { key: "sc", label: "Service center", children: c.ServiceCenterName || "—" },
                  { key: "cu", label: "Customer", children: <span>{c.CustomerName || "—"}{c.Mobile ? <span className="text-slate-400"> · {c.Mobile}</span> : null}</span> },
                  { key: "site", label: "Site", span: 2, children: [c.Address, c.Village, c.District, c.StateName, c.Pincode].filter(Boolean).join(", ") || "—" },
                ]} />
                <Panel title="Problem reported"><p className="whitespace-pre-line text-sm text-slate-700">{c.ComplaintText || "—"}</p></Panel>
                {c.Resolution && <Panel title="Resolution"><p className="whitespace-pre-line text-sm text-slate-700">{c.Resolution}</p></Panel>}
              </div>
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
