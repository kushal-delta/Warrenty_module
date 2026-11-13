"use client";

import React from "react";
import { Empty, Tag, Tooltip } from "antd";
import {
  CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, EditOutlined, FileDoneOutlined, PlusCircleOutlined,
  SendOutlined, ToolOutlined, UserSwitchOutlined, CarOutlined, HistoryOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

/** One audit-log entry as the detail APIs return it (Details already parsed). */
export interface ActivityItem {
  AuditLogId?: string;
  Action: string;
  TableName?: string;
  Details?: any;
  LogOn?: string | null;
  UserName?: string | null;
  EngineerName?: string | null;
}

interface Described { title: React.ReactNode; tone: string; icon: React.ReactNode; chips: [string, React.ReactNode][]; note?: string | null }

const TONES: Record<string, { dot: string; ring: string }> = {
  green: { dot: "bg-emerald-500", ring: "ring-emerald-100" },
  blue: { dot: "bg-blue-500", ring: "ring-blue-100" },
  purple: { dot: "bg-violet-500", ring: "ring-violet-100" },
  cyan: { dot: "bg-cyan-500", ring: "ring-cyan-100" },
  amber: { dot: "bg-amber-500", ring: "ring-amber-100" },
  red: { dot: "bg-red-500", ring: "ring-red-100" },
  slate: { dot: "bg-slate-400", ring: "ring-slate-100" },
};
const inr = (v: unknown) => `₹ ${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const title = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/** Turns a raw audit entry ("UPDATE" on "JobCards" + details) into a readable line. */
function describe(a: ActivityItem): Described {
  const d = a.Details && typeof a.Details === "object" ? a.Details : {};
  const act = String(a.Action || "").toUpperCase();
  switch (a.TableName) {
    case "VisitReports": {
      const no = d.VisitNo ? <b className="font-mono">{d.VisitNo}</b> : "Visit report";
      if (act === "DELETE") return { title: <>Visit report {no} deleted</>, tone: "red", icon: <DeleteOutlined />, chips: [] };
      return { title: <>Visit report {no} {act === "CREATE" ? "recorded" : "updated"}</>, tone: "cyan", icon: <CarOutlined />, chips: d.Outcome ? [["Outcome", d.Outcome]] : [] };
    }
    case "JobCards": {
      const no = d.JobCardNo ? <b className="font-mono">{d.JobCardNo}</b> : null;
      const chips: [string, React.ReactNode][] = [];
      if (d.Total != null) chips.push(["Estimate", inr(d.Total)]);
      if (d.Lines != null) chips.push(["Lines", d.Lines]);
      if (d.Status && act !== "CREATE") chips.push(["Status", d.Status]);
      const map: Record<string, [string, string, React.ReactNode]> = {
        CREATE: ["created", "blue", <ToolOutlined key="i" />], UPDATE: ["updated", "blue", <EditOutlined key="i" />],
        SUBMIT: ["sent for approval", "amber", <SendOutlined key="i" />], APPROVE: ["approved", "green", <CheckCircleOutlined key="i" />],
        REJECT: ["rejected", "red", <CloseCircleOutlined key="i" />], CLOSE: ["closed", "green", <FileDoneOutlined key="i" />], DELETE: ["deleted", "red", <DeleteOutlined key="i" />],
      };
      const [verb, tone, icon] = map[act] || [title(act), "slate", <HistoryOutlined key="i" />];
      return { title: <>Job card {no} {verb}</>, tone, icon, chips, note: d.Remarks || null };
    }
    default: {
      // Service call (Complaints)
      if (act === "CREATE") return { title: "Service call booked", tone: "green", icon: <PlusCircleOutlined />, chips: [
        ...(d.ComplaintNo ? [["Call", <span key="c" className="font-mono">{d.ComplaintNo}</span>] as [string, React.ReactNode]] : []),
        ...(d.Customer ? [["Customer", d.Customer] as [string, React.ReactNode]] : []),
        ...(d.Components != null ? [["Components", d.Components] as [string, React.ReactNode]] : []),
        ...(d.Photos ? [["Photos", d.Photos] as [string, React.ReactNode]] : []),
      ] };
      if (act === "UPDATE") return { title: "Service call updated", tone: "blue", icon: <EditOutlined />, chips: d.Status ? [["Status", d.Status]] : [] };
      if (act === "ASSIGN") return { title: <>Engineer assigned{a.EngineerName ? <> — <b>{a.EngineerName}</b></> : null}</>, tone: "purple", icon: <UserSwitchOutlined />, chips: [] };
      if (act === "CLOSE") return { title: `Service call ${String(d.Status || "closed").toLowerCase()}`, tone: "green", icon: <CheckCircleOutlined />, chips: [], note: d.Resolution || null };
      if (act === "DELETE") return { title: "Service call deleted", tone: "red", icon: <DeleteOutlined />, chips: [] };
      return { title: title(act), tone: "slate", icon: <HistoryOutlined />, chips: [] };
    }
  }
}

const dayLabel = (v: dayjs.Dayjs) => (v.isSame(dayjs(), "day") ? "Today" : v.isSame(dayjs().subtract(1, "day"), "day") ? "Yesterday" : v.format("DD MMM YYYY"));

/**
 * Readable activity trail (newest first), grouped by day: what happened, who did it, when, and the key details.
 * `booked` adds the "booked" line from the record itself when the log has no CREATE entry (older records).
 */
export function ActivityTimeline({ items, booked }: { items: ActivityItem[]; booked?: { on?: string | null; by?: string | null; label?: string } }) {
  const list = [...(items || [])];
  if (booked && !list.some((a) => String(a.Action).toUpperCase() === "CREATE" && (!a.TableName || a.TableName === "Complaints"))) {
    list.push({ Action: "CREATE", TableName: "Complaints", LogOn: booked.on || null, UserName: booked.by || null, Details: {} });
  }
  if (!list.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity yet" />;

  const groups: { label: string; items: ActivityItem[] }[] = [];
  list.forEach((a) => {
    const label = a.LogOn ? dayLabel(dayjs(a.LogOn)) : "Earlier";
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(a); else groups.push({ label, items: [a] });
  });

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.label}</div>
          <ol className="relative ml-3 border-l border-slate-200">
            {g.items.map((a, i) => {
              const x = describe(a);
              const tone = TONES[x.tone] || TONES.slate;
              const at = a.LogOn ? dayjs(a.LogOn) : null;
              return (
                <li key={a.AuditLogId || `${g.label}-${i}`} className="relative pb-4 pl-6 last:pb-0">
                  <span className={`absolute -left-[9px] top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] text-white ring-4 ${tone.dot} ${tone.ring}`}>{x.icon}</span>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <div className="text-sm text-slate-800">{x.title}</div>
                    {at && <Tooltip title={at.format("DD MMM YYYY, hh:mm:ss A")}><span className="whitespace-nowrap text-xs text-slate-400">{at.format("hh:mm A")}</span></Tooltip>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">by <span className="font-medium text-slate-600">{a.UserName?.trim() || "—"}</span>{at ? ` · ${at.format("DD MMM YYYY")}` : ""}</div>
                  {x.chips.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{x.chips.map(([k, v]) => <Tag key={k} className="!mr-0 !text-[11px]"><span className="text-slate-400">{k}:</span> {v}</Tag>)}</div>}
                  {x.note && <div className="mt-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">{x.note}</div>}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
