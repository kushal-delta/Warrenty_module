"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import { Alert, AutoComplete, Button, Drawer, Form, Input, InputNumber, Modal, Select, Space, Spin, Table, Tag, Tooltip, message } from "antd";
import { DeleteOutlined, DownloadOutlined, EditOutlined, PrinterOutlined, ReloadOutlined, SafetyCertificateOutlined, SearchOutlined, ToolOutlined } from "@ant-design/icons";
import { useWarrantyStore, Warranty } from "@/lib/store/useWarrantyStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { canUseForm } from "@/lib/auth/forms";
import { PageHeader, StatStrip, TABLE_CARD, fieldLabel } from "@/components/common/PageHeader";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { FormSection } from "@/components/common/FormSection";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { ServiceCallFormDrawer } from "@/components/service/ServiceCallFormDrawer";
import { WarrantyCard, printCard } from "@/components/warranty/WarrantyCard";
import { districtOptions } from "@/lib/utils/selectOptions";
import { reportFormError } from "@/lib/utils/formErrors";

type WStatus = { key: "active" | "expiring" | "expired" | "replaced" | "void"; text: string; color: string; days: number };
/** Same buckets as the prototype: Replaced / Void from the record, else Expired, Expiring (≤ 45 days) or Active. */
function wStatus(w: Warranty): WStatus {
  const days = dayjs(w.EndDate).startOf("day").diff(dayjs().startOf("day"), "day");
  if (w.Status === "Replaced") return { key: "replaced", text: "Replaced", color: "default", days };
  if (w.Status === "Void") return { key: "void", text: "Void", color: "default", days };
  if (days < 0) return { key: "expired", text: "Expired", color: "red", days };
  if (days <= 45) return { key: "expiring", text: "Expiring", color: "orange", days };
  return { key: "active", text: "Active", color: "green", days };
}
const CAT_COLOR: Record<string, string> = { PUMP: "blue", MOTOR: "cyan", CONTROLLER: "purple" };
const dmy = (v?: string | null) => (v ? dayjs(v).format("DD-MMM-YYYY") : "—");

