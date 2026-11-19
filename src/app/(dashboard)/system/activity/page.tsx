"use client";

import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Button, Input, Select, Table, Tabs, Tag, Tooltip } from "antd";
import {
  CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined, EditOutlined, HistoryOutlined, LoginOutlined, LogoutOutlined, MessageOutlined, PlusCircleOutlined,
  ReloadOutlined, SearchOutlined, SendOutlined, UploadOutlined, UserSwitchOutlined, WhatsAppOutlined,
} from "@ant-design/icons";
import { useServiceOpsStore } from "@/lib/store/useServiceOpsStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { PageHeader, StatStrip, TABLE_CARD } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { DateRangeFilter, ExportExcelButton, inDateRange, type DateRange } from "@/components/common/ReportTools";
import { exportTable, rangeLabel } from "@/lib/utils/excelExport";

/** Colour + icon per audit action (anything else is shown as a neutral tag). */
const ACTIONS: Record<string, { color: string; icon: React.ReactNode }> = {
  CREATE: { color: "green", icon: <PlusCircleOutlined /> },
  UPDATE: { color: "blue", icon: <EditOutlined /> },
  DELETE: { color: "red", icon: <DeleteOutlined /> },
  APPROVED: { color: "green", icon: <CheckCircleOutlined /> },
  REJECTED: { color: "red", icon: <CloseCircleOutlined /> },
  SUBMIT: { color: "gold", icon: <SendOutlined /> },
  ASSIGN: { color: "purple", icon: <UserSwitchOutlined /> },
  CLOSE: { color: "cyan", icon: <CheckCircleOutlined /> },
  LOGIN: { color: "geekblue", icon: <LoginOutlined /> },
  SSO_LOGIN: { color: "geekblue", icon: <LoginOutlined /> },
  LOGOUT: { color: "default", icon: <LogoutOutlined /> },
  BULK_UPLOAD: { color: "orange", icon: <UploadOutlined /> },
};
const AVATAR = ["#2563eb", "#0d9488", "#7c3aed", "#c2410c", "#be185d", "#0369a1"];

/** "MaterialRequests" → "Material Requests", "SSO_LOGIN" → "SSO LOGIN". */
const words = (s?: string | null) => String(s || "").replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
const colorOf = (name: string) => AVATAR[Array.from(name).reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR.length];

/** Audit details are stored as JSON — returned as label / value pairs (blank values dropped); plain text comes back as-is. */
function parseDetails(raw?: string | null): { pairs: [string, string][]; text: string } {
  const text = String(raw || "").trim();
  if (!text) return { pairs: [], text: "" };
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const pairs = Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => [words(k), typeof v === "object" ? JSON.stringify(v) : String(v)] as [string, string]);
      return { pairs, text };
    }
  } catch { /* not JSON */ }
  return { pairs: [], text };
}

function When({ value }: { value: string }) {
  const d = dayjs(value);
  if (!value || !d.isValid()) return <span className="text-slate-300">—</span>;
  return (
    <Tooltip title={d.format("dddd, DD MMM YYYY · hh:mm:ss A")}>
      <div className="whitespace-nowrap leading-tight">
        <div className="text-[13px] font-semibold text-slate-800 tabular-nums">{formatDate(value)}</div>
        <div className="text-[11px] text-slate-400 tabular-nums">{d.format("hh:mm A")}</div>
      </div>
    </Tooltip>
  );
}

function DetailChips({ raw, max = 4 }: { raw?: string | null; max?: number }) {
  const { pairs, text } = parseDetails(raw);
  if (!text) return <span className="text-slate-300">—</span>;
  if (!pairs.length) return <Tooltip title={text}><div className="truncate text-xs text-slate-600">{text}</div></Tooltip>;
  const more = pairs.length - max;
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
      {pairs.slice(0, max).map(([k, v]) => (
        <Tooltip key={k} title={`${k}: ${v}`}>
          <span className="inline-flex max-w-[220px] shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11.5px] whitespace-nowrap">
            <span className="text-slate-400">{k}</span>
            <span className="truncate font-semibold text-slate-700">{v}</span>
          </span>
        </Tooltip>
      ))}
      {more > 0 && <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">+{more}</span>}
    </div>
  );
}

