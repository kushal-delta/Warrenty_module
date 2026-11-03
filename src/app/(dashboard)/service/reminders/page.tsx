"use client";

import React, { useEffect, useState } from "react";
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, message } from "antd";
import { BellOutlined, CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useServiceOpsStore, Reminder } from "@/lib/store/useServiceOpsStore";
import { useServiceStore } from "@/lib/store/useServiceStore";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

const isDue = (r: Reminder) => r.Status === "Pending" && dayjs(r.ReminderDate).isBefore(dayjs().endOf("day"));

export default function RemindersPage() {
  const [form] = Form.useForm();
  const { reminders, fetchReminders, saveReminder, deleteReminder, isLoading } = useServiceOpsStore();
  const { complaints, fetchComplaints } = useServiceStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>("Pending");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Reminder | null>(null);

  useEffect(() => {
    fetchReminders().catch((err) => reportFormError(err, { fallback: "Could not load reminders" }));
    fetchComplaints({ limit: 1000 }).catch(() => undefined);
  }, [fetchReminders, fetchComplaints]);

  const openForm = (row?: Reminder) => {
    setEditing(row || null);
    form.resetFields();
    form.setFieldsValue(row ? { ComplaintId: row.ComplaintId, ReminderDate: dayjs(row.ReminderDate), ReminderText: row.ReminderText, Status: row.Status } : { ReminderDate: dayjs().add(1, "day"), Status: "Pending" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await saveReminder({ ...values, ReminderDate: values.ReminderDate.toISOString(), ComplaintReminderId: editing?.ComplaintReminderId });
      message.success(editing ? "Reminder updated" : "Reminder added");
      setModalOpen(false);
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save reminder" });
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (row: Reminder) => {
    try { await saveReminder({ ComplaintReminderId: row.ComplaintReminderId, Status: "Done" }); message.success("Reminder marked done"); }
    catch (err) { reportFormError(err, { fallback: "Could not update reminder" }); }
  };

  const filtered = reminders.filter((r) => {
    const q = search.toLowerCase();
    return (!q || [r.ComplaintNo, r.CustomerName, r.Mobile, r.ReminderText].some((v) => v?.toLowerCase().includes(q))) && (!statusFilter || r.Status === statusFilter);
  });
  const openCalls = complaints.filter((c) => !["Closed", "Cancelled"].includes(c.Status) || c.ComplaintId === editing?.ComplaintId);

  const columns = [
    { title: "Call No", dataIndex: "ComplaintNo", key: "no", width: 150, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Customer", key: "cust", render: (_: any, r: Reminder) => <div><div className="font-semibold text-slate-800">{r.CustomerName}</div><div className="text-xs text-slate-500 font-mono">{r.Mobile}</div></div> },
    { title: "Remind On", dataIndex: "ReminderDate", key: "date", width: 120, render: (v: string, r: Reminder) => <span className={isDue(r) ? "font-bold text-red-600" : ""}>{formatDate(v)}</span> },
    { title: "Note", dataIndex: "ReminderText", key: "note", render: (v: string) => <span className="text-xs text-slate-700 whitespace-normal">{v}</span> },
    { title: "Created By", dataIndex: "CreatedBy", key: "by", width: 120, render: (v: string) => v || "-" },
    { title: "Status", dataIndex: "Status", key: "status", width: 110, render: (s: string, r: Reminder) => s === "Done" ? <Tag color="green">Done {r.DoneOn ? formatDate(r.DoneOn) : ""}</Tag> : <Tag color={isDue(r) ? "red" : "orange"}>{isDue(r) ? "Due" : "Pending"}</Tag> },
    { title: "Actions", key: "actions", width: 120, render: (_: any, r: Reminder) => (
      <Space size="small">
        {r.Status === "Pending" && <Tooltip title="Mark done"><Button type="text" size="small" icon={<CheckOutlined className="text-green-600" />} onClick={() => markDone(r)} /></Tooltip>}
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(r)} /></Tooltip>
        <Tooltip title="Delete"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(r)} /></Tooltip>
      </Space>
    ) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<BellOutlined />} title="Call Reminders" subtitle="Follow-up reminders on open service calls — overdue reminders are shown in red"
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={() => fetchReminders()} loading={isLoading}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">Add Reminder</Button>
        </>} />

      <StatStrip items={[
        { label: "Total", value: reminders.length },
        { label: "Pending", value: reminders.filter((r) => r.Status === "Pending").length, tone: "warn" },
        { label: "Due / overdue", value: reminders.filter(isDue).length, tone: "danger" },
        { label: "Done", value: reminders.filter((r) => r.Status === "Done").length, tone: "ok" },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search call no, customer, note..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select placeholder="All Statuses" value={statusFilter} onChange={setStatusFilter} allowClear className="w-36" options={[{ value: "Pending", label: "Pending" }, { value: "Done", label: "Done" }]} />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="ComplaintReminderId" size="middle" loading={isLoading} scroll={{ x: 900 }} pagination={{ defaultPageSize: 15, showSizeChanger: true }} />
      </div>

      <Modal open={modalOpen} title={editing ? "Edit Reminder" : "Add Reminder"} onCancel={() => setModalOpen(false)} destroyOnClose
        footer={[<Button key="c" onClick={() => setModalOpen(false)}>Cancel</Button>, <Button key="s" type="primary" loading={saving} onClick={handleSave} className="bg-blue-600">{editing ? "Update" : "Save Reminder"}</Button>]}>
        <Form form={form} layout="vertical" requiredMark className="py-2">
          <Form.Item name="ComplaintId" label={fieldLabel("Service Call")} rules={[{ required: true, message: "Select the service call" }]}>
            <Select showSearch optionFilterProp="label" placeholder="Select open call" options={openCalls.map((c) => ({ value: c.ComplaintId, label: `${c.ComplaintNo} — ${c.CustomerName}` }))} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="ReminderDate" label={fieldLabel("Remind On")} rules={[{ required: true, message: "Date is required" }]}><SmartDatePicker /></Form.Item>
            <Form.Item name="Status" label={fieldLabel("Status")} rules={[{ required: true }]}><Select options={[{ value: "Pending", label: "Pending" }, { value: "Done", label: "Done" }]} /></Form.Item>
          </div>
          <Form.Item name="ReminderText" label={fieldLabel("Note")} rules={[{ required: true, message: "Note is required" }, { max: 300 }]}><Input.TextArea rows={3} placeholder="e.g. Call customer to confirm visit time" /></Form.Item>
        </Form>
      </Modal>

      <ConfirmModal open={!!deleting} title="Delete Reminder" description={`Delete the reminder on ${deleting?.ComplaintNo}?`} warningText="" onCancel={() => setDeleting(null)}
        onConfirm={async () => { try { await deleteReminder(deleting!.ComplaintReminderId); message.success("Reminder deleted"); setDeleting(null); } catch (err) { reportFormError(err, { fallback: "Could not delete reminder" }); } }} />
    </div>
  );
}
