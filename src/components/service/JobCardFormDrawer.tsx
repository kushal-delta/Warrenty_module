"use client";

import React, { useEffect, useState } from "react";
import { Button, Checkbox, Drawer, Form, Input, InputNumber, Select, Spin, Table, message } from "antd";
import { DeleteOutlined, PlusOutlined, ToolOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useJobCardStore } from "@/lib/store/useJobCardStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useServiceStore } from "@/lib/store/useServiceStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { FormSection } from "@/components/common/FormSection";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { fieldLabel, inr } from "@/components/common/PageHeader";
import { reportFormError } from "@/lib/utils/formErrors";

interface Props {
  open: boolean;
  jobCardId?: string | null;
  complaintId?: string | null;
  onClose: () => void;
  onSaved: (jobCardId: string) => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Create / edit a job card (repair estimate): call, faults, spare lines with warranty flag, labour, and live totals. */
export function JobCardFormDrawer({ open, jobCardId, complaintId, onClose, onSaved }: Props) {
  const [form] = Form.useForm();
  const { fetchJobCardDetail, saveJobCard } = useJobCardStore();
  const { spares, faultMasters, labourMasters } = useMasterStore();
  const { complaints, fetchComplaints } = useServiceStore();
  const user = useAuthStore((s) => s.user);
  const [maximized, setMaximized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [status, setStatus] = useState<string>("Draft");
  const [jobCardNo, setJobCardNo] = useState<string>();

  const items = Form.useWatch("items", form) || [];
  const labour = Number(Form.useWatch("LabourTotal", form) || 0);
  const selectedCallId = Form.useWatch("ComplaintId", form);

  useEffect(() => {
    if (!open) return;
    fetchComplaints({ limit: 1000 }).catch(() => undefined);
    form.resetFields();
    setStatus("Draft");
    setJobCardNo(undefined);
    if (!jobCardId) {
      form.setFieldsValue({ ComplaintId: complaintId || undefined, JobCardDate: dayjs(), LabourTotal: 0, items: [], faults: [] });
      return;
    }
    setLoading(true);
    fetchJobCardDetail(jobCardId)
      .then(({ jobCard, faults, items: lines }) => {
        setStatus(jobCard.Status);
        setJobCardNo(jobCard.JobCardNo);
        form.setFieldsValue({
          ComplaintId: jobCard.ComplaintId, JobCardDate: dayjs(jobCard.JobCardDate), Remarks: jobCard.Remarks, LabourTotal: Number(jobCard.LabourTotal),
          faults: faults.map((f) => f.FaultMasterId),
          items: lines.map((l) => ({ SpareId: l.SpareId, Qty: l.Qty, Rate: Number(l.Rate), IsWarranty: Boolean(l.IsWarranty) })),
        });
      })
      .catch((err) => reportFormError(err, { fallback: "Could not load job card" }))
      .finally(() => setLoading(false));
    // Reload only when the drawer opens or switches record; store actions and the form instance are stable.
  }, [open, jobCardId, complaintId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineAmount = (l: any) => round2(Number(l?.Qty || 0) * Number(l?.Rate || 0));
  const sparesTotal = round2(items.reduce((s: number, l: any) => s + lineAmount(l), 0));
  const warranty = round2(items.filter((l: any) => l?.IsWarranty).reduce((s: number, l: any) => s + lineAmount(l), 0));
  const total = round2(sparesTotal + labour);

  const save = async (submit: boolean) => {
    try {
      const values = await form.validateFields();
      setSaving(submit ? "submit" : "draft");
      const result = await saveJobCard({
        JobCardId: jobCardId || undefined,
        ComplaintId: values.ComplaintId,
        JobCardDate: values.JobCardDate.toISOString(),
        Remarks: values.Remarks,
        LabourTotal: values.LabourTotal || 0,
        faults: (values.faults || []).map((id: string) => ({ FaultMasterId: id })),
        items: values.items || [],
        submit,
      });
      const s = result.jobCard.Status;
      message.success(result.restarted ? `Job card ${result.jobCard.JobCardNo} changed — approval restarted on the new amount` : s === "In Approval" ? `Job card ${result.jobCard.JobCardNo} sent for approval` : s === "Approved" ? `Job card ${result.jobCard.JobCardNo} approved (no approval level applies)` : `Job card ${result.jobCard.JobCardNo} saved as draft`);
      onSaved(result.jobCard.JobCardId);
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save job card" });
    } finally {
      setSaving(null);
    }
  };

  const openCalls = complaints.filter((c) => !["Closed", "Cancelled", "Resolved"].includes(c.Status) || c.ComplaintId === selectedCallId)
    .filter((c) => user?.Role !== "ENGINEER" || c.EngineerUserId === user.UserId);
  const faultOptions = Object.entries(faultMasters.filter((f: any) => f.IsActive).reduce((groups: Record<string, any[]>, f: any) => { (groups[f.Category] ||= []).push(f); return groups; }, {}))
    .map(([category, list]) => ({ label: category, options: list.map((f: any) => ({ value: f.FaultMasterId, label: f.FaultName })) }));

  return (
    <Drawer rootClassName="entry-drawer" open={open} onClose={onClose} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
      title={<DrawerHeader icon={<ToolOutlined />} title={jobCardNo ? `Edit Job Card — ${jobCardNo}` : "New Job Card (Repair Estimate)"} subtitle="Faults found, spares and labour needed. Warranty-covered spares are borne by the company." meta={<DrawerChip label={status} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={onClose} />}
      footer={<div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="text-xs text-slate-500">Total <b className="text-slate-900">₹ {inr(total, 2)}</b> · Warranty <b className="text-emerald-700">₹ {inr(warranty, 2)}</b> · Customer pays <b className="text-blue-700">₹ {inr(Math.max(0, total - warranty), 2)}</b></div>
        <div className="flex gap-2">
          <Button onClick={onClose} disabled={!!saving}>Cancel</Button>
          {status !== "In Approval" && <Button onClick={() => save(false)} loading={saving === "draft"} disabled={!!saving}>Save Draft</Button>}
          <Button type="primary" onClick={() => save(true)} loading={saving === "submit"} disabled={!!saving} className="bg-blue-600">{status === "In Approval" ? "Save & Restart Approval" : "Save & Send for Approval"}</Button>
        </div>
      </div>}
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Add at least one spare line or labour charges.</p>
          <FormSection number="01" title="Service call" description="The call this repair estimate belongs to.">
            <div className="form-grid form-grid-two">
              <div className="entry-field-wide"><Form.Item name="ComplaintId" label={fieldLabel("Service Call")} rules={[{ required: true, message: "Select the service call" }]}>
                <Select showSearch optionFilterProp="label" placeholder="Select open call" disabled={!!jobCardId}
                  options={openCalls.map((c) => ({ value: c.ComplaintId, label: `${c.ComplaintNo} — ${c.CustomerName}${c.EngineerName && c.EngineerName !== "Unassigned" ? ` · ${c.EngineerName}` : ""}` }))} />
              </Form.Item></div>
              <Form.Item name="JobCardDate" label={fieldLabel("Job Card Date")} rules={[{ required: true, message: "Date is required" }]}><SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} /></Form.Item>
              <Form.Item name="faults" label={fieldLabel("Faults Found")}><Select mode="multiple" allowClear placeholder="Select faults" options={faultOptions} optionFilterProp="label" /></Form.Item>
            </div>
          </FormSection>

          <FormSection number="02" title="Spares" description="Parts to be replaced. Tick Warranty when the part is covered — it is held as a faulty part for the claim.">
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <div className="space-y-2 pb-4">
                  <Table size="small" pagination={false} dataSource={fields} rowKey="key" scroll={{ x: 760 }} locale={{ emptyText: "No spare lines yet" }}
                    columns={[
                      { title: "Spare", key: "spare", render: (_: any, field: any) => (
                        <Form.Item name={[field.name, "SpareId"]} rules={[{ required: true, message: "Select a spare" }]} className="mb-0">
                          <Select showSearch optionFilterProp="label" placeholder="Select spare" style={{ minWidth: 240 }}
                            options={spares.filter((s: any) => s.IsActive).map((s: any) => ({ value: s.SpareId, label: `${s.SpareCode} — ${s.SpareName}` }))}
                            onChange={(id) => { const spare = spares.find((s: any) => s.SpareId === id); if (spare) form.setFieldValue(["items", field.name, "Rate"], Number(spare.CurrentRate)); }} />
                        </Form.Item>
                      ) },
                      { title: "Qty", key: "qty", width: 90, render: (_: any, field: any) => <Form.Item name={[field.name, "Qty"]} rules={[{ required: true, message: "Qty" }]} className="mb-0"><InputNumber min={1} precision={0} className="w-full" /></Form.Item> },
                      { title: "Rate ₹", key: "rate", width: 120, render: (_: any, field: any) => <Form.Item name={[field.name, "Rate"]} rules={[{ required: true, message: "Rate" }]} className="mb-0"><InputNumber min={0} precision={2} className="w-full" /></Form.Item> },
                      { title: "Amount ₹", key: "amt", width: 110, align: "right" as const, render: (_: any, field: any) => inr(lineAmount(items[field.name]), 2) },
                      { title: "Warranty", key: "w", width: 85, align: "center" as const, render: (_: any, field: any) => <Form.Item name={[field.name, "IsWarranty"]} valuePropName="checked" className="mb-0"><Checkbox /></Form.Item> },
                      { title: "", key: "del", width: 44, render: (_: any, field: any) => <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)} /> },
                    ]} />
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ Qty: 1, IsWarranty: true })} block>Add Spare Line</Button>
                </div>
              )}
            </Form.List>
          </FormSection>

          <FormSection number="03" title="Labour & notes" description="Service charges and remarks for the approver.">
            <div className="form-grid form-grid-two">
              <Form.Item label={fieldLabel("Add Standard Labour Charge")}>
                <Select placeholder="Pick from labour master to add its rate" value={null as any} allowClear showSearch optionFilterProp="label"
                  options={labourMasters.filter((l: any) => l.IsActive).map((l: any) => ({ value: l.LabourMasterId, label: `${l.LabourName} — ₹ ${inr(l.StandardRate, 2)}` }))}
                  onChange={(id) => { const l = labourMasters.find((x: any) => x.LabourMasterId === id); if (l) form.setFieldValue("LabourTotal", round2(labour + Number(l.StandardRate))); }} />
              </Form.Item>
              <Form.Item name="LabourTotal" label={fieldLabel("Labour Charges ₹")} rules={[{ type: "number", min: 0, message: "Cannot be negative" }]}><InputNumber min={0} precision={2} className="w-full" /></Form.Item>
              <div className="entry-field-wide"><Form.Item name="Remarks" label={fieldLabel("Notes")}><Input.TextArea rows={2} placeholder="e.g. Motor rewinding needed; customer informed of charges" /></Form.Item></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pb-5 text-sm">
              {[["Spares", sparesTotal], ["Labour", labour], ["Total estimate", total], ["Warranty (company)", warranty], ["Customer pays", Math.max(0, total - warranty)]].map(([label, value]) => (
                <div key={label as string} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2"><div className="text-[11px] text-slate-500">{label}</div><div className="font-bold text-slate-900">₹ {inr(value, 2)}</div></div>
              ))}
            </div>
          </FormSection>
        </Form>
      </Spin>
    </Drawer>
  );
}
