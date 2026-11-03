"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Descriptions, Drawer, Input, Modal, Spin, Steps, Table, Tag, message } from "antd";
import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, FileDoneOutlined, PrinterOutlined, SendOutlined, ToolOutlined } from "@ant-design/icons";
import { useJobCardStore, JobCardDetail } from "@/lib/store/useJobCardStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

export const JOBCARD_STATUS_COLOR: Record<string, string> = { Draft: "default", "In Approval": "gold", Approved: "green", Rejected: "red", Closed: "blue" };

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

  const load = useCallback(async () => {
    if (!jobCardId) return;
    setLoading(true);
    try { setData(await fetchJobCardDetail(jobCardId)); }
    catch (err) { reportFormError(err, { fallback: "Could not load job card" }); }
    finally { setLoading(false); }
  }, [jobCardId, fetchJobCardDetail]);

  useEffect(() => { setData(null); load(); }, [load]);

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
      <Spin spinning={loading}>
        {job && data && <div className="space-y-5">
          {job.Status === "Rejected" && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Rejected: {[...data.approvals].reverse().find((a) => a.Action === "Rejected")?.Remarks || "no reason given"}. Edit the job card and send it again.</div>}
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} items={[
            { key: "d", label: "Date", children: formatDate(job.JobCardDate) },
            { key: "s", label: "Status", children: <Tag color={JOBCARD_STATUS_COLOR[job.Status]}>{job.Status}</Tag> },
            { key: "c", label: "Call", children: `${job.ComplaintNo} (${formatDate(job.CallDate)})` },
            { key: "cu", label: "Customer", children: `${job.CustomerName} · ${job.Mobile}` },
            { key: "e", label: "Engineer", children: job.EngineerName?.trim() || "-" },
            { key: "sc", label: "Service Center", children: job.ServiceCenterName || "-" },
            { key: "w", label: "Warranty Status", children: job.WarrantyStatus || "-" },
            { key: "p", label: "Problem", span: 2, children: job.ComplaintText },
            { key: "n", label: "Notes", span: 3, children: job.Remarks || "-" },
          ]} />

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-2">Faults found</h3>
            {data.faults.length ? <div className="flex flex-wrap gap-1.5">{data.faults.map((f) => <Tag key={f.JobCardFaultLnId} color="volcano">{f.Category} · {f.FaultName}</Tag>)}</div> : <span className="text-xs text-slate-400">None recorded</span>}
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-2">Spares</h3>
            <Table size="small" rowKey="JobCardItemLnId" dataSource={data.items} pagination={false} scroll={{ x: 600 }} locale={{ emptyText: "No spares" }} columns={[
              { title: "Spare", key: "s", render: (_: any, i: any) => <span><b>{i.SpareName}</b> <span className="text-xs text-slate-400">{i.SpareCode}</span></span> },
              { title: "Qty", dataIndex: "Qty", align: "right" as const, render: (q: number, i: any) => `${q} ${i.Uom || ""}` },
              { title: "Rate ₹", dataIndex: "Rate", align: "right" as const, render: (v: number) => inr(v, 2) },
              { title: "Amount ₹", dataIndex: "Amount", align: "right" as const, render: (v: number) => inr(v, 2) },
              { title: "Warranty", dataIndex: "IsWarranty", align: "center" as const, render: (w: boolean) => w ? <Tag color="green">Warranty</Tag> : <Tag>Chargeable</Tag> },
            ]} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            {[["Spares", job.SparesTotal], ["Labour", job.LabourTotal], ["Total estimate", job.TotalEstimate], ["Warranty (company)", job.WarrantyAmount], ["Customer pays", job.CustomerPayable]].map(([label, value]) => (
              <div key={label as string} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2"><div className="text-[11px] text-slate-500">{label}</div><div className="font-bold text-slate-900">₹ {inr(value, 2)}</div></div>
            ))}
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Approval chain</h3>
            {chain.length ? <Steps size="small" items={chain} /> : <span className="text-xs text-slate-400">No approval level applies to this amount — the job card is approved on submission.</span>}
          </div>

          {data.approvals.length > 0 && <div>
            <h3 className="text-sm font-bold text-slate-800 mb-2">Approval trail</h3>
            <Table size="small" rowKey="JobCardApprovalLnId" dataSource={data.approvals} pagination={false} columns={[
              { title: "When", dataIndex: "ActionDate", render: (v: string) => formatDate(v, true) },
              { title: "Level", dataIndex: "LevelNo", render: (v: number) => `L${v}` },
              { title: "By", dataIndex: "ApproverName" },
              { title: "Action", dataIndex: "Action", render: (a: string) => <Tag color={a === "Approved" ? "green" : "red"}>{a}</Tag> },
              { title: "Remarks", dataIndex: "Remarks", render: (v: string) => v || "-" },
            ]} />
          </div>}
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
