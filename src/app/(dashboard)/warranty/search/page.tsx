"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AutoComplete, Button, Input, Table, Tag } from "antd";
import { CheckCircleFilled, CloseCircleFilled, FileSearchOutlined, InfoCircleFilled, LockOutlined, ReloadOutlined, SearchOutlined, SwapOutlined, ToolOutlined } from "@ant-design/icons";
import axios from "axios";
import { PageLoader } from "@/components/common/Loader";
import { PageHeader, TABLE_CARD } from "@/components/common/PageHeader";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";
import { canUseForm } from "@/lib/auth/forms";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { DateRangeFilter, ExportExcelButton, inDateRange, type DateRange } from "@/components/common/ReportTools";
import { exportTable, rangeLabel } from "@/lib/utils/excelExport";
import { LifecycleTimeline, OwnerCard, PassportHero, PumpSet } from "@/components/warranty/SerialPassport";

const CAT_COLOR: Record<string, string> = { PUMP: "blue", MOTOR: "cyan", CONTROLLER: "purple" };
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
  const [range, setRange] = useState<DateRange>(null); // warranty start date (sale / replacement)
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

  const filteredList = list.filter((w) => { const q = listSearch.toLowerCase(); return (!q || [w.SerialNo, w.CustomerName, w.ModelName, w.Village, w.District, w.DealerName].some((v) => v?.toLowerCase().includes(q))) && inDateRange(w.StartDate, range); });
  const exportExcel = () => exportTable("Serial No. Search Report", [
    { header: "Type", value: (w: any) => (w.ReplacedFromSerial ? "Replacement" : "Sale") },
    { header: "Date", value: (w: any) => w.StartDate, type: "date" },
    { header: "Customer", value: (w: any) => w.CustomerName },
    { header: "Place", value: (w: any) => [w.Village, w.District].filter(Boolean).join(", ") },
    { header: "Model", value: (w: any) => w.ModelName },
    { header: "Serial No", value: (w: any) => w.SerialNo },
    { header: "Due days", value: (w: any) => (w.effectiveStatus === "Active" ? w.daysLeft : null), type: "number" },
    { header: "Warranty status", value: (w: any) => (w.effectiveStatus === "Active" && w.daysLeft <= 45 ? "Ending soon" : w.effectiveStatus) },
  ], filteredList, { Date: rangeLabel(range), Search: listSearch || null }, "Serials");
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

  return (
    <div className="space-y-4">
      <PageHeader icon={<FileSearchOutlined />} title="Serial No. Search Report" subtitle="Balance warranty period, customer, dealer and service history of any serial number"
        actions={<>
          <ExportExcelButton onExport={exportExcel} disabled={!!serial || !filteredList.length} />
          <Button icon={<ReloadOutlined />} onClick={() => { loadList(); if (serial) run(serial); }}>Refresh</Button>
        </>} />

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
            <div className="max-w-3xl">
              <PassportHero serial={serial} category={report.category} model={report.model} warranty={w} onOpenSerial={run}
                footer={<span className="inline-flex items-start gap-2"><LockOutlined className="mt-0.5 text-slate-400" />Registered and authentic. Customer, site and service history are shown only to the dealer / office that owns this installation.</span>} />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
              <div className="space-y-4 min-w-0">
                <PassportHero serial={serial} category={report.category} model={report.model} warranty={w} onOpenSerial={run}
                  registeredOn={report.registeredOn} registeredBy={report.registeredBy} replacedFromSerial={report.replacedFromSerial} />
                <LifecycleTimeline report={report} serial={serial} canOpenCalls={canUseForm(user, "service.complaints")} onOpenSerial={run} />
              </div>
              <div className="space-y-4 min-w-0">
                <PumpSet components={report.components} serial={serial} onOpenSerial={run} />
                <OwnerCard owner={report.owner}>
                  {canUseForm(user, "service.complaints") && <Link href={`/service/complaints?q=${encodeURIComponent(report.owner?.CustomerName || serial)}`}><Button type="primary" icon={<ToolOutlined />} className="bg-blue-600">Service calls</Button></Link>}
                  {ok && canUseForm(user, "warranty.replace") && <Link href={`/warranty/replace?old=${encodeURIComponent(serial)}`}><Button icon={<SwapOutlined />}>Replace in warranty</Button></Link>}
                </OwnerCard>
              </div>
            </div>
          )}
        </>
      )}

      {!serial && (
        <>
          <div className="filter-toolbar">
            <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search any serial, customer, model or place…" value={listSearch} onChange={(e) => setListSearch(e.target.value)} allowClear className="w-96" />
            <DateRangeFilter value={range} onChange={setRange} placeholder={["Start date from", "to"]} />
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
