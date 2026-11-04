"use client";

import { Steps, Tag } from "antd";

const stages = ["Booked", "Assigned", "Visited", "Job card sent", "Approved", "Resolved", "Closed"];
const stage: Record<string, number> = { New: 0, Assigned: 1, Visited: 2, "In Approval": 3, Approved: 4, Resolved: 5, Closed: 6 };

export function ServiceCallProgress({ status }: { status: string }) {
  const current = stage[status];
  return <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5" aria-label="Service call progress">
    <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-800">Service progress</h3><Tag color={status === "Cancelled" ? "red" : "blue"}>{status}</Tag></div>
    {current !== undefined ? <div className="overflow-x-auto pb-2"><Steps size="small" responsive={false} current={current} status={status === "Closed" ? "finish" : "process"} items={stages.map(title => ({ title }))} style={{ minWidth: 720 }} /></div> : <p className="text-xs text-slate-500">{status === "Cancelled" ? "This service call was cancelled." : "No workflow stage is available for this status."}</p>}
  </section>;
}
