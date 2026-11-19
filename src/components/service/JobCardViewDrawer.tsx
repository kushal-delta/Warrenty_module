"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Drawer, Empty, Image, Input, Modal, Spin, Steps, Table, Tabs, Tag, message } from "antd";
import { AuditOutlined, CameraOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, FileDoneOutlined, FileTextOutlined, HistoryOutlined, InfoCircleOutlined, PhoneOutlined, PrinterOutlined, SafetyCertificateOutlined, SendOutlined, ShopOutlined, ToolOutlined, UnorderedListOutlined, UserOutlined } from "@ant-design/icons";
import { CategoryIcon } from "@/components/warranty/SerialPassport";
import { useJobCardStore, JobCardDetail } from "@/lib/store/useJobCardStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { PageLoader } from "@/components/common/Loader";
import { VideoList } from "@/components/common/VideoAttachments";
import { ActivityTimeline } from "@/components/common/ActivityTimeline";

export const JOBCARD_STATUS_COLOR: Record<string, string> = { Draft: "default", "In Approval": "gold", Approved: "green", Rejected: "red", Closed: "blue" };

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

/* ---------- journey: Draft → approval levels → Approved → Closed ---------- */

type ChainStep = { title: string; description: string; status: "process" | "finish" | "error" | "wait" };
type StepState = "done" | "current" | "error" | "wait";