export default function ActiveWarrantiesPage() {
  const router = useRouter();
  const [form] = Form.useForm();
  const { warranties, fetchWarranties, isLoading, dealers, fetchDealers } = useWarrantyStore();
  const { states, districts, company } = useMasterStore();
  const user = useAuthStore((s) => s.user);
  const role = user?.Role;
  const isHo = Boolean(user?.IsAdmin) || role === "SUPER" || role === "HO";
  const canEdit = isHo || role === "DEALER";
  const canBookCall = role !== "CUSTOMER" && canUseForm(user as any, "service.complaints");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>();
  const [categoryFilter, setCategoryFilter] = useState<string>();
  const [stateFilter, setStateFilter] = useState<string>();
  const [dealerFilter, setDealerFilter] = useState<string>();

  const [card, setCard] = useState<{ installation: any; warranties: any[]; qr?: string } | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [callPreset, setCallPreset] = useState<{ serialNo: string; category?: string; mobile?: string } | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [deleting, setDeleting] = useState<Warranty | null>(null);
  const editState = Form.useWatch("StateId", form);

  const load = () => fetchWarranties({ limit: 20000 }).catch(() => undefined);
  useEffect(() => { load(); if (canEdit && role !== "DEALER") fetchDealers().catch(() => undefined); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => warranties.map((w) => ({ ...w, s: wStatus(w) })), [warranties]);
  const filtered = rows.filter((w) => {
    const q = search.toLowerCase();
    return (!q || [w.SerialNo, w.WarrantyNo, w.CustomerName, w.CustomerMobile, w.InstallNo, w.District, w.DealerName].some((v) => v?.toLowerCase().includes(q)))
      && (!statusFilter || w.s.text === statusFilter) && (!categoryFilter || w.Category === categoryFilter)
      && (!stateFilter || w.StateName === stateFilter) && (!dealerFilter || (w.DealerName || "Direct") === dealerFilter);
  });
  const count = (k: WStatus["key"]) => rows.filter((r) => r.s.key === k).length;
  const opts = (values: (string | undefined)[]) => Array.from(new Set(values.filter(Boolean) as string[])).sort().map((v) => ({ value: v, label: v }));

  /* ---------- actions ---------- */
  const openCard = async (w: Warranty) => {
    setCardLoading(true);
    setCard({ installation: null, warranties: [] });
    try {
      const { data } = await axios.post("/api/warranty/warranties/card", { InstallationId: w.InstallationId });
      const qr = await QRCode.toDataURL(`${window.location.origin}/warranty/search?sn=${encodeURIComponent(data.warranties[0]?.SerialNo || w.SerialNo)}`, { width: 180, margin: 1 }).catch(() => undefined);
      setCard({ installation: data.installation, warranties: data.warranties, qr });
    } catch (err) {
      setCard(null);
      reportFormError(err, { fallback: "Could not load the warranty card" });
    } finally {
      setCardLoading(false);
    }
  };

  const openEdit = async (w: Warranty) => {
    setEditing({ WarrantyId: w.WarrantyId, SerialNo: w.SerialNo });
    form.resetFields();
    setEditLoading(true);
    try {
      const { data } = await axios.post("/api/warranty/warranties/detail", { WarrantyId: w.WarrantyId });
      const d = data.warranty;
      setEditing(d);
      form.setFieldsValue({
        SerialNo: d.SerialNo, Model: d.ModelName, CustomerName: d.CustomerName, Mobile: d.CustomerMobile, Address: d.SiteAddress, Village: d.Village,
        StateId: d.StateId, District: d.District, Pincode: d.Pincode, DealerId: d.DealerId || undefined,
        StartDate: d.StartDate ? dayjs(d.StartDate) : undefined, WarrantyMonths: d.WarrantyMonths, ExtendedMonths: d.ExtendedMonths || 0, Status: d.Status, Remarks: d.Remarks,
      });
    } catch (err) {
      setEditing(null);
      reportFormError(err, { fallback: "Could not load the warranty" });
    } finally {
      setEditLoading(false);
    }
  };

  const saveEdit = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const { data } = await axios.post("/api/warranty/warranties/update", { ...v, WarrantyId: editing.WarrantyId, StartDate: v.StartDate ? v.StartDate.toISOString() : null });
      message.success(`Warranty updated — valid till ${dmy(data.warranty.EndDate)}`);
      setEditing(null);
      load();
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not update the warranty" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      const { data } = await axios.post("/api/warranty/warranties/delete", { WarrantyId: deleting.WarrantyId });
      message.success(`Warranty ${data.WarrantyNo} deleted — serial ${data.SerialNo} can be registered again${data.installationRemoved ? " (installation removed)" : ""}`);
      setDeleting(null);
      setEditing(null);
      load();
    } catch (err) {
      reportFormError(err, { fallback: "Could not delete the warranty" });
    }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map((w) => ({
      "Warranty No": w.WarrantyNo, "Serial No": w.SerialNo, Component: w.Category, Model: w.ModelName || "", Customer: w.CustomerName || "", Mobile: w.CustomerMobile || "",
      Place: [w.District, w.StateShort || w.StateName].filter(Boolean).join(", "), Dealer: w.DealerName || "Direct", Registered: dmy(w.RegisteredOn), "Registered By": w.RegisteredBy || "",
      "Valid From": dmy(w.StartDate), "Valid Till": dmy(w.EndDate), "Balance (days)": w.s.key === "active" || w.s.key === "expiring" ? w.s.days : "", Status: w.s.text,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Warranties");
    XLSX.writeFile(wb, `Active_Warranty_List_${dayjs().format("YYYYMMDD")}.xlsx`);
  };

  /* ---------- table ---------- */
  const columns = [
    { title: "Warranty No", dataIndex: "WarrantyNo", key: "no", width: 150, sorter: (a: any, b: any) => String(a.WarrantyNo).localeCompare(String(b.WarrantyNo)), render: (v: string) => <span className="font-medium text-slate-700">{v}</span> },
    { title: "Serial No", dataIndex: "SerialNo", key: "sn", width: 130, render: (v: string) => <Link href={`/warranty/search?sn=${encodeURIComponent(v)}`} className="font-mono font-bold text-teal-700">{v}</Link> },
    { title: "Component", dataIndex: "Category", key: "cat", width: 110, render: (c: string) => <Tag color={CAT_COLOR[c]}>{c}</Tag> },
    { title: "Model", dataIndex: "ModelName", key: "model", render: (v: string) => v || "—" },
    { title: "Customer", key: "cust", render: (_: any, w: any) => <div><b className="text-slate-800">{w.CustomerName || "—"}</b><div className="text-[11px] text-slate-400">{w.CustomerMobile}</div></div> },
    { title: "Place", key: "place", render: (_: any, w: any) => [w.District, w.StateShort || w.StateName].filter(Boolean).join(", ") || "—" },
    { title: "Dealer", dataIndex: "DealerName", key: "dealer", render: (v: string) => v || "Direct" },
    { title: "Registered", key: "reg", width: 120, sorter: (a: any, b: any) => dayjs(a.RegisteredOn).valueOf() - dayjs(b.RegisteredOn).valueOf(), render: (_: any, w: any) => <div>{dmy(w.RegisteredOn)}<div className="text-[11px] text-slate-400">{w.RegisteredBy ? `by ${w.RegisteredBy}` : ""}</div></div> },
    { title: "Valid till", dataIndex: "EndDate", key: "end", width: 115, defaultSortOrder: "descend" as const, sorter: (a: any, b: any) => dayjs(a.EndDate).valueOf() - dayjs(b.EndDate).valueOf(), render: (v: string) => dmy(v) },
    { title: "Balance", key: "bal", width: 90, align: "right" as const, sorter: (a: any, b: any) => a.s.days - b.s.days, render: (_: any, w: any) => w.s.key === "active" || w.s.key === "expiring" ? `${w.s.days} d` : "—" },
    { title: "Status", key: "status", width: 100, render: (_: any, w: any) => <Tag color={w.s.color}>{w.s.text}</Tag> },
    { title: "Actions", key: "actions", width: 175, fixed: "right" as const, render: (_: any, w: any) => (
      <Space size={2}>
        <Tooltip title="Serial search report"><Button type="text" size="small" icon={<SearchOutlined />} onClick={() => router.push(`/warranty/search?sn=${encodeURIComponent(w.SerialNo)}`)} /></Tooltip>
        <Tooltip title="Digital warranty card"><Button type="text" size="small" icon={<PrinterOutlined />} onClick={() => openCard(w)} /></Tooltip>
        {canBookCall && w.s.key !== "replaced" && <Tooltip title="Book service call"><Button type="text" size="small" icon={<ToolOutlined />} onClick={() => setCallPreset({ serialNo: w.SerialNo, category: w.Category, mobile: w.CustomerMobile })} /></Tooltip>}
        {canEdit && <Tooltip title="Edit warranty"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(w)} /></Tooltip>}
        {canEdit && <Tooltip title="Delete warranty"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleting(w)} /></Tooltip>}
      </Space>
    ) },
  ];

  const replaced = editing?.Status === "Replaced";

  return (
    <div className="space-y-4">
      <PageHeader icon={<SafetyCertificateOutlined />} title={role === "CUSTOMER" ? "My Warranty" : "Active Warranty List"} subtitle={`${rows.length} component warranties · pump, motor and controller each carry their own period`}
        actions={<>
          {role !== "CUSTOMER" && <Button icon={<SafetyCertificateOutlined />} onClick={() => router.push("/warranty/register")}>Register Warranty</Button>}
          <Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={!filtered.length}>Export Excel</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={isLoading}>Refresh</Button>
        </>} />

      <StatStrip items={[
        { label: "Active", value: count("active"), tone: "ok" },
        { label: "Expiring ≤ 45 days", value: count("expiring"), tone: "warn" },
        { label: "Expired", value: count("expired"), tone: "danger" },
        { label: "Replaced", value: count("replaced") },
        { label: "Installations", value: new Set(rows.map((r) => r.InstallationId)).size },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search serial, customer, mobile, warranty no…" value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select allowClear placeholder="Status: All" value={statusFilter} onChange={setStatusFilter} className="w-36" options={["Active", "Expiring", "Expired", "Replaced", "Void"].map((s) => ({ value: s, label: s }))} />
        <Select allowClear placeholder="Category: All" value={categoryFilter} onChange={setCategoryFilter} className="w-40" options={["PUMP", "MOTOR", "CONTROLLER"].map((c) => ({ value: c, label: c[0] + c.slice(1).toLowerCase() }))} />
        <Select allowClear showSearch placeholder="State: All" value={stateFilter} onChange={setStateFilter} className="w-44" options={opts(rows.map((r) => r.StateName))} />
        {role !== "DEALER" && <Select allowClear showSearch placeholder="Dealer: All" value={dealerFilter} onChange={setDealerFilter} className="w-52" options={opts(rows.map((r) => r.DealerName || "Direct"))} />}
        <span className="ml-auto text-xs text-slate-400">{filtered.length} records</span>
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="WarrantyId" size="middle" loading={isLoading} scroll={{ x: 1450 }}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: ["20", "50", "100"], showTotal: (t, r) => `Showing ${r[0]}-${r[1]} of ${t} warranties` }} />
      </div>

      {/* Digital warranty card */}
      <Modal open={!!card} onCancel={() => setCard(null)} width={900} centered title={<span className="flex items-center gap-2"><SafetyCertificateOutlined className="text-teal-600" />Digital Warranty Card{card?.installation?.InstallNo ? ` · ${card.installation.InstallNo}` : ""}</span>}
        footer={[<Button key="c" onClick={() => setCard(null)}>Close</Button>, <Button key="p" type="primary" icon={<PrinterOutlined />} disabled={cardLoading} onClick={() => printCard(cardRef.current, `Warranty card ${card?.installation?.InstallNo || ""}`)}>Print</Button>]}>
        <Spin spinning={cardLoading}>
          <div className="max-h-[70vh] overflow-auto py-2">{card?.installation && <WarrantyCard ref={cardRef} company={company} installation={card.installation} warranties={card.warranties} qr={card.qr} />}</div>
        </Spin>
      </Modal>

      {/* Book service call (pre-filled with this serial and customer) */}
      <ServiceCallFormDrawer open={!!callPreset} preset={callPreset} onClose={() => setCallPreset(null)} onSaved={(no) => { setCallPreset(null); message.success(`Service call ${no} booked`); }} />

      {/* Edit warranty */}
      <Drawer rootClassName="entry-drawer" open={!!editing} onClose={() => setEditing(null)} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
        title={<DrawerHeader icon={<EditOutlined />} title={`Edit warranty — ${editing?.SerialNo || ""}`} subtitle="Customer & site, dealer and warranty period"
          meta={<>{editing?.WarrantyNo && <DrawerChip label={editing.WarrantyNo} tone="outline" />}<DrawerChip label="Edit" tone="solid" /></>} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={() => setEditing(null)} />}
        footer={<div className="flex items-center justify-between py-2">
          <Button danger icon={<DeleteOutlined />} disabled={editLoading || saving} onClick={() => editing && setDeleting(editing)}>Delete</Button>
          <Space><Button onClick={() => setEditing(null)} disabled={saving}>Cancel</Button><Button type="primary" onClick={saveEdit} loading={saving} disabled={editLoading} className="bg-blue-600">Update</Button></Space>
        </div>}>
        <Spin spinning={editLoading}>
          <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
            {editing?.EndDate && <Alert type="info" showIcon className="mb-4" message={<>Valid till <b>{dmy(editing.EndDate)}</b> ({wStatus(editing).text.toLowerCase()}). Changing the start date or period recalculates the end date.</>} />}
            <FormSection number="01" title="Product" description="Read only.">
              <div className="form-grid form-grid-three">
                <Form.Item name="SerialNo" label={fieldLabel("Serial number")}><Input disabled className="font-mono" /></Form.Item>
                <div className="entry-field-wide"><Form.Item name="Model" label={fieldLabel("Model")}><Input disabled /></Form.Item></div>
              </div>
            </FormSection>
            <FormSection number="02" title="Customer & site" description="Updates the customer and the installation site.">
              <div className="form-grid form-grid-three">
                <Form.Item name="CustomerName" label={fieldLabel("Customer name")} rules={[{ required: true, message: "Customer name is required" }, { max: 120 }]}><Input /></Form.Item>
                <Form.Item name="Mobile" label={fieldLabel("Mobile")} rules={[{ required: true, message: "Mobile is required" }, { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit mobile number" }]}><Input maxLength={10} /></Form.Item>
                <Form.Item name="Village" label={fieldLabel("Village / area")} rules={[{ max: 100 }]}><Input /></Form.Item>
                <div className="entry-field-wide"><Form.Item name="Address" label={fieldLabel("Address")} rules={[{ max: 300 }]}><Input /></Form.Item></div>
                <Form.Item name="StateId" label={fieldLabel("State")} rules={[{ required: true, message: "State is required" }]}><Select showSearch optionFilterProp="label" options={states.map((s: any) => ({ value: s.StateId, label: s.StateName }))} onChange={() => form.setFieldValue("District", undefined)} /></Form.Item>
                <Form.Item name="District" label={fieldLabel("District")} rules={[{ required: true, message: "District is required" }, { max: 80 }]}><AutoComplete options={districtOptions(districts, editState)} filterOption={(input, o) => String(o?.value || "").toLowerCase().includes(input.toLowerCase())} /></Form.Item>
                <Form.Item name="Pincode" label={fieldLabel("Pincode")} rules={[{ pattern: /^\d{6}$/, message: "Pincode must be 6 digits" }]}><Input maxLength={6} /></Form.Item>
                <Form.Item name="DealerId" label={fieldLabel("Dealer")} extra={role === "DEALER" ? "Your own dealer account" : "Blank = direct sale"}>
                  <Select allowClear showSearch optionFilterProp="label" disabled={role === "DEALER"} placeholder="Direct"
                    options={(role === "DEALER" && editing?.DealerId ? [{ DealerId: editing.DealerId, FirmName: editing.DealerName, DealerCode: editing.DealerCode, Status: "Approved" }] : dealers)
                      .filter((d: any) => d.Status === "Approved" || d.DealerId === editing?.DealerId).map((d: any) => ({ value: d.DealerId, label: `${d.FirmName}${d.DealerCode ? ` (${d.DealerCode})` : ""}` }))} />
                </Form.Item>
              </div>
            </FormSection>
            <FormSection number="03" title="Warranty" description={isHo ? "Warranty period change scope — head office only." : "Only the head office can change the period and status."}>
              <div className="form-grid form-grid-three">
                <Form.Item name="StartDate" label={fieldLabel("Warranty start date")} rules={[{ required: true, message: "Start date is required" }]}><SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} /></Form.Item>
                <Form.Item name="WarrantyMonths" label={fieldLabel("Warranty period (months)")} rules={[{ required: true, message: "Period is required" }]}><InputNumber min={1} max={120} precision={0} className="w-full" disabled={!isHo} /></Form.Item>
                <Form.Item name="ExtendedMonths" label={fieldLabel("Extended months")}><InputNumber min={0} max={60} precision={0} className="w-full" disabled={!isHo} /></Form.Item>
                <Form.Item name="Status" label={fieldLabel("Warranty status")} extra={replaced ? "Set automatically by a replacement — delete the replacement to undo" : undefined}>
                  <Select disabled={!isHo || replaced} options={(replaced ? ["Replaced"] : ["Active", "Void"]).map((s) => ({ value: s, label: s }))} />
                </Form.Item>
                <div className="entry-field-wide"><Form.Item name="Remarks" label={fieldLabel("Remarks")} rules={[{ max: 300 }]}><Input.TextArea rows={2} maxLength={300} /></Form.Item></div>
              </div>
            </FormSection>
          </Form>
        </Spin>
      </Drawer>

      <ConfirmModal open={!!deleting} title="Delete warranty" description={`Delete warranty ${deleting?.WarrantyNo || ""} of serial ${deleting?.SerialNo || ""}?`}
        warningText="Use this only for a wrong registration. The sticker becomes free to register again. Not allowed when the serial has service calls (set the status to Void instead) or was moved by a replacement."
        onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />
    </div>
  );
}
