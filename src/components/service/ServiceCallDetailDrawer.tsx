"use client";

import React, { useEffect, useState } from "react";
import { Card, Descriptions, Drawer, Empty, Image, Spin, Table, Tag } from "antd";
import { CustomerServiceOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { reportFormError } from "@/lib/utils/formErrors";
import { PageLoader } from "@/components/common/Loader";
import { ServiceCallProgress } from "./ServiceCallProgress";
import { VideoList } from "@/components/common/VideoAttachments";

const day = (v?: string) => (v ? dayjs(v).format("DD-MMM-YYYY") : "—");
const STATE_TAG: Record<string, string> = { in: "green", out: "red", unreg: "default", unk: "red" };

/** Read-only view of a service call: details, faulty components with current warranty, and site photos. */
export function ServiceCallDetailDrawer({ complaintId, onClose }: { complaintId: string | null; onClose: () => void }) {
  return <Drawer open={!!complaintId} onClose={onClose} closable={false} width={DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose title={<DrawerHeader icon={<CustomerServiceOutlined />} title="Service call details" onClose={onClose} />}><ServiceCallDetails complaintId={complaintId} /></Drawer>;
}

export function ServiceCallDetails({ complaintId, showProgress = true }: { complaintId: string | null; showProgress?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!complaintId) return;
    let active = true;
    setData(null);
    setLoading(true);
    axios.post("/api/service/complaints/detail", { ComplaintId: complaintId })
      .then((res) => { if (active) setData(res.data); })
      .catch((err) => reportFormError(err, { fallback: "Could not load the service call" }))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [complaintId]);

  const c = data?.complaint;
  return (
    <>
      {loading && !data && <PageLoader label="Loading service call…" hint="Components, warranty and photos" minHeight="60vh" />}
      <Spin spinning={loading && !!data}>
        {c && <div className="space-y-5">
          {showProgress && <ServiceCallProgress status={c.Status} />}
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
            { key: "d", label: "Call date", children: day(c.CallDate) },
            { key: "t", label: "Call type", children: c.CallTypeName || "—" },
            { key: "due", label: "Due by", children: <span className={c.DueDate && dayjs(c.DueDate).isBefore(dayjs(), "day") && !["Closed", "Resolved", "Cancelled"].includes(c.Status) ? "text-red-600 font-semibold" : ""}>{day(c.DueDate)}</span> },
            { key: "p", label: "Priority", children: c.Priority },
            { key: "s", label: "Source", children: c.Source || "—" },
            { key: "w", label: "Warranty", children: c.WarrantyStatus ? <Tag color={c.WarrantyStatus === "In Warranty" ? "green" : c.WarrantyStatus === "Partial" ? "orange" : "default"}>{c.WarrantyStatus}</Tag> : "—" },
            { key: "pr", label: "Project / Scheme", children: c.ProjectName || "—" },
            { key: "dl", label: "Dealer", children: c.DealerName || "Direct" },
            { key: "sc", label: "Service center", children: c.ServiceCenterName || "—" },
            { key: "e", label: "Engineer", children: c.EngineerName || "Unassigned" },
            { key: "site", label: "Site", span: 2, children: [c.Address, c.Village, c.District, c.StateName, c.Pincode].filter(Boolean).join(", ") || "—" },
            { key: "text", label: "Problem reported", span: 3, children: c.ComplaintText },
            ...(c.Resolution ? [{ key: "res", label: "Resolution", span: 3, children: c.Resolution }] : []),
          ]} />

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-2">Faulty components</h3>
            <Table size="small" rowKey="ComplaintItemLnId" dataSource={data.components} pagination={false} scroll={{ x: 640 }} locale={{ emptyText: "No components recorded" }} columns={[
              { title: "Component", dataIndex: "Category" },
              { title: "Serial no", dataIndex: "SerialNo", render: (v: string) => v ? <span className="font-mono">{v}</span> : "—" },
              { title: "Model", dataIndex: "ModelName", render: (v: string) => v || "—" },
              { title: "Warranty", dataIndex: "Warranty", render: (w: any) => w ? <span><Tag color={STATE_TAG[w.State]}>{w.Label}</Tag>{w.EndDate && <span className="text-xs text-slate-400">till {day(w.EndDate)}</span>}</span> : "—" },
              { title: "Fault reported", dataIndex: "ReportedFault", render: (v: string) => v || "—" },
            ]} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card size="small" title="Visit reports" extra={data.visits?.length || 0}>{data.visits?.length ? data.visits.map((v: any, i: number) => <div key={i} className="flex justify-between gap-3 border-b border-slate-100 py-3 text-xs"><b>{v.VisitNo}</b><span>{day(v.VisitDate)}</span></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No visits recorded yet" />}</Card>
            <Card size="small" title="Job cards" extra={data.jobCards?.length || 0}>{data.jobCards?.length ? data.jobCards.map((j: any) => <div key={j.JobCardId} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-3 text-xs"><b>{j.JobCardNo}</b><span>{day(j.JobCardDate)}</span><Tag>{j.Status}</Tag><span>₹{Number(j.TotalEstimate || 0).toLocaleString("en-IN")}</span></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No job cards yet" />}</Card>
            <Card size="small" title="Activity"><div className="space-y-3 text-xs"><div className="border-l-2 border-teal-500 pl-3"><b>Call booked</b><p className="mt-1 text-slate-500">{day(c.CallDate)} · {c.CreatedBy || c.Source || "—"}</p></div>{(data.activity || []).map((a: any, i: number) => <div key={i} className="border-l-2 border-blue-200 pl-3"><b>{a.Action}</b><p className="mt-1 text-slate-500">{a.UserName || "—"}</p></div>)}</div></Card>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-2">Photos</h3>
            {data.photos.length ? (
              <Image.PreviewGroup>
                <div className="flex flex-wrap gap-3">
                  {data.photos.map((p: any) => <Image key={p.AttachmentId} src={p.FileUrl} alt={p.FileName} width={120} height={120} className="object-cover rounded-lg border border-slate-200" />)}
                </div>
              </Image.PreviewGroup>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No photos" />}
          </div>
          {data.videos?.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-2">Videos</h3>
              <VideoList videos={data.videos} />
            </div>
          )}
        </div>}
      </Spin>
    </>
  );
}
