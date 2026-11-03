"use client";

import React, { useEffect, useState } from "react";
import { Button, Checkbox, Drawer, Form, Input, InputNumber, Select, Space, Spin, Table, Tag, Tooltip, message } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SwapOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useServiceOpsStore, Replacement } from "@/lib/store/useServiceOpsStore";
import { useServiceStore } from "@/lib/store/useServiceStore";
import { useWarrantyStore } from "@/lib/store/useWarrantyStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { FormSection } from "@/components/common/FormSection";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel, inr } from "@/components/common/PageHeader";
import { PRODUCT_CATEGORIES, REPLACEMENT_STATUSES, REPLACEMENT_TYPES } from "@/lib/config/service";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";

const STATUS_COLOR: Record<string, string> = { Open: "blue", Received: "purple", Closed: "green", Cancelled: "default" };
const DATE_FIELDS = ["ReplDate", "DealerInvoiceDate", "ReceiptDate", "LrDate"];

export default function ReplacementsPage() {
  const [form] = Form.useForm();
  const { replacements, fetchReplacements, fetchReplacementDetail, saveReplacement, deleteReplacement, isLoading } = useServiceOpsStore();
  const { complaints, fetchComplaints } = useServiceStore();
  const { dealers, fetchDealers } = useWarrantyStore();
  const role = useAuthStore((s) => s.user?.Role);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>();
  const [sourceFilter, setSourceFilter] = useState<string>();
  useUrlQuery("q", (q) => { setSearch(q); setStatusFilter(undefined); setSourceFilter(undefined); });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [editing, setEditing] = useState<Replacement | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Replacement | null>(null);

  useEffect(() => {
    fetchReplacements().catch((err) => reportFormError(err, { fallback: "Could not load replacements" }));
    fetchComplaints({ limit: 1000 }).catch(() => undefined);
    fetchDealers().catch(() => undefined);
  }, [fetchReplacements, fetchComplaints, fetchDealers]);

  const openForm = async (row?: Replacement) => {
    setEditing(row || null);
    form.resetFields();
    setDrawerOpen(true);
    if (!row) {
      form.setFieldsValue({ ReplDate: dayjs(), ReceiptDate: dayjs(), Source: "Dealer", VoucherType: "With Serial No", ReplacementType: "Invoice", Status: "Open", NoOfArticles: 1, lines: [{ Category: "PUMP", Qty: 1, Location: "Greater Noida HO" }] });
      return;
    }
    setLoadingDetail(true);
    try {
      const { replacement, lines } = await fetchReplacementDetail(row.ReplacementId);
      const header: any = { ...replacement };
      DATE_FIELDS.forEach((f) => { header[f] = replacement[f] ? dayjs(replacement[f]) : undefined; });
      form.setFieldsValue({ ...header, CnAmount: replacement.CnAmount != null ? Number(replacement.CnAmount) : undefined, lines: lines.map((l) => ({ ...l, NetValue: l.NetValue != null ? Number(l.NetValue) : undefined, Charges: l.Charges != null ? Number(l.Charges) : undefined, RefInvoiceDate: l.RefInvoiceDate ? dayjs(l.RefInvoiceDate) : undefined })) });
    } catch (err) {
      reportFormError(err, { fallback: "Could not load replacement" });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload: any = { ...values, ReplacementId: editing?.ReplacementId };
      DATE_FIELDS.forEach((f) => { payload[f] = values[f] ? values[f].toISOString() : null; });
      payload.lines = (values.lines || []).map((l: any) => ({ ...l, RefInvoiceDate: l.RefInvoiceDate ? l.RefInvoiceDate.toISOString() : null }));
      const saved = await saveReplacement(payload);
      message.success(editing ? `Replacement ${saved.ReplNo} updated` : `Replacement ${saved.ReplNo} saved — warranty transferred to the new serial(s)`);
      setDrawerOpen(false);
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save replacement" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = replacements.filter((r) => {
    const q = search.toLowerCase();
    return (!q || [r.ReplNo, r.DealerName, r.ComplaintNo, r.CustomerName, r.SerialSwaps, r.LrNo, r.CnNo].some((v) => v?.toLowerCase().includes(q)))
      && (!statusFilter || r.Status === statusFilter) && (!sourceFilter || r.Source === sourceFilter);
  });

  const columns = [
    { title: "Replacement No", dataIndex: "ReplNo", key: "no", width: 150, render: (v: string) => <span className="font-mono font-bold text-blue-700">{v}</span> },
    { title: "Date", dataIndex: "ReplDate", key: "date", width: 100, render: (v: string) => formatDate(v) },
    { title: "Source", dataIndex: "Source", key: "src", width: 90, render: (s: string) => <Tag color={s === "Service" ? "cyan" : "purple"}>{s}</Tag> },
    { title: "Call / Dealer", key: "cd", render: (_: any, r: Replacement) => <div className="text-xs"><div className="font-mono text-slate-500">{r.ComplaintNo || "—"}</div><div className="font-semibold text-slate-800">{r.DealerName || r.CustomerName || "-"}</div></div> },
    { title: "Old → New Serial", dataIndex: "SerialSwaps", key: "sw", render: (v: string) => <div className="font-mono text-[11.5px] whitespace-normal">{(v || "").split(", ").map((s) => <div key={s}>{s}</div>)}</div> },
    { title: "Type", dataIndex: "ReplacementType", key: "type", width: 120 },
    { title: "Net Value ₹", dataIndex: "NetValue", key: "nv", width: 110, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Credit Note", key: "cn", width: 140, render: (_: any, r: Replacement) => r.CnNo ? <span className="text-xs">{r.CnNo} · ₹ {inr(r.CnAmount, 2)}</span> : "—" },
    { title: "Status", dataIndex: "Status", key: "st", width: 100, render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
    { title: "Actions", key: "a", width: 90, render: (_: any, r: Replacement) => (
      <Space size="small">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(r)} /></Tooltip>
        {role !== "ENGINEER" && <Tooltip title="Delete (reverses the warranty transfer)"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(r)} /></Tooltip>}
      </Space>
    ) },
  ];

  const openCalls = complaints.filter((c) => !["Closed", "Cancelled"].includes(c.Status) || c.ComplaintId === editing?.ComplaintId);

  return (
    <div className="space-y-4">
      <PageHeader icon={<SwapOutlined />} title="Replacement / Return Pump" subtitle="In-warranty product replacement · the balance warranty of the old serial moves to the new serial automatically"
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={() => fetchReplacements()} loading={isLoading}>Refresh</Button>
          {role !== "ENGINEER" && <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()} className="bg-blue-600 shadow-sm">New Replacement</Button>}
        </>} />

      <StatStrip items={[
        { label: "Replacements", value: replacements.length },
        { label: "Open", value: replacements.filter((r) => r.Status === "Open").length, tone: "warn" },
        { label: "Closed", value: replacements.filter((r) => r.Status === "Closed").length, tone: "ok" },
        { label: "Net value ₹", value: inr(replacements.reduce((s, r) => s + Number(r.NetValue || 0), 0)) },
        { label: "Credit notes ₹", value: inr(replacements.reduce((s, r) => s + Number(r.CnAmount || 0), 0)) },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search replacement no, serial, dealer, call, LR, CN..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select placeholder="All Sources" value={sourceFilter} onChange={setSourceFilter} allowClear className="w-32" options={["Dealer", "Service"].map((s) => ({ value: s, label: s }))} />
        <Select placeholder="All Statuses" value={statusFilter} onChange={setStatusFilter} allowClear className="w-36" options={REPLACEMENT_STATUSES.map((s) => ({ value: s, label: s }))} />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="ReplacementId" size="middle" loading={isLoading} scroll={{ x: 1250 }} pagination={{ defaultPageSize: 15, showSizeChanger: true }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<SwapOutlined />} title={editing ? `Edit Replacement — ${editing.ReplNo}` : "New Replacement"} subtitle="Old serial must be in warranty; new serial must be an unregistered sticker of the same category." meta={<DrawerChip label={editing ? "Edit" : "New"} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update Replacement" : "Save & Transfer Warranty"}</Button></div>}
      >
        <Spin spinning={loadingDetail}>
          <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
            <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Serials of saved lines are locked; remove the line to reverse its transfer.</p>
            <FormSection number="01" title="Replacement header" description="Date, origin and commercial treatment.">
              <div className="form-grid form-grid-three">
                <Form.Item name="ReplDate" label={fieldLabel("Replacement Date")} rules={[{ required: true, message: "Date is required" }]}><SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} /></Form.Item>
                <Form.Item name="Source" label={fieldLabel("Source")}><Select options={["Dealer", "Service"].map((s) => ({ value: s, label: s }))} /></Form.Item>
                <Form.Item name="Status" label={fieldLabel("Status")} rules={[{ required: true }]}><Select options={REPLACEMENT_STATUSES.map((s) => ({ value: s, label: s }))} /></Form.Item>
                <Form.Item name="ComplaintId" label={fieldLabel("Service Call (if any)")}><Select allowClear showSearch optionFilterProp="label" placeholder="Link a service call" options={openCalls.map((c) => ({ value: c.ComplaintId, label: `${c.ComplaintNo} — ${c.CustomerName}` }))} onChange={(v) => form.setFieldValue("Source", v ? "Service" : "Dealer")} /></Form.Item>
                <Form.Item name="DealerId" label={fieldLabel("Dealer")}><Select allowClear showSearch optionFilterProp="label" placeholder="Taken from the warranty if blank" options={dealers.map((d) => ({ value: d.DealerId, label: `${d.FirmName}${d.DealerCode ? ` (${d.DealerCode})` : ""}` }))} /></Form.Item>
                <Form.Item name="ReplacementType" label={fieldLabel("Replacement Type")}><Select options={REPLACEMENT_TYPES.map((s) => ({ value: s, label: s }))} /></Form.Item>
                <Form.Item name="VoucherType" label={fieldLabel("Voucher Type")}><Select options={["With Serial No", "Without Serial No"].map((s) => ({ value: s, label: s }))} /></Form.Item>
                <Form.Item name="NoOfArticles" label={fieldLabel("No. of Articles")}><InputNumber min={0} precision={0} className="w-full" /></Form.Item>
                <Form.Item name="MakeSalesInvoice" valuePropName="checked" label={fieldLabel("Sales Invoice")}><Checkbox>Make sales invoice</Checkbox></Form.Item>
                <div className="entry-field-wide"><Form.Item name="Reason" label={fieldLabel("Reason")} rules={[{ max: 300 }]}><Input placeholder="e.g. Pump jammed, impeller broken within warranty" /></Form.Item></div>
              </div>
            </FormSection>

            <FormSection number="02" title="Dealer return & transport" description="Material received back from the dealer.">
              <div className="form-grid form-grid-three">
                <Form.Item name="DealerInvoiceNo" label={fieldLabel("Dealer Invoice No")}><Input maxLength={60} /></Form.Item>
                <Form.Item name="DealerInvoiceDate" label={fieldLabel("Dealer Invoice Date")}><SmartDatePicker /></Form.Item>
                <Form.Item name="ReceiptDate" label={fieldLabel("Receipt Date")}><SmartDatePicker /></Form.Item>
                <Form.Item name="Transporter" label={fieldLabel("Transporter")}><Input maxLength={100} /></Form.Item>
                <Form.Item name="LrNo" label={fieldLabel("LR No")}><Input maxLength={60} /></Form.Item>
                <Form.Item name="LrDate" label={fieldLabel("LR Date")}><SmartDatePicker /></Form.Item>
              </div>
            </FormSection>

            <FormSection number="03" title="Items replaced" description="One line per product swapped. Warranty days left are calculated on save.">
              <Form.List name="lines">
                {(fields, { add, remove }) => (
                  <div className="space-y-3 pb-4">
                    {fields.map((field, index) => {
                      const saved = !!form.getFieldValue(["lines", field.name, "ReplacementItemLnId"]);
                      const days = form.getFieldValue(["lines", field.name, "WarrantyDaysLeft"]);
                      return (
                        <div key={field.key} className="rounded-lg border border-slate-200 p-3 bg-slate-50/60">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-600">Line {index + 1}{saved && days != null && <Tag color="green" className="ml-2">{days} days warranty transferred</Tag>}</span>
                            {fields.length > 1 && <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Remove</Button>}
                          </div>
                          <Form.Item name={[field.name, "ReplacementItemLnId"]} hidden><Input /></Form.Item>
                          <Form.Item name={[field.name, "WarrantyDaysLeft"]} hidden><Input /></Form.Item>
                          <div className="form-grid form-grid-four">
                            <Form.Item name={[field.name, "Category"]} label={fieldLabel("Category")}><Select disabled={saved} options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))} /></Form.Item>
                            <Form.Item name={[field.name, "OldSerialNo"]} label={fieldLabel("Old Serial No")} rules={[{ required: !saved, message: "Old serial is required" }]}><Input disabled={saved} className="font-mono uppercase" /></Form.Item>
                            <Form.Item name={[field.name, "NewSerialNo"]} label={fieldLabel("New Serial No")}><Input disabled={saved} className="font-mono uppercase" placeholder="Unregistered sticker" /></Form.Item>
                            <Form.Item name={[field.name, "Qty"]} label={fieldLabel("Qty")} rules={[{ required: true, message: "Qty" }]}><InputNumber min={1} precision={0} className="w-full" /></Form.Item>
                            <Form.Item name={[field.name, "NetValue"]} label={fieldLabel("Net Value ₹")}><InputNumber min={0} precision={2} className="w-full" /></Form.Item>
                            <Form.Item name={[field.name, "Charges"]} label={fieldLabel("Charges ₹")}><InputNumber min={0} precision={2} className="w-full" /></Form.Item>
                            <Form.Item name={[field.name, "Location"]} label={fieldLabel("Location")}><Input maxLength={80} /></Form.Item>
                            <Form.Item name={[field.name, "RefInvoiceNo"]} label={fieldLabel("Ref Invoice No")}><Input maxLength={60} /></Form.Item>
                            <div className="entry-field-wide"><Form.Item name={[field.name, "Remarks"]} label={fieldLabel("Remarks")}><Input maxLength={300} /></Form.Item></div>
                          </div>
                        </div>
                      );
                    })}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ Category: "PUMP", Qty: 1, Location: "Greater Noida HO" })} block>Add Line</Button>
                  </div>
                )}
              </Form.List>
            </FormSection>

            <FormSection number="04" title="Credit note" description="Credit note issued to the dealer, if any.">
              <div className="form-grid form-grid-three">
                <Form.Item name="CnNo" label={fieldLabel("Credit Note No")}><Input maxLength={50} /></Form.Item>
                <Form.Item name="CnAmount" label={fieldLabel("Credit Note Amount ₹")}><InputNumber min={0} precision={2} className="w-full" /></Form.Item>
                <Form.Item name="Remarks" label={fieldLabel("Remarks")}><Input maxLength={300} /></Form.Item>
              </div>
            </FormSection>
          </Form>
        </Spin>
      </Drawer>

      <ConfirmModal open={!!deleting} title="Delete Replacement" description={`Delete replacement ${deleting?.ReplNo}?`} warningText="The warranty goes back to the old serial and the new sticker is freed. Not allowed once the new serial has service calls." onCancel={() => setDeleting(null)}
        onConfirm={async () => { try { await deleteReplacement(deleting!.ReplacementId); message.success("Replacement deleted and warranty transfer reversed"); setDeleting(null); } catch (err) { reportFormError(err, { fallback: "Could not delete replacement" }); } }} />
    </div>
  );
}
