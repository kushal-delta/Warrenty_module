"use client";

import React, { useEffect, useState } from "react";
import { Button, Input, Table, Tabs, Tag, Typography } from "antd";
import { HistoryOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useServiceOpsStore } from "@/lib/store/useServiceOpsStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { PageHeader, TABLE_CARD } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

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

  return (
    <div className="space-y-4">
      <PageHeader icon={<HistoryOutlined />} title="Activity & Message Log" subtitle="Who changed what and when · WhatsApp / SMS messages queued for customers"
        actions={<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>} />
      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder={tab === "activity" ? "Search user, action, record, details..." : "Search mobile, reference, message..."} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={load} allowClear className="w-80" />
        <Button onClick={load}>Search</Button>
      </div>
      <div className={`${TABLE_CARD} px-4 pb-2`}>
        <Tabs activeKey={tab} onChange={setTab} items={[
          ...(isHO ? [{ key: "activity", label: "Activity Log", children: <Table size="small" rowKey="AuditLogId" loading={loading} dataSource={logs} scroll={{ x: 900 }} pagination={{ defaultPageSize: 25, showSizeChanger: true }} columns={[
            { title: "When", dataIndex: "LogOn", width: 160, render: (v: string) => formatDate(v, true) },
            { title: "User", dataIndex: "UserName", width: 120, render: (v: string) => v || "system" },
            { title: "Action", dataIndex: "Action", width: 110, render: (a: string) => <Tag color={ACTION_COLOR[a] || "default"}>{a}</Tag> },
            { title: "Table", dataIndex: "TableName", width: 150 },
            { title: "Details", dataIndex: "Details", render: (v: string) => <Typography.Text className="text-xs" ellipsis={{ tooltip: v }}>{v || "-"}</Typography.Text> },
          ]} /> }] : []),
          { key: "messages", label: "WhatsApp / SMS Log", children: <Table size="small" rowKey="NotificationLogId" loading={loading} dataSource={messages} scroll={{ x: 900 }} pagination={{ defaultPageSize: 25, showSizeChanger: true }} columns={[
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
