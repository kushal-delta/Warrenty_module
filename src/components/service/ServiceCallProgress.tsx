"use client";

import { CheckOutlined, CloseOutlined } from "@ant-design/icons";

const stages = [
  { label: "Booked", sub: "Call registered" },
  { label: "Assigned", sub: "Engineer allotted" },
  { label: "Visited", sub: "Site visit done" },
  { label: "Job card sent", sub: "Estimate in approval" },
  { label: "Approved", sub: "Estimate approved" },
  { label: "Resolved", sub: "Repair complete" },
  { label: "Closed", sub: "Call closed" },
];
const stage: Record<string, number> = { New: 0, Assigned: 1, Visited: 2, "In Approval": 3, Approved: 4, Resolved: 5, Closed: 6 };
const NEXT: Record<string, { text: string; tone: string }> = {
  New: { text: "Next: assign an engineer", tone: "draft" },
  Assigned: { text: "Next: engineer visits the site", tone: "wait" },
  Visited: { text: "Next: raise the job card / estimate", tone: "wait" },
  "In Approval": { text: "Job card waiting for approval", tone: "wait" },
  Approved: { text: "Next: complete the repair and resolve the call", tone: "ok" },
  Resolved: { text: "Next: close the service call", tone: "ok" },
  Closed: { text: "Service call closed", tone: "done" },
  Cancelled: { text: "This service call was cancelled", tone: "error" },
};

/** Service call journey: Booked → … → Closed, with the next action (same look as the job card journey). */
export function ServiceCallProgress({ status }: { status: string }) {
  const current = stage[status];
  const next = NEXT[status] || { text: status, tone: "draft" };
  const cancelled = status === "Cancelled";
  const doneCount = current === undefined ? 0 : status === "Closed" ? stages.length : current;
  return (
    <section className="jc-journey jc-view verify-pop" aria-label="Service call progress">
      <div className="jc-journey-head">
        <span className={`jc-next jc-next-${next.tone}`}><span className="jc-next-dot" />{next.text}</span>
        {!cancelled && current !== undefined && <span className="text-[11px] font-semibold text-slate-400">{doneCount} of {stages.length} steps done</span>}
      </div>
      {current !== undefined || cancelled ? (
        <ol className="jc-steps">
          {stages.map((st, i) => {
            const state = cancelled ? (i === 0 ? "done" : i === 1 ? "error" : "wait") : status === "Closed" || i < current ? "done" : i === current ? "current" : "wait";
            return (
              <li key={st.label} className={`jc-step is-${state}`}>
                <span className="jc-step-dot">{state === "done" ? <CheckOutlined /> : state === "error" ? <CloseOutlined /> : i + 1}</span>
                <span className="min-w-0">
                  <span className="jc-step-label">{cancelled && i === 1 ? "Cancelled" : st.label}</span>
                  <span className="jc-step-sub">{cancelled && i === 1 ? "No further work" : st.sub}</span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : <p className="text-xs text-slate-500">No workflow stage is available for this status.</p>}
    </section>
  );
}
