"use client";

import React, { useEffect, useState } from "react";
import { Button, Drawer, Form, Input, InputNumber, Select, Table, Tag, Tooltip, message } from "antd";
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SwapOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useStockStore, StockTxn } from "@/lib/store/useStockStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { FormSection } from "@/components/common/FormSection";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { PageHeader, TABLE_CARD, fieldLabel, inr } from "@/components/common/PageHeader";
import { STOCK_TXN_TYPES } from "@/lib/config/service";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

const TXN_COLOR: Record<string, string> = { Opening: "blue", Receipt: "green", Transfer: "purple", "Issue-Out": "orange", Consume: "red", "Return-Damaged": "magenta", "Adjust-In": "cyan", "Adjust-Out": "gold" };

/** Location picker: service-centre stores and engineer vans in one grouped list. Values look like "SC|<id>". */
function LocationSelect({ value, onChange, damaged }: { value?: string; onChange?: (v: string) => void; damaged?: boolean }) {
  const { serviceCenters, engineers } = useMasterStore();
  const options = damaged
    ? [{ label: "Faulty-parts bin at store", options: serviceCenters.map((s: any) => ({ value: `DAMAGED|${s.ServiceCenterId}`, label: s.ServiceCenterName })) }]
    : [
      { label: "Service-centre stores", options: serviceCenters.map((s: any) => ({ value: `SC|${s.ServiceCenterId}`, label: s.ServiceCenterName })) },
      { label: "Engineer vans", options: engineers.map((e: any) => ({ value: `ENG|${e.UserId}`, label: `${e.FirstName} ${e.LastName || ""}` })) },
    ];
  return <Select value={value} onChange={onChange} showSearch optionFilterProp="label" placeholder="Select location" options={options} />;
}

