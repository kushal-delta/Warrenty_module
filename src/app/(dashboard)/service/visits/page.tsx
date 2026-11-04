"use client";

import React, { useEffect, useState } from "react";
import { Button, Drawer, Form, Input, InputNumber, Select, Space, Table, Tag, Tooltip, message } from "antd";
import { CarOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useServiceOpsStore, VisitReport } from "@/lib/store/useServiceOpsStore";
import { useServiceStore } from "@/lib/store/useServiceStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { FormSection } from "@/components/common/FormSection";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { VISIT_OUTCOMES } from "@/lib/config/service";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

const OUTCOME_COLOR: Record<string, string> = { "Resolved at site": "green", "Customer not available": "orange", "Replacement required": "magenta", "Job card required": "blue", "Spares required": "purple" };

export default function VisitReportsPage() {
  const [form] = Form.useForm();
  const { visits, fetchVisits, saveVisit, deleteVisit, isLoading } = useServiceOpsStore();
  const { complaints, fetchComplaints } = useServiceStore();
  const { engineers } = useMasterStore();
  const user = useAuthStore((s) => s.user);
  const isEngineer = user?.Role === "ENGINEER";

  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editing, setEditing] = useState<VisitReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<VisitReport | null>(null);

  useEffect(() => {
    fetchVisits().catch((err) => reportFormError(err, { fallback: "Could not load visit reports" }));
    fetchComplaints({ limit: 1000 }).catch(() => undefined);
  }, [fetchVisits, fetchComplaints]);

  const openForm = (row?: VisitReport) => {
    setEditing(row || null);
    form.resetFields();
    form.setFieldsValue(row
      ? { ...row, VisitDate: dayjs(row.VisitDate), TravelExpense: row.TravelExpense != null ? Number(row.TravelExpense) : undefined, OtherExpense: row.OtherExpense != null ? Number(row.OtherExpense) : undefined }
      : { VisitDate: dayjs(), StartTime: "10:00", EndTime: "12:00", Status: "Job card required", EngineerUserId: isEngineer ? user?.UserId : undefined });
    setDrawerOpen(true);
  };

  const onCallChange = (complaintId: string) => {
    const call = complaints.find((c) => c.ComplaintId === complaintId);
    if (call?.EngineerUserId && !isEngineer) form.setFieldValue("EngineerUserId", call.EngineerUserId);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await saveVisit({ ...values, VisitDate: values.VisitDate.toISOString(), VisitReportId: editing?.VisitReportId });
      message.success(editing ? "Visit report updated" : "Visit report saved — call marked as visited");
      setDrawerOpen(false);
      fetchComplaints({ limit: 1000 }).catch(() => undefined);
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save visit report" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = visits.filter((v) => {
    const q = search.toLowerCase();
    return (!q || [v.VisitNo, v.ComplaintNo, v.CustomerName, v.Observations, v.ActionTaken].some((x) => x?.toLowerCase().includes(q))) && (!outcomeFilter || v.Status === outcomeFilter);
  });
  const openCalls = complaints.filter((c) => !["Closed", "Cancelled", "Resolved"].includes(c.Status) || c.ComplaintId === editing?.ComplaintId)
    .filter((c) => !isEngineer || c.EngineerUserId === user?.UserId);

  const columns = [
    { title: "Visit No", dataIndex: "VisitNo", key: "no", width: 140, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Date", dataIndex: "VisitDate", key: "date", width: 105, render: (v: string) => formatDate(v) },
    { title: "Call / Customer", key: "call", render: (_: any, v: VisitReport) => <div><div className="font-mono text-xs text-slate-500">{v.ComplaintNo}</div><div className="font-semibold text-slate-800">{v.CustomerName}</div><div className="text-[11px] text-slate-400">{[v.Village, v.District].filter(Boolean).join(", ")}</div></div> },
    { title: "Engineer", dataIndex: "EngineerName", key: "eng", width: 140 },
    { title: "Findings / Action", key: "find", render: (_: any, v: VisitReport) => <div className="text-xs whitespace-normal"><div className="text-slate-700">{v.Observations || "-"}</div>{v.ActionTaken && <div className="text-slate-500 mt-0.5">Action: {v.ActionTaken}</div>}</div> },
    { title: "Time", key: "time", width: 120, render: (_: any, v: VisitReport) => v.StartTime || v.EndTime ? `${v.StartTime || "—"} – ${v.EndTime || "—"}` : "—" },
    { title: "Km", dataIndex: "TravelKm", key: "km", width: 70, align: "right" as const, render: (n: number) => n ?? "—" },
    { title: "Expenses ₹", key: "exp", width: 105, align: "right" as const, render: (_: any, v: VisitReport) => v.TravelExpense == null && v.OtherExpense == null ? "—" : (Number(v.TravelExpense || 0) + Number(v.OtherExpense || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 }) },
    { title: "Outcome", dataIndex: "Status", key: "status", width: 160, render: (s: string) => <Tag color={OUTCOME_COLOR[s] || "default"}>{s}</Tag> },
    { title: "Rating", dataIndex: "CustomerRating", key: "rating", width: 100, align: "center" as const, render: (n: number) => n ? <span className="text-amber-500 tracking-tight">{"★".repeat(n)}</span> : "—" },
    { title: "Actions", key: "actions", width: 90, render: (_: any, v: VisitReport) => (
      <Space size="small">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(v)} /></Tooltip>
        {!isEngineer && <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(v)} /></Tooltip>}
      </Space>
    ) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<CarOutlined />} title="Visit Reports" subtitle="Engineer site visits against service calls — saving a visit moves the call to Visited"
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={() => fetchVisits()} loading={isLoading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">New Visit Report</Button>
        </>} />

      <StatStrip items={[
        { label: "Visits", value: visits.length },
        { label: "Resolved at site", value: visits.filter((v) => v.Status === "Resolved at site").length, tone: "ok" },
        { label: "Job card required", value: visits.filter((v) => v.Status === "Job card required").length, tone: "warn" },
        { label: "Replacement required", value: visits.filter((v) => v.Status === "Replacement required").length, tone: "danger" },
        { label: "Customer not available", value: visits.filter((v) => v.Status === "Customer not available").length },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search visit, call no, customer, findings..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select placeholder="All Outcomes" value={outcomeFilter} onChange={setOutcomeFilter} allowClear className="w-52" options={VISIT_OUTCOMES.map((o) => ({ value: o, label: o }))} />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="VisitReportId" size="middle" loading={isLoading} scroll={{ x: 1000 }} pagination={{ defaultPageSize: 15, showSizeChanger: true }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<CarOutlined />} title={editing ? `Edit Visit — ${editing.VisitNo}` : "New Visit Report"} subtitle="Record what the engineer found at site and what was done." meta={<DrawerChip label={editing ? "Edit" : "New Visit"} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update Visit" : "Save Visit"}</Button></div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Visit date cannot be in the future or before the call date.</p>
          <FormSection number="01" title="Visit" description="Which call, who visited, and when.">
            <div className="form-grid form-grid-two">
              <div className="entry-field-wide"><Form.Item name="ComplaintId" label={fieldLabel("Service Call")} rules={[{ required: true, message: "Select the service call" }]}>
                <Select showSearch optionFilterProp="label" disabled={!!editing} placeholder="Select open call" onChange={onCallChange}
                  options={openCalls.map((c) => ({ value: c.ComplaintId, label: `${c.ComplaintNo} — ${c.CustomerName}${c.Village ? ` (${c.Village})` : ""}` }))} />
              </Form.Item></div>
              <Form.Item name="EngineerUserId" label={fieldLabel("Engineer")} rules={[{ required: !isEngineer, message: "Select the engineer" }]}>
                <Select disabled={isEngineer} placeholder="Select engineer" options={isEngineer ? [{ value: user!.UserId, label: `${user!.FirstName} ${user!.LastName || ""}` }] : engineers.map((e: any) => ({ value: e.UserId, label: `${e.FirstName} ${e.LastName || ""}` }))} />
              </Form.Item>
              <Form.Item name="VisitDate" label={fieldLabel("Visit Date")} rules={[{ required: true, message: "Visit date is required" }]}><SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} /></Form.Item>
              <Form.Item name="Status" label={fieldLabel("Outcome")} rules={[{ required: true }]}><Select options={VISIT_OUTCOMES.map((o) => ({ value: o, label: o }))} /></Form.Item>
              <Form.Item name="CustomerFeedback" label={fieldLabel("Customer Feedback")} rules={[{ max: 250 }]}><Input placeholder="e.g. Satisfied / 4 stars" /></Form.Item>
            </div>
          </FormSection>
          <FormSection number="02" title="Time & travel" description="When the visit happened, distance covered and expenses claimed.">
            <div className="form-grid form-grid-three">
              <Form.Item name="StartTime" label={fieldLabel("Start Time")}><Input type="time" /></Form.Item>
              <Form.Item name="EndTime" label={fieldLabel("End Time")} dependencies={["StartTime"]} rules={[({ getFieldValue }) => ({ validator: (_, v) => (!v || !getFieldValue("StartTime") || v >= getFieldValue("StartTime") ? Promise.resolve() : Promise.reject(new Error("End time cannot be before the start time"))) })]}><Input type="time" /></Form.Item>
              <Form.Item name="CustomerRating" label={fieldLabel("Customer Rating (1-5)")}><InputNumber min={1} max={5} precision={0} className="w-full" /></Form.Item>
              <Form.Item name="FromLocation" label={fieldLabel("From")}><Input maxLength={100} placeholder="Service center / home" /></Form.Item>
              <Form.Item name="ToLocation" label={fieldLabel("To (Site)")}><Input maxLength={100} /></Form.Item>
              <Form.Item name="TravelKm" label={fieldLabel("Travel (km)")}><InputNumber min={0} precision={0} className="w-full" /></Form.Item>
              <Form.Item name="TravelExpense" label={fieldLabel("Travel Expense ₹")}><InputNumber min={0} precision={2} className="w-full" /></Form.Item>
              <Form.Item name="OtherExpense" label={fieldLabel("Other Expense ₹")}><InputNumber min={0} precision={2} className="w-full" /></Form.Item>
            </div>
          </FormSection>
          <FormSection number="03" title="Findings" description="Observations at site and the action taken.">
            <div className="form-grid form-grid-two">
              <div className="entry-field-wide"><Form.Item name="Observations" label={fieldLabel("Findings at Site")}><Input.TextArea rows={3} placeholder="e.g. Motor winding burnt, low insulation resistance" /></Form.Item></div>
              <div className="entry-field-wide"><Form.Item name="ActionTaken" label={fieldLabel("Action Taken")}><Input.TextArea rows={3} placeholder="e.g. Motor lifted, job card raised for rewinding" /></Form.Item></div>
            </div>
          </FormSection>
        </Form>
      </Drawer>

      <ConfirmModal open={!!deleting} title="Delete Visit Report" description={`Delete visit ${deleting?.VisitNo}?`} warningText="The service call status is not changed." onCancel={() => setDeleting(null)}
        onConfirm={async () => { try { await deleteVisit(deleting!.VisitReportId); message.success("Visit report deleted"); setDeleting(null); } catch (err) { reportFormError(err, { fallback: "Could not delete visit report" }); } }} />
    </div>
  );
}
