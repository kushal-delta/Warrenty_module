"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AutoComplete, Button, Descriptions, Input, Progress, Spin, Table, Tag, Timeline } from "antd";
import { CheckCircleFilled, CloseCircleFilled, FileSearchOutlined, InfoCircleFilled, ReloadOutlined, SearchOutlined, SwapOutlined, ToolOutlined } from "@ant-design/icons";
import axios from "axios";
import { PageLoader } from "@/components/common/Loader";
import { PageHeader, TABLE_CARD } from "@/components/common/PageHeader";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";
import { canUseForm } from "@/lib/auth/forms";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

const CAT_COLOR: Record<string, string> = { PUMP: "blue", MOTOR: "cyan", CONTROLLER: "purple" };
const STATE_COLOR: Record<string, string> = { active: "green", expiring: "orange", expired: "red", replaced: "default" };
const TONE = { good: "border-emerald-200 bg-emerald-50 text-emerald-800", bad: "border-red-200 bg-red-50 text-red-700", info: "border-blue-200 bg-blue-50 text-blue-800" };

function Verdict({ tone, title, children, action }: { tone: keyof typeof TONE; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  const Icon = tone === "good" ? CheckCircleFilled : tone === "bad" ? CloseCircleFilled : InfoCircleFilled;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${TONE[tone]}`}>
      <Icon className="text-2xl mt-0.5" />
      <div className="flex-1 min-w-0"><div className="font-bold text-base">{title}</div><div className="text-sm mt-0.5">{children}</div></div>
      {action}
    </div>
  );
}

/** Serial No. Search Report: balance warranty, customer, dealer, the set's components and the history of any serial. */
export default function SerialSearchReportPage() {
  const user = useAuthStore((s) => s.user);
  const [input, setInput] = useState("");
  const [serial, setSerial] = useState("");
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<any[]>([]);
  const [list, setList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const loadList = useCallback(async () => {
    setListLoading(true);
    try { setList((await axios.post("/api/warranty/warranties/get", { limit: 500 })).data.warranties); }
    catch { setList([]); }
    finally { setListLoading(false); }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const run = useCallback(async (sn: string) => {
    const value = sn.trim().toUpperCase();
    setInput(value); setSerial(value);
    window.history.replaceState(null, "", value ? `/warranty/search?sn=${encodeURIComponent(value)}` : "/warranty/search");
    if (!value) { setReport(null); return; }
    setLoading(true);
    try { setReport((await axios.post("/api/warranty/search", { serialNo: value })).data); }
    catch (err) { setReport(null); reportFormError(err, { fallback: "Search failed" }); }
    finally { setLoading(false); }
  }, []);
  useUrlQuery("sn", (sn) => run(sn));

  const suggest = (q: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (q.trim().length < 2) { setOptions([]); return; }
      try {
        const rows = (await axios.post("/api/warranty/warranties/get", { search: q.trim(), limit: 15 })).data.warranties;
        setOptions(rows.map((w: any) => ({ value: w.SerialNo, label: <div className="flex items-center gap-2"><span className="font-mono font-semibold">{w.SerialNo}</span><Tag color={CAT_COLOR[w.Category]} className="m-0 text-[10px]">{w.Category}</Tag><span className="truncate text-xs text-slate-500">{[w.ModelName, w.CustomerName].filter(Boolean).join(" · ")}</span></div> })));
      } catch { setOptions([]); }
    }, 250);
  };

  const filteredList = list.filter((w) => { const q = listSearch.toLowerCase(); return !q || [w.SerialNo, w.CustomerName, w.ModelName, w.Village, w.District, w.DealerName].some((v) => v?.toLowerCase().includes(q)); });
  const listColumns = [
    { title: "Type", key: "type", width: 110, render: (_: any, w: any) => w.ReplacedFromSerial ? <Tag color="purple">Replacement</Tag> : <Tag>Sale</Tag> },
    { title: "Date", dataIndex: "StartDate", key: "date", width: 105, render: (v: string) => formatDate(v) },
    { title: "Customer", dataIndex: "CustomerName", key: "cust", render: (v: string) => v || "—" },
    { title: "Place", key: "place", render: (_: any, w: any) => [w.Village, w.District].filter(Boolean).join(", ") || "—" },
    { title: "Model", dataIndex: "ModelName", key: "model", render: (v: string) => v || "—" },
    { title: "Serial No", dataIndex: "SerialNo", key: "sn", render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Due days", key: "days", width: 95, align: "right" as const, render: (_: any, w: any) => w.effectiveStatus === "Active" ? <b>{w.daysLeft}</b> : "—" },
    { title: "Warranty status", key: "st", width: 140, render: (_: any, w: any) => <Tag color={w.effectiveStatus === "Active" ? (w.daysLeft <= 45 ? "orange" : "green") : w.effectiveStatus === "Replaced" ? "default" : "red"}>{w.effectiveStatus === "Active" && w.daysLeft <= 45 ? "Ending soon" : w.effectiveStatus}</Tag> },
  ];

  const w = report?.warranty;
  const ok = w && (w.State === "active" || w.State === "expiring");
  const set = report?.components || [];

  return (
    <div className="space-y-4">
      <PageHeader icon={<FileSearchOutlined />} title="Serial No. Search Report" subtitle="Balance warranty period, customer, dealer and service history of any serial number"
        actions={<Button icon={<ReloadOutlined />} onClick={() => { loadList(); if (serial) run(serial); }}>Refresh</Button>} />

      <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-wrap gap-3 items-center">
        <AutoComplete className="flex-1 min-w-[260px]" size="large" value={input} options={options} onSearch={(t) => { setInput(t.toUpperCase()); suggest(t); }} onChange={(t) => setInput(String(t || "").toUpperCase())} onSelect={(sn: string) => run(sn)}>
          <Input size="large" className="font-mono" prefix={<SearchOutlined className="text-slate-400" />} placeholder="Enter or scan a serial number" allowClear onPressEnter={() => run(input)} onClear={() => run("")} />
        </AutoComplete>
        <Button type="primary" size="large" icon={<SearchOutlined />} onClick={() => run(input)} className="bg-blue-600">Search</Button>
      </section>

      {loading && <PageLoader label="Searching…" minHeight={220} />}

      {!loading && serial && report?.status === "unknown" && (
        <Verdict tone="bad" title="Not authenticated">Serial number <b className="font-mono">{serial}</b> is not in the sticker register. The product may be counterfeit or the number was mistyped.</Verdict>
      )}

      {!loading && report?.status === "unregistered" && (
        <Verdict tone="info" title="Authentic — not yet registered"
          action={canUseForm(user, "warranty.register") ? <Link href="/warranty/register"><Button type="primary" className="bg-blue-600">Register warranty</Button></Link> : null}>
          <b className="font-mono">{serial}</b> · {report.category} · {report.model?.ModelName || "—"}{report.model?.Hp ? ` · ${Number(report.model.Hp)} HP` : ""}. Warranty is activated when the customer or dealer registers it{report.model?.WarrantyMonths ? ` (${report.model.WarrantyMonths} months)` : ""}.
        </Verdict>
      )}

      {!loading && report?.status === "registered" && (
        <>
          {!report.visible ? (
            <Verdict tone={ok ? "good" : w.State === "replaced" ? "info" : "bad"} title={`Warranty ${w.Label.toLowerCase()}`}>
              <b className="font-mono">{serial}</b> · {report.category} · {report.model?.ModelName} is registered and authentic{ok ? ` — ${w.DaysLeft} days of warranty left (valid till ${formatDate(w.EndDate)})` : ""}.
              <div className="text-xs mt-1 opacity-80">Customer, site and service history are shown only to the dealer / office that owns this installation.</div>
            </Verdict>
          ) : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
                <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
                  <Verdict tone={ok ? "good" : w.State === "replaced" ? "info" : "bad"} title={`Warranty ${w.Label.toLowerCase()}`}>This product is registered and authenticated.</Verdict>
                  <div className="flex items-center gap-5">
                    <div><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Balance warranty</div><div className={`text-3xl font-extrabold ${ok ? "text-slate-900" : "text-red-600"}`}>{ok ? w.DaysLeft : 0}<small className="text-sm font-semibold text-slate-400"> days</small></div></div>
                    <div className="flex-1">
                      <Progress percent={w.ElapsedPct} showInfo={false} strokeColor={ok ? (w.State === "expiring" ? "#f59e0b" : "#16a34a") : "#dc2626"} />
                      <div className="flex justify-between text-[11px] text-slate-400"><span>{formatDate(w.StartDate)}</span><span>{w.ElapsedPct}% elapsed</span><span>{formatDate(w.EndDate)}</span></div>
                    </div>
                  </div>
                  <Descriptions size="small" column={1} colon={false} labelStyle={{ color: "#64748b", width: 140 }} items={[
                    { key: "sn", label: "Serial number", children: <span className="font-mono font-semibold">{serial}</span> },
                    { key: "c", label: "Component", children: <Tag color={CAT_COLOR[report.category]}>{report.category}</Tag> },
                    { key: "m", label: "Model", children: report.model?.ModelName || "—" },
                    { key: "r", label: "Rating", children: report.model?.Hp ? `${Number(report.model.Hp)} HP${report.model.Kw ? ` / ${Number(report.model.Kw)} kW` : ""}` : "—" },
                    { key: "w", label: "Warranty no", children: w.WarrantyNo },
                    { key: "p", label: "Period", children: `${w.WarrantyMonths} months${w.ExtendedMonths ? ` + ${w.ExtendedMonths} extended` : ""}` },
                    { key: "ro", label: "Registered on", children: `${formatDate(report.registeredOn)} by ${report.registeredBy || "—"}` },
                    ...(report.replacedFromSerial ? [{ key: "rf", label: "Replaced serial", children: <a className="font-mono text-blue-600" onClick={() => run(report.replacedFromSerial)}>{report.replacedFromSerial}</a> }] : []),
                  ]} />
                </section>

                <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
                  <h3 className="text-sm font-bold text-slate-900 mb-3">Customer &amp; site</h3>
                  <Descriptions size="small" column={1} colon={false} labelStyle={{ color: "#64748b", width: 120 }} items={[
                    { key: "cu", label: "Customer", children: report.owner?.CustomerName || "—" },
                    { key: "mo", label: "Mobile", children: report.owner?.Mobile || "—" },
                    { key: "si", label: "Site", children: [report.owner?.Village, report.owner?.District, report.owner?.StateName, report.owner?.Pincode].filter(Boolean).join(", ") || "—" },
                    { key: "in", label: "Installation", children: `${report.owner?.InstallNo || "—"} · ${formatDate(report.owner?.InstallDate)}` },
                    { key: "de", label: "Dealer", children: report.owner?.DealerName || "Direct" },
                    ...(report.owner?.BorewellDepthM ? [{ key: "bw", label: "Borewell / head", children: `${report.owner.BorewellDepthM} m / ${report.owner.DynamicHeadM || "—"} m` }] : []),
                  ]} />
                  <div className="flex flex-wrap gap-2 mt-4">
                    {canUseForm(user, "service.complaints") && <Link href={`/service/complaints?q=${encodeURIComponent(report.owner?.CustomerName || serial)}`}><Button type="primary" icon={<ToolOutlined />} className="bg-blue-600">Service calls</Button></Link>}
                    {ok && canUseForm(user, "warranty.replace") && <Link href={`/warranty/replace?old=${encodeURIComponent(serial)}`}><Button icon={<SwapOutlined />}>Replace in warranty</Button></Link>}
                  </div>
                </section>
              </div>

              <section className={`${TABLE_CARD} p-5`}>
                <h3 className="text-sm font-bold text-slate-900 mb-0.5">Components of this installation <span className="text-xs font-normal text-slate-400">each has its own serial and warranty</span></h3>
                <Table size="small" rowKey="SerialNo" dataSource={set} pagination={false} scroll={{ x: 640 }} className="mt-2"
                  onRow={(r) => ({ onClick: () => run(r.SerialNo), className: `cursor-pointer ${r.SerialNo === serial ? "bg-teal-50" : ""}` })}
                  columns={[
                    { title: "Component", dataIndex: "Category", render: (v: string) => <Tag color={CAT_COLOR[v]}>{v}</Tag> },
                    { title: "Serial", dataIndex: "SerialNo", render: (v: string) => <b className="font-mono">{v}</b> },
                    { title: "Model", dataIndex: "ModelName", render: (v: string) => v || "—" },
                    { title: "Valid till", dataIndex: "EndDate", render: (v: string) => formatDate(v) },
                    { title: "Balance", dataIndex: "DaysLeft", align: "right" as const, render: (v: number) => v || 0 },
                    { title: "Status", dataIndex: "Label", render: (v: string, r: any) => <Tag color={STATE_COLOR[r.State]}>{v}</Tag> },
                  ]} />
              </section>

              <section className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
                <h3 className="text-sm font-bold text-slate-900 mb-4">History</h3>
                <Timeline items={(report.history || []).map((e: any) => ({
                  color: e.tone === "green" ? "green" : "orange",
                  children: <div><div className="font-semibold text-slate-800 text-sm">{e.complaintId && canUseForm(user, "service.complaints") ? <Link href={`/service/complaints?q=${encodeURIComponent(e.title.replace("Service call ", ""))}`}>{e.title}</Link> : e.title}</div><div className="text-xs text-slate-500">{formatDate(e.date)} · {e.detail}</div></div>,
                }))} />
              </section>
            </>
          )}
        </>
      )}

      {!serial && (
        <>
          <div className="filter-toolbar">
            <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search any serial, customer, model or place…" value={listSearch} onChange={(e) => setListSearch(e.target.value)} allowClear className="w-96" />
          </div>
          <div className={TABLE_CARD}>
            <Table dataSource={filteredList} columns={listColumns} rowKey="WarrantyId" size="middle" loading={listLoading} scroll={{ x: 900 }} pagination={{ defaultPageSize: 15, showSizeChanger: true, showTotal: (t) => `${t} serials` }}
              onRow={(w) => ({ onClick: () => run(w.SerialNo), className: "cursor-pointer" })} />
          </div>
        </>
      )}
    </div>
  );
}
