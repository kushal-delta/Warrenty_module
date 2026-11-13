"use client";

import React, { useEffect, useState } from "react";
import { Button, Input, Table, Tabs, Tag, Typography } from "antd";
import { HistoryOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useServiceOpsStore } from "@/lib/store/useServiceOpsStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { PageHeader, TABLE_CARD } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { DateRangeFilter, ExportExcelButton, inDateRange, type DateRange } from "@/components/common/ReportTools";
import { exportTable, rangeLabel } from "@/lib/utils/excelExport";

const ACTION_COLOR: Record<string, string> = { CREATE: "green", UPDATE: "blue", DELETE: "red", APPROVED: "green", REJECTED: "red", SUBMIT: "gold", ASSIGN: "purple", CLOSE: "cyan" };

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

  const shownLogs = logs.filter((r) => inDateRange(r.LogOn, range));
  const shownMessages = messages.filter((r) => inDateRange(r.SentOn, range));

  const exportExcel = () => tab === "activity"
    ? exportTable("Activity Log", [
      { header: "When", value: (r: any) => r.LogOn, type: "datetime" },
      { header: "User", value: (r: any) => r.UserName || "system" },
      { header: "Action", value: (r: any) => r.Action },
      { header: "Table", value: (r: any) => r.TableName },
      { header: "Details", value: (r: any) => r.Details },
    ], shownLogs, { Period: rangeLabel(range), Search: search || null })
    : exportTable("WhatsApp - SMS Log", [
      { header: "Sent", value: (r: any) => r.SentOn, type: "datetime" },
      { header: "Channel", value: (r: any) => r.Channel },
      { header: "To", value: (r: any) => r.ToMobile },
      { header: "Reference type", value: (r: any) => r.RefType },
      { header: "Reference no", value: (r: any) => r.RefNo },
      { header: "Message", value: (r: any) => r.Message },
      { header: "Status", value: (r: any) => r.Status },
    ], shownMessages, { Period: rangeLabel(range), Search: search || null }, "Messages");

  return (
    <div className="space-y-4">
      <PageHeader icon={<HistoryOutlined />} title="Activity & Message Log" subtitle="Who changed what and when · WhatsApp / SMS messages queued for customers"
        actions={<>
          <ExportExcelButton onExport={exportExcel} disabled={!(tab === "activity" ? shownLogs : shownMessages).length} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        </>} />
      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder={tab === "activity" ? "Search user, action, record, details..." : "Search mobile, reference, message..."} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={load} allowClear className="w-80" />
        <Button onClick={load}>Search</Button>
        <DateRangeFilter value={range} onChange={setRange} placeholder={[tab === "activity" ? "Logged from" : "Sent from", "to"]} />
      </div>
      <div className={`${TABLE_CARD} px-4 pb-2`}>
        <Tabs activeKey={tab} onChange={setTab} items={[
          ...(isHO ? [{ key: "activity", label: "Activity Log", children: <Table size="small" rowKey="AuditLogId" loading={loading} dataSource={shownLogs} scroll={{ x: 900 }} pagination={{ defaultPageSize: 25, showSizeChanger: true }} columns={[
            { title: "When", dataIndex: "LogOn", width: 160, render: (v: string) => formatDate(v, true) },
            { title: "User", dataIndex: "UserName", width: 120, render: (v: string) => v || "system" },
            { title: "Action", dataIndex: "Action", width: 110, render: (a: string) => <Tag color={ACTION_COLOR[a] || "default"}>{a}</Tag> },
            { title: "Table", dataIndex: "TableName", width: 150 },
            { title: "Details", dataIndex: "Details", render: (v: string) => <Typography.Text className="text-xs" ellipsis={{ tooltip: v }}>{v || "-"}</Typography.Text> },
          ]} /> }] : []),
          { key: "messages", label: "WhatsApp / SMS Log", children: <Table size="small" rowKey="NotificationLogId" loading={loading} dataSource={shownMessages} scroll={{ x: 900 }} pagination={{ defaultPageSize: 25, showSizeChanger: true }} columns={[
            { title: "Sent", dataIndex: "SentOn", width: 160, render: (v: string) => formatDate(v, true) },
            { title: "Channel", dataIndex: "Channel", width: 100, render: (c: string) => <Tag color={c === "WhatsApp" ? "green" : "blue"}>{c}</Tag> },
            { title: "To", dataIndex: "ToMobile", width: 120, render: (v: string) => <span className="font-mono">{v}</span> },
            { title: "Reference", key: "ref", width: 170, render: (_: any, r: any) => <span className="text-xs">{r.RefType} · <span className="font-mono">{r.RefNo}</span></span> },
            { title: "Message", dataIndex: "Message", render: (v: string) => <span className="text-xs whitespace-normal">{v}</span> },
            { title: "Status", dataIndex: "Status", width: 90, render: (s: string) => <Tag>{s}</Tag> },
          ]} /> },
        ]} />
      </div>
    </div>
  );
}