export default function StockLedgerPage() {
  const [form] = Form.useForm();
  const { txns, fetchTxns, addTxn, deleteTxn, isLoading } = useStockStore();
  const { spares } = useMasterStore();
  const role = useAuthStore((s) => s.user?.Role);
  const canPost = role !== "ENGINEER";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<StockTxn | null>(null);
  const txnType: string = Form.useWatch("TxnType", form) || "Receipt";
  const rule = STOCK_TXN_TYPES[txnType];

  const refresh = () => fetchTxns().catch((err) => reportFormError(err, { fallback: "Could not load stock ledger" }));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openForm = () => {
    form.resetFields();
    form.setFieldsValue({ TxnType: "Receipt", TxnDate: dayjs(), Qty: 1 });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const [fromType, fromId] = String(values.From || "").split("|");
      const [toType, toId] = String(values.To || "").split("|");
      await addTxn({
        TxnType: values.TxnType, TxnDate: values.TxnDate.toISOString(), SpareId: values.SpareId, Qty: values.Qty, Rate: values.Rate, Remarks: values.Remarks,
        FromLocType: rule.from ? fromType : null, FromLocId: rule.from ? fromId : null, ToLocType: rule.to ? toType : null, ToLocId: rule.to ? toId : null,
      });
      message.success("Stock entry saved");
      setDrawerOpen(false);
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not save stock entry" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = txns.filter((t) => {
    const q = search.toLowerCase();
    return (!typeFilter || t.TxnType === typeFilter) && (!q || [t.SpareCode, t.SpareName, t.FromLocName, t.ToLocName, t.JobCardNo, t.Remarks].some((v) => v?.toLowerCase().includes(q)));
  });

  const columns = [
    { title: "Date", dataIndex: "TxnDate", key: "date", width: 100, render: (v: string) => formatDate(v) },
    { title: "Type", dataIndex: "TxnType", key: "type", width: 130, render: (v: string) => <Tag color={TXN_COLOR[v]}>{STOCK_TXN_TYPES[v]?.label || v}</Tag> },
    { title: "Spare", key: "spare", render: (_: any, t: StockTxn) => <div><div className="font-semibold text-slate-800">{t.SpareName}</div><div className="text-[11px] text-slate-400 font-mono">{t.SpareCode}</div></div> },
    { title: "From", dataIndex: "FromLocName", key: "from", render: (v: string, t: StockTxn) => v || <span className="text-slate-400">{t.TxnType === "Receipt" ? "Supplier" : "—"}</span> },
    { title: "To", dataIndex: "ToLocName", key: "to", render: (v: string, t: StockTxn) => v || <span className="text-slate-400">{t.TxnType === "Consume" ? "Customer" : "—"}</span> },
    { title: "Qty", dataIndex: "Qty", key: "qty", width: 80, align: "right" as const, render: (v: number, t: StockTxn) => <b>{v} {t.Uom}</b> },
    { title: "Amount ₹", dataIndex: "Amount", key: "amt", width: 110, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Reference / Remarks", key: "ref", render: (_: any, t: StockTxn) => <div className="text-xs whitespace-normal">{t.JobCardNo && <div className="font-mono text-blue-700">{t.JobCardNo}</div>}<div className="text-slate-500">{t.Remarks || ""}</div></div> },
    { title: "", key: "a", width: 50, render: (_: any, t: StockTxn) => canPost && !t.JobCardItemLnId ? <Tooltip title="Delete entry"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(t)} /></Tooltip> : null },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<SwapOutlined />} title="Stock Ledger & Entry" subtitle="Receipts, transfers, issues and adjustments are entered here · job card approval posts consumption automatically"
        actions={<>
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={isLoading}>Refresh</Button>
          {canPost && <Button type="primary" icon={<PlusOutlined />} onClick={openForm} className="bg-blue-600 shadow-sm">New Stock Entry</Button>}
        </>} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search spare, location, job card, remarks..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select placeholder="All Types" value={typeFilter} onChange={setTypeFilter} allowClear className="w-48" options={[...Object.entries(STOCK_TXN_TYPES).map(([k, v]) => ({ value: k, label: v.label })), { value: "Consume", label: "Consumed on job card" }]} />
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="StockTxnId" size="middle" loading={isLoading} scroll={{ x: 1100 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }} />
      </div>

      <Drawer rootClassName="entry-drawer" open={drawerOpen} onClose={() => setDrawerOpen(false)} closable={false} width={DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<SwapOutlined />} title="New Stock Entry" subtitle={rule?.hint || ""} meta={<DrawerChip label={rule?.label || txnType} tone="solid" />} onClose={() => setDrawerOpen(false)} />}
        footer={<div className="flex items-center justify-end space-x-2 py-2"><Button onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button><Button type="primary" onClick={handleSave} loading={saving} className="bg-blue-600">Save Entry</Button></div>}
      >
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
          <p className="entry-form-hint"><span aria-hidden="true">*</span> Required fields · Outgoing quantity cannot exceed the stock at the source.</p>
          <FormSection number="01" title="Movement" description="What kind of movement, and between which locations.">
            <div className="form-grid form-grid-two">
              <Form.Item name="TxnType" label={fieldLabel("Transaction Type")} rules={[{ required: true }]}>
                <Select options={Object.entries(STOCK_TXN_TYPES).map(([k, v]) => ({ value: k, label: v.label }))} onChange={() => form.setFieldsValue({ From: undefined, To: undefined })} />
              </Form.Item>
              <Form.Item name="TxnDate" label={fieldLabel("Date")} rules={[{ required: true, message: "Date is required" }]}><SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} /></Form.Item>
              {rule?.from && <Form.Item name="From" label={fieldLabel("From Location")} rules={[{ required: true, message: "Select the source" }]}><LocationSelect /></Form.Item>}
              {rule?.to && <Form.Item name="To" label={fieldLabel(txnType === "Return-Damaged" ? "Faulty-parts Store" : "To Location")} rules={[{ required: true, message: "Select the destination" }]}><LocationSelect damaged={txnType === "Return-Damaged"} /></Form.Item>}
            </div>
          </FormSection>
          <FormSection number="02" title="Item" description="Spare, quantity and rate (defaults to the current master rate).">
            <div className="form-grid form-grid-two">
              <div className="entry-field-wide"><Form.Item name="SpareId" label={fieldLabel("Spare")} rules={[{ required: true, message: "Select the spare" }]}>
                <Select showSearch optionFilterProp="label" placeholder="Select spare" options={spares.map((s: any) => ({ value: s.SpareId, label: `${s.SpareCode} — ${s.SpareName}` }))}
                  onChange={(id) => { const s = spares.find((x: any) => x.SpareId === id); if (s) form.setFieldValue("Rate", Number(s.CurrentRate)); }} />
              </Form.Item></div>
              <Form.Item name="Qty" label={fieldLabel("Quantity")} rules={[{ required: true, message: "Quantity is required" }]}><InputNumber min={1} precision={0} className="w-full" /></Form.Item>
              <Form.Item name="Rate" label={fieldLabel("Rate ₹")}><InputNumber min={0} precision={2} className="w-full" /></Form.Item>
              <div className="entry-field-wide"><Form.Item name="Remarks" label={fieldLabel("Remarks / Reference")} rules={[{ max: 300 }]}><Input placeholder="e.g. GRN 1452 from factory" /></Form.Item></div>
            </div>
          </FormSection>
        </Form>
      </Drawer>

      <ConfirmModal open={!!deleting} title="Delete Stock Entry" description={`Delete this ${deleting?.TxnType} of ${deleting?.Qty} × ${deleting?.SpareName}?`} warningText="Not allowed if the stock has already been used or moved on." onCancel={() => setDeleting(null)}
        onConfirm={async () => { try { await deleteTxn(deleting!.StockTxnId); message.success("Stock entry deleted"); setDeleting(null); } catch (err) { reportFormError(err, { fallback: "Could not delete stock entry" }); } }} />
    </div>
  );
}