function JourneyStrip({ job, chain }: { job: any; chain: ChainStep[] }) {
  const s = job.Status as string;
  const after = (states: string[]) => states.includes(s);
  const steps: { label: string; sub: string; state: StepState }[] = [
    { label: "Draft", sub: `Created ${formatDate(job.JobCardDate)}`, state: s === "Draft" ? "current" : s === "Rejected" ? "error" : "done" },
    ...chain.map((c) => ({ label: c.title, sub: c.description, state: (c.status === "finish" ? "done" : c.status === "process" ? "current" : c.status === "error" ? "error" : "wait") as StepState })),
    { label: "Approved", sub: after(["Approved", "Closed"]) ? "Estimate approved" : "After the last level", state: s === "Approved" ? "current" : s === "Closed" ? "done" : "wait" },
    { label: "Closed", sub: s === "Closed" ? "Repair complete" : "When the repair is done", state: s === "Closed" ? "done" : "wait" },
  ];
  const next = s === "Draft" ? (chain.length ? "Next: send for approval" : "Next: send — no approval level applies, it is approved on submission")
    : s === "In Approval" ? `Waiting at ${job.PendingRole || `level ${job.CurrentLevel}`}`
    : s === "Approved" ? "Next: close the job card once the repair is complete"
    : s === "Rejected" ? "Rejected — edit the job card and send it again"
    : "Job card closed";
  const tone = s === "Rejected" ? "error" : s === "Closed" ? "done" : s === "Approved" ? "ok" : s === "In Approval" ? "wait" : "draft";
  const doneCount = steps.filter((x) => x.state === "done").length;
  return (
    <section className="jc-journey verify-pop">
      <div className="jc-journey-head">
        <span className={`jc-next jc-next-${tone}`}><span className="jc-next-dot" />{next}</span>
        <span className="text-[11px] font-semibold text-slate-400">{doneCount} of {steps.length} steps done</span>
      </div>
      <ol className="jc-steps">
        {steps.map((st, i) => (
          <li key={`${st.label}-${i}`} className={`jc-step is-${st.state}`}>
            <span className="jc-step-dot">{st.state === "done" ? <CheckOutlined /> : st.state === "error" ? <CloseOutlined /> : i + 1}</span>
            <span className="min-w-0">
              <span className="jc-step-label" title={st.label}>{st.label}</span>
              <span className="jc-step-sub" title={st.sub}>{st.sub}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- money: total, what it is made of, who pays ---------- */

function MoneyCard({ job }: { job: any }) {
  const total = Number(job.TotalEstimate) || 0;
  const company = Math.min(Number(job.WarrantyAmount) || 0, total);
  const customer = Number(job.CustomerPayable) || Math.max(0, total - company);
  const parts = [
    { label: "Spares", value: Number(job.SparesTotal) || 0, color: "#2563eb" },
    { label: "Labour", value: Number(job.LabourTotal) || 0, color: "#7c3aed" },
    { label: "GST", value: Number(job.GstTotal) || 0, color: "#f59e0b" },
    { label: "Other charges", value: Number(job.OtherCharges) || 0, color: "#64748b" },
  ];
  const sum = parts.reduce((a, p) => a + p.value, 0) || 1;
  const companyPct = total ? Math.round((company / total) * 100) : 0;
  return (
    <section className="jc-money verify-pop">
      <div className="jc-money-total">
        <span className="jc-label">Grand total</span>
        <strong>₹ {inr(total, 2)}</strong>
        <span className="text-xs text-slate-500">{job.WarrantyStatus ? `Warranty status · ${job.WarrantyStatus}` : "Estimate for this repair"}</span>
      </div>
      <div className="jc-money-parts">
        <span className="jc-label">What it is made of</span>
        <div className="jc-stack" aria-hidden="true">
          {parts.filter((p) => p.value > 0).map((p) => <i key={p.label} style={{ width: `${(p.value / sum) * 100}%`, background: p.color }} title={`${p.label} ₹ ${inr(p.value, 2)}`} />)}
        </div>
        <div className="jc-legend">
          {parts.map((p) => (
            <span key={p.label} className={p.value ? "" : "is-zero"}><i style={{ background: p.color }} />{p.label}<b>₹ {inr(p.value, 2)}</b></span>
          ))}
        </div>
      </div>
      <div className="jc-money-split">
        <span className="jc-label">Who pays</span>
        <div className="jc-split-bar" aria-hidden="true"><i style={{ width: `${companyPct}%` }} /></div>
        <div className="jc-payers">
          <div className="jc-payer is-company"><span>Company · warranty</span><b>₹ {inr(company, 2)}</b><em>{companyPct}%</em></div>
          <div className="jc-payer is-customer"><span>Customer pays</span><b>₹ {inr(customer, 2)}</b><em>{100 - companyPct}%</em></div>
        </div>
      </div>
    </section>
  );
}

/* ---------- details tab: customer & call, service, problem, faults, components ---------- */

const FAULT_TONE: Record<string, string> = { PUMP: "#2563eb", MOTOR: "#0891b2", CONTROLLER: "#7c3aed" };
const initials = (name?: string) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
function warrantyTone(v?: string) {
  const t = String(v || "").toLowerCase();
  if (/in warranty|active|under/.test(t)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (/out|expired|void/.test(t)) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="jc-fact"><span>{label}</span><b>{children || "—"}</b></div>;
}

function DetailsView({ job, data }: { job: any; data: JobCardDetail }) {
  const components: any[] = data.components || [];
  return (
    <div className="jc-details">
      <div className="jc-card jc-person">
        <div className="flex items-center gap-3">
          <span className="jc-avatar">{initials(job.CustomerName)}</span>
          <div className="min-w-0 flex-1">
            <div className="jc-label">Customer</div>
            <div className="truncate text-base font-bold text-slate-900">{job.CustomerName}</div>
            <a href={`tel:${job.Mobile}`} className="text-xs font-semibold text-blue-600"><PhoneOutlined /> +91 {job.Mobile}</a>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${warrantyTone(job.WarrantyStatus)}`}><SafetyCertificateOutlined /> {job.WarrantyStatus || "Warranty unknown"}</span>
        </div>
        <div className="jc-facts mt-4">
          <Fact label="Service call">{job.ComplaintNo}</Fact>
          <Fact label="Call date">{formatDate(job.CallDate)}</Fact>
        </div>
      </div>

      <div className="jc-card">
        <div className="jc-label mb-3">Service</div>
        <div className="jc-facts">
          <Fact label="Job card date">{formatDate(job.JobCardDate)}</Fact>
          <Fact label="Status"><Tag color={JOBCARD_STATUS_COLOR[job.Status]} className="m-0">{job.Status}</Tag></Fact>
          <Fact label="Engineer"><span><UserOutlined className="mr-1 text-slate-400" />{job.EngineerName?.trim() || "—"}</span></Fact>
          <Fact label="Service center"><span><ShopOutlined className="mr-1 text-slate-400" />{job.ServiceCenterName || "—"}</span></Fact>
        </div>
      </div>

      <div className="jc-card jc-wide jc-problem">
        <div className="jc-label mb-2">Problem reported by the customer</div>
        <p>{job.ComplaintText || "—"}</p>
        {job.Remarks && <div className="jc-note"><FileTextOutlined /> <span><b>Engineer notes · </b>{job.Remarks}</span></div>}
      </div>

      <div className="jc-card">
        <div className="mb-3 flex items-center justify-between"><span className="jc-label">Faults found</span><span className="jc-count">{data.faults.length}</span></div>
        {data.faults.length ? (
          <div className="flex flex-col gap-2">
            {data.faults.map((f) => {
              const color = FAULT_TONE[String(f.Category).toUpperCase()] || "#ea580c";
              return (
                <div key={f.JobCardFaultLnId} className="jc-fault" style={{ ["--c" as any]: color }}>
                  <span className="jc-fault-icon"><CategoryIcon category={f.Category} /></span>
                  <span className="min-w-0"><span className="jc-fault-cat">{f.Category}</span><span className="jc-fault-name">{f.FaultName}</span></span>
                </div>
              );
            })}
          </div>
        ) : <span className="text-xs text-slate-400">None recorded</span>}
      </div>

      <div className="jc-card">
        <div className="mb-3 flex items-center justify-between"><span className="jc-label">Components on the call</span><span className="jc-count">{components.length}</span></div>
        {components.length ? (
          <div className="flex flex-col gap-2">
            {components.map((c, i) => {
              const color = FAULT_TONE[String(c.Category).toUpperCase()] || "#64748b";
              return (
                <div key={`${c.SerialNo}-${i}`} className="jc-fault" style={{ ["--c" as any]: color }}>
                  <span className="jc-fault-icon"><CategoryIcon category={c.Category} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="jc-fault-cat">{c.Category}{c.ModelName ? ` · ${c.ModelName}` : ""}</span>
                    <span className="jc-fault-name font-mono">{c.SerialNo || "No serial"}</span>
                    {c.ReportedFault && <span className="block truncate text-[11px] text-slate-500" title={c.ReportedFault}>{c.ReportedFault}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : <span className="text-xs text-slate-400">No component serials on this call</span>}
      </div>
    </div>
  );
}

interface Props {
  jobCardId: string | null;
  onClose: () => void;
  onEdit: (jobCardId: string) => void;
  onChanged: () => void;
}

/** Read-only job card with its approval chain and the actions open to the signed-in user. */
export function JobCardViewDrawer({ jobCardId, onClose, onEdit, onChanged }: Props) {
  const { fetchJobCardDetail, decideJobCard, closeJobCard, deleteJobCard } = useJobCardStore();
  const user = useAuthStore((s) => s.user);
  const isHO = user?.Role === "SUPER" || user?.Role === "HO" || user?.IsAdmin;
  const [data, setData] = useState<JobCardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<"Approved" | "Rejected" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [closing, setClosing] = useState(false);
  const [resolveCall, setResolveCall] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState("details");

  const load = useCallback(async () => {
    if (!jobCardId) return;
    setLoading(true);
    try { setData(await fetchJobCardDetail(jobCardId)); }
    catch (err) { reportFormError(err, { fallback: "Could not load job card" }); }
    finally { setLoading(false); }
  }, [jobCardId, fetchJobCardDetail]);

  useEffect(() => { setData(null); setTab("details"); load(); }, [load]);

  const run = async (work: () => Promise<string | void>) => {
    setBusy(true);
    try {
      const msg = await work();
      if (msg) message.success(msg);
      await load();
      onChanged();
      return true;
    } catch (err) {
      reportFormError(err, { fallback: "Could not update job card" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const job = data?.jobCard;
  const editable = job && (job.Status === "Draft" || job.Status === "Rejected" || (isHO && job.Status === "In Approval"));
  const canDelete = job && (job.Status === "Draft" || job.Status === "Rejected" || isHO);

  // Approval chain: every level the amount needs, with the latest decision taken at that level.
  const chain = (data?.levels || []).map((level) => {
    const last = [...(data?.approvals || [])].reverse().find((a) => a.LevelNo === level.LevelNo);
    const current = job?.Status === "In Approval" && job.CurrentLevel === level.LevelNo;
    const done = last && (job?.Status === "Approved" || job?.Status === "Closed" || (job?.Status === "In Approval" && level.LevelNo < job.CurrentLevel));
    return {
      title: `L${level.LevelNo} · ${level.RoleName}`,
      description: current ? "Waiting" : done ? `${last.Action} by ${last.ApproverName} · ${formatDate(last.ActionDate)}` : job?.Status === "Rejected" && last?.Action === "Rejected" ? `Rejected by ${last.ApproverName}` : `From ₹ ${inr(level.MinAmount)}`,
      status: (current ? "process" : done ? "finish" : job?.Status === "Rejected" && last?.Action === "Rejected" ? "error" : "wait") as "process" | "finish" | "error" | "wait",
    };
  });

  return (
    <Drawer open={!!jobCardId} onClose={onClose} width={DRAWER_WIDTH} closable={false} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
      title={<DrawerHeader icon={<ToolOutlined />} title={job ? `Job Card ${job.JobCardNo}` : "Job Card"} subtitle={job ? `Call ${job.ComplaintNo} · ${job.CustomerName}${job.Status === "In Approval" ? ` · waiting at ${job.PendingRole || `level ${job.CurrentLevel}`}` : ""}` : ""} meta={job && <DrawerChip label={job.Status} tone="solid" />} onClose={onClose} />}
      footer={job && <div className="flex flex-wrap justify-end gap-2 py-2">
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print</Button>
        {canDelete && <Button danger icon={<DeleteOutlined />} onClick={() => setDeleting(true)} disabled={busy}>Delete</Button>}
        {editable && <Button icon={<EditOutlined />} onClick={() => onEdit(job.JobCardId)} disabled={busy}>Edit</Button>}
        {(job.Status === "Draft" || job.Status === "Rejected") && <Button type="primary" icon={<SendOutlined />} loading={busy} className="bg-blue-600" onClick={() => run(async () => (await decideJobCard({ JobCardId: job.JobCardId, action: "Submit" })).message)}>Send for Approval</Button>}
        {job.CanAct && <>
          <Button danger icon={<CloseOutlined />} onClick={() => { setRemarks(""); setDecision("Rejected"); }} disabled={busy}>Reject</Button>
          <Button type="primary" icon={<CheckOutlined />} className="bg-green-600" onClick={() => { setRemarks(""); setDecision("Approved"); }} disabled={busy}>Approve (L{job.CurrentLevel})</Button>
        </>}
        {job.Status === "Approved" && user?.Role !== "ENGINEER" && <Button type="primary" icon={<FileDoneOutlined />} className="bg-blue-600" onClick={() => setClosing(true)} disabled={busy}>Close Job Card</Button>}
      </div>}
    >
      {loading && !data && <PageLoader label="Loading job card…" hint="Lines, approvals and photos" minHeight="60vh" />}
      <Spin spinning={loading && !!data}>
        {job && data && <div className="jc-view space-y-5">
          {job.Status === "Rejected" && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Rejected: {[...data.approvals].reverse().find((a) => a.Action === "Rejected")?.Remarks || "no reason given"}. Edit the job card and send it again.</div>}
          {/* Where the job card is in its journey, and what happens next */}
          <JourneyStrip job={job} chain={chain} />

          {/* At a glance: the money — what it is made of and who pays */}
          <MoneyCard job={job} />

          <Tabs activeKey={tab} onChange={setTab} items={[
            { key: "details", label: tabLabel(<InfoCircleOutlined />, "Details"), children: (
              <DetailsView job={job} data={data} />
            ) },
            { key: "lines", label: tabLabel(<UnorderedListOutlined />, "Spares & labour", data.items.length), children: (
              <Table size="middle" rowKey="JobCardItemLnId" dataSource={data.items} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: "No lines" }}
                summary={(rows) => rows.length ? (
                  <Table.Summary.Row className="bg-slate-50">
                    <Table.Summary.Cell index={0} colSpan={6}><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{rows.length} line{rows.length === 1 ? "" : "s"} · {rows.filter((r: any) => r.IsWarranty).length} under warranty</span></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right"><b className="text-slate-900">₹ {inr(rows.reduce((s: number, r: any) => s + Number(r.Amount) + Number(r.GstAmount || 0), 0), 2)}</b></Table.Summary.Cell>
                    <Table.Summary.Cell index={2} />
                  </Table.Summary.Row>
                ) : null}
                columns={[
                { title: "Type", dataIndex: "ItemType", render: (t: string) => <Tag color={t === "Labour" ? "purple" : "blue"}>{t || "Spare"}</Tag> },
                { title: "Particulars", key: "s", render: (_: any, i: any) => <span><b>{i.Particulars || i.SpareName}</b> <span className="text-xs text-slate-400">{i.ItemCode || i.SpareCode}</span></span> },
                { title: "Serial", dataIndex: "SerialNo", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : "—" },
                { title: "Qty", dataIndex: "Qty", align: "right" as const, render: (q: number, i: any) => `${q} ${i.Uom || ""}` },
                { title: "Rate ₹", dataIndex: "Rate", align: "right" as const, render: (v: number) => inr(v, 2) },
                { title: "GST", key: "gst", align: "right" as const, render: (_: any, i: any) => `${Number(i.GstPct || 0)}% · ${inr(i.GstAmount, 2)}` },
                { title: "Amount ₹", key: "amt", align: "right" as const, render: (_: any, i: any) => <b>{inr(Number(i.Amount) + Number(i.GstAmount || 0), 2)}</b> },
                { title: "Warranty", dataIndex: "IsWarranty", align: "center" as const, render: (w: boolean) => w ? <Tag color="green">Warranty</Tag> : <Tag>Chargeable</Tag> },
              ]} />
            ) },
            { key: "media", label: tabLabel(<CameraOutlined />, "Photos & Videos", (data.photos?.length || 0) + (data.videos?.length || 0)), children: (
              <div className="space-y-4">
                <Panel title="Photos" extra={<span className="text-xs text-slate-400">{data.photos?.length || 0}</span>}>
                  {data.photos?.length ? (
                    <Image.PreviewGroup>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                        {data.photos.map((p: any) => (
                          <div key={p.AttachmentId} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <Image src={p.FileUrl} alt={p.FileName} width="100%" height={130} className="object-cover" />
                            <div className="truncate px-2 py-1 text-[11px] text-slate-500" title={p.FileName}>{p.FileName}</div>
                          </div>
                        ))}
                      </div>
                    </Image.PreviewGroup>
                  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No photos" />}
                </Panel>
                <Panel title="Videos" extra={<span className="text-xs text-slate-400">{data.videos?.length || 0}</span>}>
                  {data.videos?.length ? <VideoList videos={data.videos} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No videos" />}
                </Panel>
              </div>
            ) },
            { key: "approvals", label: tabLabel(<AuditOutlined />, "Approvals", data.approvals.length), children: (
              <div className="space-y-4">
                <Panel title="Approval chain">
                  {chain.length ? <Steps size="small" items={chain} /> : <span className="text-xs text-slate-400">No approval level applies to this amount — the job card is approved on submission.</span>}
                </Panel>
                <Panel title="Approval trail" extra={<span className="text-xs text-slate-400">{data.approvals.length}</span>}>
                  {data.approvals.length ? <Table size="small" rowKey="JobCardApprovalLnId" dataSource={data.approvals} pagination={false} columns={[
                    { title: "When", dataIndex: "ActionDate", render: (v: string) => formatDate(v, true) },
                    { title: "Level", dataIndex: "LevelNo", render: (v: number) => `L${v}` },
                    { title: "By", dataIndex: "ApproverName" },
                    { title: "Action", dataIndex: "Action", render: (a: string) => <Tag color={a === "Approved" ? "green" : "red"}>{a}</Tag> },
                    { title: "Remarks", dataIndex: "Remarks", render: (v: string) => v || "-" },
                  ]} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No approval decisions yet" />}
                </Panel>
              </div>
            ) },
            { key: "activity", label: tabLabel(<HistoryOutlined />, "Activity", ((data as any).activity || []).length), children: (
              <Panel title="Activity" extra={<span className="text-xs text-slate-400">newest first</span>}>
                <ActivityTimeline items={(data as any).activity || []} />
              </Panel>
            ) },
          ]} />
        </div>}
      </Spin>

      <Modal open={!!decision} title={decision === "Rejected" ? `Reject ${job?.JobCardNo}` : `Approve ${job?.JobCardNo} (level ${job?.CurrentLevel})`} onCancel={() => setDecision(null)} confirmLoading={busy}
        okText={decision === "Rejected" ? "Reject" : "Approve"} okButtonProps={{ danger: decision === "Rejected", className: decision === "Rejected" ? "" : "bg-green-600" }}
        onOk={async () => {
          if (decision === "Rejected" && !remarks.trim()) { message.error("Enter the reason for rejection"); return; }
          if (await run(async () => (await decideJobCard({ JobCardId: job!.JobCardId, action: decision!, remarks })).message)) setDecision(null);
        }}>
        <p className="text-xs text-slate-500 mb-2">{decision === "Rejected" ? "The reason is sent back to the engineer." : "Remarks are optional. The final level posts stock consumption and informs the customer."}</p>
        <Input.TextArea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={250} placeholder={decision === "Rejected" ? "Reason for rejection" : "Remarks (optional)"} />
      </Modal>

      <Modal open={closing} title={`Close ${job?.JobCardNo}`} onCancel={() => setClosing(false)} confirmLoading={busy} okText="Close Job Card"
        onOk={async () => { if (await run(async () => { await closeJobCard({ JobCardId: job!.JobCardId, resolveCall, remarks: remarks || undefined }); return "Job card closed"; })) setClosing(false); }}>
        <p className="text-xs text-slate-500 mb-2">Close the job card once the repair is complete.</p>
        <Input.TextArea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Completion remarks (optional)" className="mb-3" />
        <Checkbox checked={resolveCall} onChange={(e) => setResolveCall(e.target.checked)}>Also mark service call {job?.ComplaintNo} as Resolved</Checkbox>
      </Modal>

      <ConfirmModal open={deleting} title="Delete Job Card" description={`Delete job card ${job?.JobCardNo}?`} warningText={job?.Status === "Approved" || job?.Status === "Closed" ? "Stock consumed by this job card will be returned to stock." : "Lines and approval trail are removed with it."} loading={busy} onCancel={() => setDeleting(false)}
        onConfirm={async () => { setBusy(true); try { await deleteJobCard(job!.JobCardId); message.success("Job card deleted"); setDeleting(false); onChanged(); onClose(); } catch (err) { reportFormError(err, { fallback: "Could not delete job card" }); } finally { setBusy(false); } }} />
    </Drawer>
  );
}
