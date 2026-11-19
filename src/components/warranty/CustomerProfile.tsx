"use client";

import React, { useState } from "react";
import { Empty, Tabs, Tag, Tooltip } from "antd";
import { CalendarOutlined, CustomerServiceOutlined, EnvironmentOutlined, HomeOutlined, MailOutlined, PhoneOutlined, SafetyCertificateOutlined, ShopOutlined, TranslationOutlined, RightOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { StatStrip } from "@/components/common/PageHeader";
import { CategoryIcon } from "@/components/warranty/SerialPassport";
import { ServiceCallDetailDrawer } from "@/components/service/ServiceCallDetailDrawer";
import { formatDate } from "@/lib/utils/dateFormat";

const CAT_COLOR: Record<string, string> = { PUMP: "#2563eb", MOTOR: "#0891b2", CONTROLLER: "#7c3aed" };
const CALL_COLOR: Record<string, string> = { New: "blue", Assigned: "purple", Visited: "cyan", "In Approval": "gold", Approved: "green", Resolved: "green", Closed: "default", Cancelled: "red" };
const LANGUAGE: Record<string, string> = { EN: "English", HI: "Hindi", GU: "Gujarati" };
const OPEN_CALL = (s?: string) => !["Closed", "Resolved", "Cancelled"].includes(String(s));
const initials = (name?: string) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const tabLabel = (text: string, count: number) => (
  <span className="inline-flex items-center gap-1.5">{text}<span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{count}</span></span>
);

/** Warranty state for the cards: active / expiring (≤ 45 days) / expired / other status (Void, Replaced …). */
function stateOf(w: any) {
  const end = w.EndDate ? dayjs(w.EndDate) : null, start = w.StartDate ? dayjs(w.StartDate) : null;
  const left = end ? end.startOf("day").diff(dayjs().startOf("day"), "day") : null;
  const total = start && end ? Math.max(1, end.diff(start, "day")) : 1;
  const used = start ? Math.min(100, Math.max(0, (dayjs().diff(start, "day") / total) * 100)) : 0;
  if (w.Status && w.Status !== "Active") return { key: "other", label: w.Status, cls: "border-slate-200 bg-slate-100 text-slate-600", bar: "#94a3b8", left, used };
  if (left !== null && left < 0) return { key: "expired", label: "Expired", cls: "border-red-200 bg-red-50 text-red-700", bar: "#dc2626", left, used: 100 };
  if (left !== null && left <= 45) return { key: "expiring", label: "Expiring", cls: "border-amber-200 bg-amber-50 text-amber-800", bar: "#f59e0b", left, used };
  return { key: "active", label: "Active", cls: "border-emerald-200 bg-emerald-50 text-emerald-700", bar: "#10b981", left, used };
}
const leftText = (left: number | null, key: string) => left === null ? "" : key === "expired" ? `ended ${-left} days ago` : left === 0 ? "ends today" : left < 60 ? `${left} days left` : `${(left / 365.25).toFixed(1)} years left`;

function WarrantyCard({ w }: { w: any }) {
  const st = stateOf(w), color = CAT_COLOR[String(w.Category).toUpperCase()] || "#64748b";
  return (
    <div className="cp-wcard" style={{ ["--c" as any]: color }}>
      <div className="flex items-start gap-3">
        <span className="jc-fault-icon !h-10 !w-10 !text-lg"><CategoryIcon category={w.Category} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="jc-fault-cat">{w.Category}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-px text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
          </div>
          <div className="truncate font-mono text-[15px] font-bold text-slate-900">{w.SerialNo}</div>
          <div className="truncate text-xs text-slate-500" title={w.ModelName}>{w.ModelName || "—"}</div>
        </div>
      </div>
      <div className="cp-wbar" aria-hidden="true"><i style={{ width: `${Math.max(4, st.used)}%`, background: st.bar }} /></div>
      <div className="flex items-center justify-between gap-2 text-[11.5px]">
        <span className="text-slate-500">{formatDate(w.StartDate)} → <b className="font-semibold text-slate-700">{formatDate(w.EndDate)}</b></span>
        <span className="font-semibold" style={{ color: st.bar }}>{leftText(st.left, st.key)}</span>
      </div>
      {Number(w.ExtendedMonths) > 0 && <div className="mt-1.5 text-[11px] font-semibold text-blue-700">+{w.ExtendedMonths} months extended</div>}
    </div>
  );
}

/** Customer 360 inside the drawer: profile card, KPIs, warranties per pump set, installations and service calls. */
export function CustomerProfile({ detail }: { detail: { customer: any; installations: any[]; warranties: any[]; complaints: any[] } }) {
  const { customer: c, installations, warranties, complaints } = detail;
  const [tab, setTab] = useState("w");
  const [openCall, setOpenCall] = useState<string | null>(null);
  const states = warranties.map(stateOf);
  const active = states.filter((s) => s.key === "active" || s.key === "expiring").length;
  const expiring = states.filter((s) => s.key === "expiring").length;
  const openCalls = complaints.filter((x) => OPEN_CALL(x.Status)).length;
  const since = installations.length ? installations.reduce((min, i) => (!min || dayjs(i.InstallDate).isBefore(min) ? dayjs(i.InstallDate) : min), null as dayjs.Dayjs | null) : c.InsertedOn ? dayjs(c.InsertedOn) : null;
  const address = [c.Address, c.Village, c.City, c.District, c.StateName, c.Pincode].filter(Boolean).join(", ");

  // Warranties grouped by pump set (installation); any without one go under "Other".
  const byInstall = new Map<string, any[]>();
  warranties.forEach((w) => { const k = w.InstallationId || "other"; byInstall.set(k, [...(byInstall.get(k) || []), w]); });
  const groups = Array.from(byInstall.entries()).map(([id, list]) => ({ id, inst: installations.find((i) => i.InstallationId === id), list }));

  return (
    <div className="jc-view space-y-4">
      {/* Profile */}
      <section className="cp-profile verify-pop">
        <div className="cp-profile-main">
          <span className="cp-avatar">{initials(c.CustomerName)}</span>
          <div className="min-w-0 flex-1">
            <div className="jc-label">Customer</div>
            <h2 className="truncate text-xl font-extrabold text-slate-900">{c.CustomerName}</h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <a href={`tel:${c.Mobile}`} className="font-semibold text-blue-600"><PhoneOutlined /> +91 {c.Mobile}</a>
              {c.AltMobile && <a href={`tel:${c.AltMobile}`} className="text-slate-600"><PhoneOutlined /> {c.AltMobile} <span className="text-slate-400">(alternate)</span></a>}
              {c.Email && <a href={`mailto:${c.Email}`} className="text-slate-600"><MailOutlined /> {c.Email}</a>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <span className="sc-chip"><TranslationOutlined /> {LANGUAGE[c.Language] || c.Language || "—"}</span>
            {since && <span className="sc-chip sc-chip-blue"><CalendarOutlined /> Customer since {since.format("MMM YYYY")}</span>}
          </div>
        </div>
        <div className="cp-profile-address"><EnvironmentOutlined /> <span>{address || "No address recorded"}</span></div>
      </section>

      <StatStrip items={[
        { label: "Pump sets", value: installations.length, sub: installations[0] ? `Latest ${formatDate(installations[0].InstallDate)}` : "None registered" },
        { label: "Active warranties", value: active, tone: active ? "ok" : "default", sub: `${warranties.length} component${warranties.length === 1 ? "" : "s"} in total` },
        { label: "Expiring soon", value: expiring, tone: expiring ? "warn" : "default", sub: "Within 45 days" },
        { label: "Service calls", value: complaints.length, tone: openCalls ? "danger" : "default", sub: openCalls ? `${openCalls} open` : "None open" },
      ]} />

      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: "w", label: tabLabel("Warranties", warranties.length), children: !warranties.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No warranties" /> : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.id} className="cp-group">
                <div className="cp-group-head">
                  <span className="flex items-center gap-2 font-semibold text-slate-800"><SafetyCertificateOutlined className="text-blue-600" />{g.inst ? `Pump set ${g.inst.InstallNo}` : "Other components"}</span>
                  {g.inst && <span className="text-xs text-slate-500">Installed {formatDate(g.inst.InstallDate)}{g.inst.DealerName ? ` · ${g.inst.DealerName}` : ""}{g.inst.Village || g.inst.District ? ` · ${[g.inst.Village, g.inst.District].filter(Boolean).join(", ")}` : ""}</span>}
                </div>
                <div className="cp-grid">{g.list.map((w) => <WarrantyCard key={w.WarrantyId} w={w} />)}</div>
              </div>
            ))}
          </div>
        ) },
        { key: "i", label: tabLabel("Installations", installations.length), children: !installations.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No installations" /> : (
          <div className="cp-grid">
            {installations.map((i) => {
              const parts = warranties.filter((w) => w.InstallationId === i.InstallationId);
              return (
                <div key={i.InstallationId} className="jc-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="jc-label">Installation</div>
                      <div className="font-mono text-[15px] font-bold text-slate-900">{i.InstallNo}</div>
                      <div className="text-xs text-slate-500"><CalendarOutlined /> {formatDate(i.InstallDate)}</div>
                    </div>
                    <span className="flex gap-1">{parts.map((w) => <Tooltip key={w.WarrantyId} title={`${w.Category} · ${w.SerialNo}`}><span className="jc-fault-icon !h-7 !w-7 !text-[13px]" style={{ ["--c" as any]: CAT_COLOR[String(w.Category).toUpperCase()] || "#64748b" }}><CategoryIcon category={w.Category} /></span></Tooltip>)}</span>
                  </div>
                  <div className="jc-note !mt-3"><HomeOutlined className="mt-0.5 text-slate-400" /><span>{[i.SiteAddress, i.Village, i.District, i.Pincode].filter(Boolean).join(", ") || "No site address"}</span></div>
                  <div className="jc-facts mt-3">
                    <div className="jc-fact"><span>Dealer</span><b><ShopOutlined className="mr-1 text-slate-400" />{i.DealerName || "Direct"}</b></div>
                    <div className="jc-fact"><span>Invoice</span><b>{i.InvoiceNo || "—"}</b></div>
                    <div className="jc-fact"><span>Borewell / head</span><b>{i.BorewellDepthM ? `${i.BorewellDepthM} m` : "—"} / {i.DynamicHeadM ? `${i.DynamicHeadM} m` : "—"}</b></div>
                    <div className="jc-fact"><span>Solar array</span><b>{i.PanelKwp ? `${i.PanelKwp} kWp` : "—"}</b></div>
                  </div>
                </div>
              );
            })}
          </div>
        ) },
        { key: "c", label: tabLabel("Service calls", complaints.length), children: !complaints.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No service calls" /> : (
          <div className="cp-calls">
            {complaints.map((x) => (
              <button key={x.ComplaintId} type="button" className={`cp-call ${OPEN_CALL(x.Status) ? "is-open" : ""}`} onClick={() => setOpenCall(x.ComplaintId)}>
                <span className="cp-call-icon"><CustomerServiceOutlined /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-sm font-bold text-slate-900">{x.ComplaintNo}</span>
                    <Tag color={CALL_COLOR[x.Status] || "default"} className="m-0">{x.Status}</Tag>
                    {x.CallTypeName && <span className="text-xs text-slate-500">{x.CallTypeName}</span>}
                    {x.WarrantyStatus && <span className="text-xs text-slate-400">· {x.WarrantyStatus}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-slate-600" title={x.ComplaintText}>{x.ComplaintText || "—"}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-500"><CalendarOutlined /> {formatDate(x.CallDate)}<RightOutlined className="ml-3 text-slate-300" /></span>
              </button>
            ))}
          </div>
        ) },
      ]} />

      <ServiceCallDetailDrawer complaintId={openCall} onClose={() => setOpenCall(null)} />
    </div>
  );
}