/** Activity (audit) log and the WhatsApp / SMS message log. */
export default function ActivityPage() {
  const { fetchActivity, fetchNotifications } = useServiceOpsStore();
  const user = useAuthStore((s) => s.user);
  const isHO = user?.Role === "SUPER" || user?.Role === "HO" || user?.IsAdmin;
  const [tab, setTab] = useState(isHO ? "activity" : "messages");
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRange>(null); // log / sent timestamp
  const [action, setAction] = useState<string>();
  const [table, setTable] = useState<string>();

  const load = async () => {
    setLoading(true);
    try {
      if (tab === "activity") setLogs(await fetchActivity({ search: search || undefined }));
      else setMessages(await fetchNotifications({ search: search || undefined }));
    } catch (err) {
      reportFormError(err, { fallback: "Could not load log" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const inRange = logs.filter((r) => inDateRange(r.LogOn, range));
  const shownLogs = inRange.filter((r) => (!action || r.Action === action) && (!table || r.TableName === table));
  const shownMessages = messages.filter((r) => inDateRange(r.SentOn, range));
  const actionOptions = useMemo(() => Array.from(new Set(logs.map((r) => r.Action).filter(Boolean))).sort().map((a) => ({ value: a, label: words(a) })), [logs]);
  const tableOptions = useMemo(() => Array.from(new Set(logs.map((r) => r.TableName).filter(Boolean))).sort().map((t) => ({ value: t, label: words(t) })), [logs]);
  const countOf = (a: string) => inRange.filter((r) => r.Action === a).length;
  const today = dayjs().startOf("day");

  const exportExcel = () => tab === "activity"
    ? exportTable("Activity Log", [
      { header: "When", value: (r: any) => r.LogOn, type: "datetime" },
      { header: "User", value: (r: any) => r.UserName || "system" },
      { header: "Action", value: (r: any) => r.Action },
      { header: "Table", value: (r: any) => r.TableName },
      { header: "Details", value: (r: any) => r.Details },
    ], shownLogs, { Period: rangeLabel(range), Action: action ? words(action) : null, Record: table ? words(table) : null, Search: search || null })
    : exportTable("WhatsApp - SMS Log", [
      { header: "Sent", value: (r: any) => r.SentOn, type: "datetime" },
      { header: "Channel", value: (r: any) => r.Channel },
      { header: "To", value: (r: any) => r.ToMobile },
      { header: "Reference type", value: (r: any) => r.RefType },
      { header: "Reference no", value: (r: any) => r.RefNo },
      { header: "Message", value: (r: any) => r.Message },
      { header: "Status", value: (r: any) => r.Status },
    ], shownMessages, { Period: rangeLabel(range), Search: search || null }, "Messages");

  const activityTable = (
    <Table size="middle" rowKey="AuditLogId" loading={loading} dataSource={shownLogs} tableLayout="fixed" scroll={{ x: 1080 }}
      pagination={{ defaultPageSize: 25, showSizeChanger: true, showTotal: (t) => `${t} entries` }}
      expandable={{
        rowExpandable: (r: any) => Boolean(String(r.Details || "").trim()),
        expandedRowRender: (r: any) => {
          const { pairs, text } = parseDetails(r.Details);
          return pairs.length ? (
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-2.5 py-1 sm:grid-cols-3 lg:grid-cols-4">
              {pairs.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="m-0 break-words text-[13px] font-semibold text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
          ) : <div className="whitespace-pre-wrap break-words py-1 text-xs text-slate-700">{text}</div>;
        },
      }}
      columns={[
        { title: "When", dataIndex: "LogOn", width: 130, render: (v: string) => <When value={v} /> },
        { title: "User", dataIndex: "UserName", width: 190, render: (v: string) => {
          const name = (v || "system").trim();
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: v ? colorOf(name) : "#94a3b8" }}>{initials(name)}</span>
              <Tooltip title={name}><span className="truncate text-[13px] font-semibold text-slate-800">{name}</span></Tooltip>
            </div>
          );
        } },
        { title: "Action", dataIndex: "Action", width: 150, render: (a: string) => {
          const cfg = ACTIONS[a];
          return <Tag color={cfg?.color || "default"} icon={cfg?.icon} className="m-0 whitespace-nowrap font-semibold">{words(a)}</Tag>;
        } },
        { title: "Record", dataIndex: "TableName", width: 190, render: (v: string) => v ? <Tooltip title={v}><span className="block truncate whitespace-nowrap text-[13px] text-slate-700">{words(v)}</span></Tooltip> : <span className="text-slate-300">—</span> },
        { title: "Details", dataIndex: "Details", render: (v: string) => <DetailChips raw={v} /> },
      ]} />
  );

  const messageTable = (
    <Table size="middle" rowKey="NotificationLogId" loading={loading} dataSource={shownMessages} tableLayout="fixed" scroll={{ x: 1080 }}
      pagination={{ defaultPageSize: 25, showSizeChanger: true, showTotal: (t) => `${t} messages` }}
      expandable={{ rowExpandable: (r: any) => Boolean(r.Message), expandedRowRender: (r: any) => <div className="whitespace-pre-wrap break-words py-1 text-[13px] text-slate-700">{r.Message}</div> }}
      columns={[
        { title: "Sent", dataIndex: "SentOn", width: 130, render: (v: string) => <When value={v} /> },
        { title: "Channel", dataIndex: "Channel", width: 130, render: (c: string) => <Tag color={c === "WhatsApp" ? "green" : "blue"} icon={c === "WhatsApp" ? <WhatsAppOutlined /> : <MessageOutlined />} className="m-0 whitespace-nowrap font-semibold">{c}</Tag> },
        { title: "To", dataIndex: "ToMobile", width: 140, render: (v: string) => <span className="whitespace-nowrap font-mono text-[13px] font-semibold text-slate-800">{v}</span> },
        { title: "Reference", key: "ref", width: 220, render: (_: any, r: any) => (
          <div className="min-w-0 whitespace-nowrap leading-tight">
            <div className="truncate font-mono text-[13px] font-semibold text-blue-700">{r.RefNo || "—"}</div>
            <div className="truncate text-[11px] text-slate-400">{words(r.RefType)}</div>
          </div>
        ) },
        { title: "Message", dataIndex: "Message", render: (v: string) => <Tooltip title={v} styles={{ root: { maxWidth: 480 } }}><div className="truncate text-[13px] text-slate-600">{v || "—"}</div></Tooltip> },
        { title: "Status", dataIndex: "Status", width: 120, render: (s: string) => <Tag color={/sent|deliver/i.test(s) ? "green" : /fail|error/i.test(s) ? "red" : /queue|pending/i.test(s) ? "gold" : "default"} className="m-0 whitespace-nowrap">{s}</Tag> },
      ]} />
  );

  return (
    <div className="space-y-4">
      <PageHeader icon={<HistoryOutlined />} title="Activity & Message Log" subtitle="Who changed what and when · WhatsApp / SMS messages queued for customers"
        actions={<>
          <ExportExcelButton onExport={exportExcel} disabled={!(tab === "activity" ? shownLogs : shownMessages).length} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        </>} />

      {tab === "activity" ? <StatStrip items={[
        { label: "Entries", value: inRange.length },
        { label: "Today", value: inRange.filter((r) => dayjs(r.LogOn).isAfter(today)).length, tone: "ok" },
        { label: "Created", value: countOf("CREATE") },
        { label: "Updated", value: countOf("UPDATE") },
        { label: "Deleted", value: countOf("DELETE"), tone: countOf("DELETE") ? "danger" : undefined },
        { label: "Sign-ins", value: countOf("LOGIN") + countOf("SSO_LOGIN") },
      ]} /> : <StatStrip items={[
        { label: "Messages", value: shownMessages.length },
        { label: "Today", value: shownMessages.filter((r) => dayjs(r.SentOn).isAfter(today)).length, tone: "ok" },
        { label: "WhatsApp", value: shownMessages.filter((r) => r.Channel === "WhatsApp").length },
        { label: "SMS", value: shownMessages.filter((r) => r.Channel !== "WhatsApp").length },
      ]} />}

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder={tab === "activity" ? "Search user, action, record, details..." : "Search mobile, reference, message..."} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={load} allowClear className="w-80" />
        <Button onClick={load}>Search</Button>
        <DateRangeFilter value={range} onChange={setRange} placeholder={[tab === "activity" ? "Logged from" : "Sent from", "to"]} />
        {tab === "activity" && <>
          <Select allowClear showSearch optionFilterProp="label" placeholder="Action: All" value={action} onChange={setAction} options={actionOptions} className="w-44" />
          <Select allowClear showSearch optionFilterProp="label" placeholder="Record: All" value={table} onChange={setTable} options={tableOptions} className="w-52" />
        </>}
      </div>

      <div className={`${TABLE_CARD} px-4 pb-2`}>
        <Tabs activeKey={tab} onChange={setTab} items={[
          ...(isHO ? [{ key: "activity", label: <span className="inline-flex items-center gap-2"><HistoryOutlined />Activity Log</span>, children: activityTable }] : []),
          { key: "messages", label: <span className="inline-flex items-center gap-2"><MessageOutlined />WhatsApp / SMS Log</span>, children: messageTable },
        ]} />
      </div>
    </div>
  );
}
