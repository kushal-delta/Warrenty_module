"use client";

import React, { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Drawer, Form, Input, InputNumber, Select, Space, Spin, Table, Tag, Tooltip, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { DeleteOutlined, EditOutlined, FilePdfOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SwapOutlined, UndoOutlined, UploadOutlined } from "@ant-design/icons";
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
import { MAX_REPLACEMENT_PDFS, PRODUCT_CATEGORIES, REPLACEMENT_STATUSES, REPLACEMENT_TYPES, VOUCHER_TYPES, WITHOUT_SERIAL } from "@/lib/config/service";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { useUrlQuery } from "@/lib/hooks/useUrlQuery";

const STATUS_COLOR: Record<string, string> = { Open: "blue", Received: "purple", Closed: "green", Cancelled: "default" };
const DATE_FIELDS = ["ReplDate", "DealerInvoiceDate", "ReceiptDate", "LrDate"];
const MAX_PDF_MB = 5;
const toDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("Could not read the file")); r.readAsDataURL(file); });

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
  const [pdfs, setPdfs] = useState<UploadFile[]>([]);
  const [existingDocs, setExistingDocs] = useState<any[]>([]);
  const [removedDocIds, setRemovedDocIds] = useState<string[]>([]);
  // "Without Serial No" cannot be traced to a warranty: the replacement is out of warranty and no serials are taken.
  const outOfWarranty = Form.useWatch("VoucherType", form) === WITHOUT_SERIAL;
  const keptDocs = existingDocs.filter((d) => !removedDocIds.includes(d.AttachmentId));
  const docCount = keptDocs.length + pdfs.length;

  useEffect(() => {
    fetchReplacements().catch((err) => reportFormError(err, { fallback: "Could not load replacements" }));
    fetchComplaints({ limit: 1000 }).catch(() => undefined);
    fetchDealers().catch(() => undefined);
  }, [fetchReplacements, fetchComplaints, fetchDealers]);

  const openForm = async (row?: Replacement) => {
    setEditing(row || null);
    form.resetFields();
    setPdfs([]); setExistingDocs([]); setRemovedDocIds([]);
    setDrawerOpen(true);
    if (!row) {
      form.setFieldsValue({ ReplDate: dayjs(), ReceiptDate: dayjs(), Source: "Dealer", VoucherType: "With Serial No", ReplacementType: "Invoice", Status: "Open", NoOfArticles: 1, lines: [{ Category: "PUMP", Qty: 1, Location: "Greater Noida HO" }] });
      return;
    }
    setLoadingDetail(true);
    try {
      const { replacement, lines, documents } = await fetchReplacementDetail(row.ReplacementId);
      setExistingDocs(documents || []);
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
      if (docCount < 1) { message.error("Attach at least one PDF document to the replacement"); return; }
      setSaving(true);
      const payload: any = { ...values, ReplacementId: editing?.ReplacementId };
      DATE_FIELDS.forEach((f) => { payload[f] = values[f] ? values[f].toISOString() : null; });
      const withoutSerial = values.VoucherType === WITHOUT_SERIAL;
      payload.lines = (values.lines || []).map((l: any) => ({ ...l, ...(withoutSerial ? { OldSerialNo: null, NewSerialNo: null } : {}), RefInvoiceDate: l.RefInvoiceDate ? l.RefInvoiceDate.toISOString() : null }));
      payload.documents = await Promise.all(pdfs.map(async (f) => ({ fileName: f.name, dataUrl: await toDataUrl(f.originFileObj as File) })));
      payload.removeDocumentIds = removedDocIds;
      const saved = await saveReplacement(payload);
      message.success(editing ? `Replacement ${saved.ReplNo} updated` : withoutSerial ? `Replacement ${saved.ReplNo} saved — out of warranty, no warranty transferred` : `Replacement ${saved.ReplNo} saved — warranty transferred to the new serial(s)`);
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
    { title: "Type", key: "type", width: 150, render: (_: any, r: Replacement) => <div>{r.ReplacementType}{r.OutOfWarranty ? <div><Tag color="red" className="mt-1">Out of warranty</Tag></div> : null}</div> },
    { title: "PDF", dataIndex: "DocumentCount", key: "pdf", width: 70, align: "center" as const, render: (n: number) => n ? <Tag icon={<FilePdfOutlined />} color="geekblue">{n}</Tag> : <Tag color="warning">None</Tag> },
    { title: "Net Value ₹", dataIndex: "NetValue", key: "nv", width: 110, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Credit Note", key: "cn", width: 140, render: (_: any, r: Replacement) => r.CnNo ? <span className="text-xs">{r.CnNo} · ₹ {inr(r.CnAmount, 2)}</span> : "—" },
    { title: "Status", dataIndex: "Status", key: "st", width: 100, render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
    { title: "Actions", key: "a", width: 90, render: (_: any, r: Replacement) => (
      <Space size="small">
        <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openForm(r)} /></Tooltip>
        {(role === "SUPER" || role === "HO" || role === "MANAGER") && <Tooltip title="Delete (reverses the warranty transfer)"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(r)} /></Tooltip>}
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
        <Table dataSource={filtered} columns={columns} rowKey="ReplacementId" size="middle" loading={isLoading} scroll={{ x: 1350 }} pagination={{ defaultPageSize: 15, showSizeChanger: true }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<SwapOutlined />} title={editing ? `Edit Replacement — ${editing.ReplNo}` : "New Replacement"} subtitle="Old serial must be in warranty; new serial must be an unregistered sticker of the same category." meta={<DrawerChip label={editing ? "Edit" : "New"} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">{editing ? "Update Replacement" : "Save & Transfer Warranty"}</Button></div>}
      >
        <Spin spinning={loadingDetail}>
          <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
            <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Serials of saved lines are locked; remove the line to reverse its transfer.</p>
            {outOfWarranty && <Alert type="warning" showIcon className="mb-4" message="Without serial no. — this replacement is out of warranty" description="No serial number can be traced to a warranty, so no warranty is checked or transferred. Enter the net value and charges to be billed." />}
            <FormSection number="01" title="Replacement header" description="Date, origin and commercial treatment.">
              <div className="form-grid form-grid-three">
                <Form.Item name="ReplDate" label={fieldLabel("Replacement Date")} rules={[{ required: true, message: "Date is required" }]}><SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} /></Form.Item>
                <Form.Item name="Source" label={fieldLabel("Source")}><Select options={["Dealer", "Service"].map((s) => ({ value: s, label: s }))} /></Form.Item>
                <Form.Item name="Status" label={fieldLabel("Status")} rules={[{ required: true }]}><Select options={REPLACEMENT_STATUSES.map((s) => ({ value: s, label: s }))} /></Form.Item>
                <Form.Item name="ComplaintId" label={fieldLabel("Service Call (if any)")}><Select allowClear showSearch optionFilterProp="label" placeholder="Link a service call" options={openCalls.map((c) => ({ value: c.ComplaintId, label: `${c.ComplaintNo} — ${c.CustomerName}` }))} onChange={(v) => form.setFieldValue("Source", v ? "Service" : "Dealer")} /></Form.Item>
                <Form.Item name="DealerId" label={fieldLabel("Dealer")}><Select allowClear showSearch optionFilterProp="label" placeholder="Taken from the warranty if blank" options={dealers.map((d) => ({ value: d.DealerId, label: `${d.FirmName}${d.DealerCode ? ` (${d.DealerCode})` : ""}` }))} /></Form.Item>
                <Form.Item name="ReplacementType" label={fieldLabel("Replacement Type")}><Select options={REPLACEMENT_TYPES.map((s) => ({ value: s, label: s }))} /></Form.Item>
                <Form.Item name="VoucherType" label={fieldLabel("Voucher Type")} extra={editing ? "Cannot be changed after saving" : undefined}>
                  <Select disabled={!!editing} options={VOUCHER_TYPES.map((s) => ({ value: s, label: s }))}
                    onChange={(v) => {
                      if (v !== WITHOUT_SERIAL) return;
                      // Out of warranty: serials are not taken, the replacement is chargeable.
                      form.setFieldValue("MakeSalesInvoice", true);
                      (form.getFieldValue("lines") || []).forEach((_: any, i: number) => { form.setFieldValue(["lines", i, "OldSerialNo"], undefined); form.setFieldValue(["lines", i, "NewSerialNo"], undefined); });
                    }} />
                </Form.Item>
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
                            {outOfWarranty ? (
                              <div className="entry-field-wide flex items-center"><Tag color="red">Without serial no. — out of warranty</Tag></div>
                            ) : (
                              <>
                                <Form.Item name={[field.name, "OldSerialNo"]} label={fieldLabel("Old Serial No")} rules={[{ required: !saved, message: "Old serial is required" }]}><Input disabled={saved} className="font-mono uppercase" /></Form.Item>
                                <Form.Item name={[field.name, "NewSerialNo"]} label={fieldLabel("New Serial No")}><Input disabled={saved} className="font-mono uppercase" placeholder="Unregistered sticker" /></Form.Item>
                              </>
                            )}
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

            <FormSection number="05" title={<>PDF documents <span className="text-red-500">*</span></>} description={`At least one PDF is required (dealer letter, invoice, inspection report …) — up to ${MAX_REPLACEMENT_PDFS} files, ${MAX_PDF_MB} MB each.`}>
              <div className="space-y-3 pb-4">
                {existingDocs.length > 0 && (
                  <ul className="space-y-1.5">
                    {existingDocs.map((d) => {
                      const removed = removedDocIds.includes(d.AttachmentId);
                      return (
                        <li key={d.AttachmentId} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                          <FilePdfOutlined className={removed ? "text-slate-300" : "text-red-500"} />
                          <a href={d.FileUrl} target="_blank" rel="noreferrer" className={`flex-1 truncate text-sm ${removed ? "line-through text-slate-400" : "text-blue-700"}`}>{d.FileName}</a>
                          <span className="text-xs text-slate-400">{Math.max(1, Math.round(Number(d.FileSize || 0) / 1024))} KB</span>
                          <Button type="text" size="small" danger={!removed} icon={removed ? <UndoOutlined /> : <DeleteOutlined />} onClick={() => setRemovedDocIds((ids) => (removed ? ids.filter((x) => x !== d.AttachmentId) : [...ids, d.AttachmentId]))}>{removed ? "Undo" : "Remove"}</Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Upload accept=".pdf,application/pdf" multiple fileList={pdfs} showUploadList={{ showPreviewIcon: false }}
                  beforeUpload={(file) => {
                    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { message.error(`${file.name} is not a PDF file`); return Upload.LIST_IGNORE; }
                    if (file.size > MAX_PDF_MB * 1024 * 1024) { message.error(`${file.name} is larger than ${MAX_PDF_MB} MB`); return Upload.LIST_IGNORE; }
                    return false;
                  }}
                  onChange={({ fileList }) => setPdfs(fileList.slice(0, Math.max(0, MAX_REPLACEMENT_PDFS - keptDocs.length)))}>
                  {docCount < MAX_REPLACEMENT_PDFS && <Button icon={<UploadOutlined />}>Attach PDF</Button>}
                </Upload>
                <div className={`text-xs ${docCount ? "text-slate-500" : "text-red-600"}`}>{docCount ? `${docCount} PDF${docCount > 1 ? "s" : ""} attached` : "No PDF yet — at least one is required"}</div>
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
