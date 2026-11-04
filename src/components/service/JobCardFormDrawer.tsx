"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Drawer, Empty, Form, Image, Input, InputNumber, Select, Spin, Table, Tag, Tooltip, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { CameraOutlined, DeleteOutlined, DownloadOutlined, SendOutlined, SaveOutlined, ToolOutlined, UploadOutlined, UndoOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { useJobCardStore } from "@/lib/store/useJobCardStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useServiceStore } from "@/lib/store/useServiceStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { FormSection } from "@/components/common/FormSection";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { fieldLabel, inr } from "@/components/common/PageHeader";
import { MAX_JOBCARD_PHOTOS } from "@/lib/config/service";
import { reportFormError } from "@/lib/utils/formErrors";
import { VideoAttachments, type VideoItem } from "@/components/common/VideoAttachments";

interface Props {
  open: boolean;
  jobCardId?: string | null;
  complaintId?: string | null;
  onClose: () => void;
  onSaved: (jobCardId: string) => void;
}

/** One estimate line — a spare (moves stock on approval) or a labour / service charge. */
interface Line { key: string; ItemType: "Spare" | "Labour"; ItemId: string; Code: string; Name: string; Category?: string; SerialNo: string; Qty: number; Rate: number; GstPct: number; IsWarranty: boolean; Remarks?: string }
interface FaultLine { key: string; FaultMasterId: string; Category: string; FaultName: string; Remarks: string }
interface CallComponent { Category: string; SerialNo: string | null; ModelName?: string; ReportedFault?: string; Warranty?: { State: string; Label: string; EndDate?: string } | null }

const round2 = (n: number) => Math.round(n * 100) / 100;
const uid = () => Math.random().toString(36).slice(2);
const WARRANTY_TAG: Record<string, string> = { in: "green", out: "red", unreg: "default", unk: "red" };
const TEMPLATE_HEADERS = ["Type", "Code", "Qty", "Rate", "GST %", "Warranty (Y/N)", "Serial No", "Remarks"];

/** Shrinks a photo to ≤1600px JPEG before upload. */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error(`${file.name} is not an image`));
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** Create / edit a job card (repair estimate) — same sections as the prototype "New Job Card (Estimate)" screen. */
export function JobCardFormDrawer({ open, jobCardId, complaintId, onClose, onSaved }: Props) {
  const [form] = Form.useForm();
  const { fetchJobCardDetail, saveJobCard } = useJobCardStore();
  const { spares, faultMasters, labourMasters, serviceCenters, engineers, approvalRules } = useMasterStore();
  const { complaints, fetchComplaints } = useServiceStore();
  const user = useAuthStore((s) => s.user);
  const isEngineer = user?.Role === "ENGINEER";

  const [maximized, setMaximized] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [status, setStatus] = useState("Draft");
  const [jobCardNo, setJobCardNo] = useState<string>();
  const [lines, setLines] = useState<Line[]>([]);
  const [faults, setFaults] = useState<FaultLine[]>([]);
  const [otherCharges, setOtherCharges] = useState(0);
  const [components, setComponents] = useState<CallComponent[]>([]);
  const [callWarranty, setCallWarranty] = useState<string | null>(null);
  const [photos, setPhotos] = useState<UploadFile[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<any[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoUploading, setVideoUploading] = useState(false);
  const [stock, setStock] = useState<Record<string, number>>({});
  const importInput = useRef<HTMLInputElement>(null);

  const selectedCallId = Form.useWatch("ComplaintId", form);
  const serviceCenterId = Form.useWatch("ServiceCenterId", form);
  const engineerUserId = Form.useWatch("EngineerUserId", form);

  // ---------- load ----------
  useEffect(() => {
    if (!open) return;
    fetchComplaints({ limit: 1000 }).catch(() => undefined);
    axios.post("/api/stock/balance", {}).then((res) => {
      const map: Record<string, number> = {};
      (res.data.stock || []).forEach((r: any) => { map[`${r.LocType}|${String(r.LocId).toLowerCase()}|${String(r.SpareId).toLowerCase()}`] = Number(r.Good || 0); });
      setStock(map);
    }).catch(() => setStock({}));
    form.resetFields();
    setStatus("Draft"); setJobCardNo(undefined); setLines([]); setFaults([]); setOtherCharges(0); setComponents([]); setCallWarranty(null);
    setPhotos([]); setExistingPhotos([]); setRemovedPhotoIds([]); setVideos([]);
    if (!jobCardId) {
      form.setFieldsValue({ ComplaintId: complaintId || undefined, JobCardDate: dayjs(), EngineerUserId: isEngineer ? user?.UserId : undefined, ServiceCenterId: isEngineer ? user?.ServiceCenterId || undefined : undefined });
      if (complaintId) loadCall(complaintId, true);
      return;
    }
    setLoading(true);
    fetchJobCardDetail(jobCardId)
      .then((d: any) => {
        const j = d.jobCard;
        setStatus(j.Status); setJobCardNo(j.JobCardNo); setOtherCharges(Number(j.OtherCharges || 0));
        form.setFieldsValue({ ComplaintId: j.ComplaintId, JobCardDate: dayjs(j.JobCardDate), ServiceCenterId: j.ServiceCenterId || undefined, EngineerUserId: j.EngineerUserId || undefined, Remarks: j.Remarks });
        setFaults(d.faults.map((f: any) => ({ key: uid(), FaultMasterId: f.FaultMasterId, Category: f.Category, FaultName: f.FaultName, Remarks: f.Remarks || "" })));
        setLines(d.items.map((i: any) => ({
          key: uid(), ItemType: i.ItemType === "Labour" ? "Labour" : "Spare", ItemId: i.ItemType === "Labour" ? i.LabourMasterId : i.SpareId,
          Code: i.ItemCode || "", Name: i.Particulars || "", SerialNo: i.SerialNo || "", Qty: i.Qty, Rate: Number(i.Rate), GstPct: Number(i.GstPct || 0), IsWarranty: Boolean(i.IsWarranty), Remarks: i.Remarks || "",
        })));
        setExistingPhotos(d.photos || []);
        setVideos(d.videos || []);
        setCallWarranty(j.WarrantyStatus || null);
        loadCall(j.ComplaintId, false);
      })
      .catch((err) => reportFormError(err, { fallback: "Could not load job card" }))
      .finally(() => setLoading(false));
  }, [open, jobCardId, complaintId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Call components (serial + current warranty) and, for a new card, the call's centre / engineer. */
  const loadCall = async (id: string, applyDefaults: boolean) => {
    const call = complaints.find((c) => c.ComplaintId === id);
    if (applyDefaults && call) {
      if (call.ServiceCenterId && !form.getFieldValue("ServiceCenterId")) form.setFieldValue("ServiceCenterId", call.ServiceCenterId);
      if (call.EngineerUserId && !isEngineer) form.setFieldValue("EngineerUserId", call.EngineerUserId);
      setCallWarranty(call.WarrantyStatus || null);
    }
    try {
      const d = (await axios.post("/api/service/complaints/detail", { ComplaintId: id })).data;
      setComponents(d.components || []);
      setCallWarranty(d.complaint?.WarrantyStatus || null);
      if (applyDefaults) {
        if (d.complaint?.ServiceCenterId && !form.getFieldValue("ServiceCenterId")) form.setFieldValue("ServiceCenterId", d.complaint.ServiceCenterId);
        if (d.complaint?.EngineerUserId && !isEngineer && !form.getFieldValue("EngineerUserId")) form.setFieldValue("EngineerUserId", d.complaint.EngineerUserId);
      }
    } catch {
      setComponents([]);
    }
  };

  // ---------- lines ----------
  const serialOptions = components.filter((c) => c.SerialNo);
  const defaultSerial = (category?: string) => (serialOptions.find((c) => c.Category === category) || serialOptions[0])?.SerialNo || "";
  const warrantyFor = (serial: string) => {
    const comp = components.find((c) => c.SerialNo === serial);
    if (comp?.Warranty) return comp.Warranty.State === "in";
    return /^(In Warranty|Partial)/.test(callWarranty || "");
  };

  const addItem = (type: "Spare" | "Labour", id?: string, overrides: Partial<Line> = {}) => {
    if (!id) return;
    const master: any = type === "Spare" ? spares.find((s: any) => s.SpareId === id) : labourMasters.find((l: any) => l.LabourMasterId === id);
    if (!master) return;
    const category = type === "Spare" ? master.Category : undefined;
    const serial = overrides.SerialNo ?? (type === "Spare" ? defaultSerial(category) : defaultSerial());
    setLines((ls) => [...ls, {
      key: uid(), ItemType: type, ItemId: id,
      Code: type === "Spare" ? master.SpareCode : master.LabourCode, Name: type === "Spare" ? master.SpareName : master.LabourName, Category: category,
      SerialNo: serial, Qty: 1, Rate: Number(type === "Spare" ? master.CurrentRate : master.StandardRate) || 0,
      GstPct: master.GstPct != null ? Number(master.GstPct) : 18, IsWarranty: warrantyFor(serial), ...overrides,
    }]);
  };
  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const totals = useMemo(() => {
    let spare = 0, labour = 0, gst = 0, warranty = 0;
    lines.forEach((l) => {
      const amount = round2((Number(l.Qty) || 0) * (Number(l.Rate) || 0)), tax = round2((amount * (Number(l.GstPct) || 0)) / 100);
      if (l.ItemType === "Spare") spare += amount; else labour += amount;
      gst += tax;
      if (l.IsWarranty) warranty += amount + tax;
    });
    const grand = round2(spare + labour + gst + (Number(otherCharges) || 0));
    const borne = Math.min(round2(warranty), grand);
    return { spare: round2(spare), labour: round2(labour), gst: round2(gst), grand, borne, payable: Math.max(0, round2(grand - borne)) };
  }, [lines, otherCharges]);

  const approvalRoute = approvalRules.filter((r: any) => r.IsActive && Number(r.MinAmount) <= totals.grand).sort((a: any, b: any) => a.LevelNo - b.LevelNo).map((r: any) => `L${r.LevelNo} ${r.RoleName}`).join(" → ");

  const stockChip = (l: Line) => {
    if (l.ItemType !== "Spare") return null;
    const id = l.ItemId.toLowerCase();
    const eng = engineerUserId ? stock[`ENG|${String(engineerUserId).toLowerCase()}|${id}`] || 0 : 0;
    const store = serviceCenterId ? stock[`SC|${String(serviceCenterId).toLowerCase()}|${id}`] || 0 : 0;
    const ok = eng + store >= (Number(l.Qty) || 0);
    return <div className={`text-[11px] mt-0.5 ${ok ? "text-emerald-600" : "text-red-600"}`}>{ok ? "✓" : "✗"} stock: engineer {eng} · store {store}</div>;
  };

  // ---------- Excel ----------
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ["Spare", spares[0]?.SpareCode || "SPR-IMP-4", 1, "", "", "Y", "", ""], ["Labour", labourMasters[0]?.LabourCode || "LAB-REWIND", 1, "", "", "N", "", "Rewinding"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lines");
    XLSX.writeFile(wb, "JobCard_Lines_Import_Template.xlsx");
  };
  const importLines = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      let added = 0; const errors: string[] = [];
      rows.forEach((r, i) => {
        const type = String(r.Type || "").trim().toLowerCase().startsWith("lab") ? "Labour" : "Spare";
        const code = String(r.Code || "").trim().toLowerCase();
        if (!code) return;
        const master: any = type === "Spare" ? spares.find((s: any) => String(s.SpareCode).toLowerCase() === code) : labourMasters.find((l: any) => String(l.LabourCode).toLowerCase() === code);
        if (!master) { errors.push(`row ${i + 2}: ${type.toLowerCase()} code "${r.Code}" not found`); return; }
        const overrides: Partial<Line> = { Qty: Math.max(1, Math.round(Number(r.Qty) || 1)) };
        if (r.Rate !== "") overrides.Rate = Number(r.Rate) || 0;
        if (r["GST %"] !== "") overrides.GstPct = Number(r["GST %"]) || 0;
        if (String(r["Serial No"] || "").trim()) overrides.SerialNo = String(r["Serial No"]).trim().toUpperCase();
        if (String(r["Warranty (Y/N)"] || "").trim()) overrides.IsWarranty = /^y/i.test(String(r["Warranty (Y/N)"]));
        if (r.Remarks) overrides.Remarks = String(r.Remarks);
        addItem(type, type === "Spare" ? master.SpareId : master.LabourMasterId, overrides);
        added++;
      });
      if (added) message.success(`${added} line${added > 1 ? "s" : ""} imported`);
      if (errors.length) message.warning(`Skipped ${errors.length}: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}`, 6);
      if (!added && !errors.length) message.info("No lines found in the file");
    } catch {
      message.error("Could not read the Excel file — use the template");
    }
  };

  // ---------- save ----------
  const save = async (submit: boolean) => {
    try {
      const values = await form.validateFields();
      const keptPhotos = existingPhotos.filter((p) => !removedPhotoIds.includes(p.AttachmentId)).length;
      if (keptPhotos + photos.length < 1) { message.error("Attach at least one photo of the fault / site"); return; }
      if (keptPhotos + photos.length > MAX_JOBCARD_PHOTOS) { message.error(`A job card can have at most ${MAX_JOBCARD_PHOTOS} photos`); return; }
      if (videoUploading) { message.warning("Wait for the video upload to finish"); return; }
      setSaving(submit ? "submit" : "draft");
      const photoData = await Promise.all(photos.map(async (f) => ({ fileName: f.name, dataUrl: await compressImage(f.originFileObj as File) })));
      const result = await saveJobCard({
        JobCardId: jobCardId || undefined,
        ComplaintId: values.ComplaintId,
        JobCardDate: values.JobCardDate.toISOString(),
        ServiceCenterId: values.ServiceCenterId,
        EngineerUserId: values.EngineerUserId || null,
        Remarks: values.Remarks,
        OtherCharges: Number(otherCharges) || 0,
        faults: faults.map((f) => ({ FaultMasterId: f.FaultMasterId, Remarks: f.Remarks })),
        lines: lines.map((l) => ({ ItemType: l.ItemType, SpareId: l.ItemType === "Spare" ? l.ItemId : null, LabourMasterId: l.ItemType === "Labour" ? l.ItemId : null, SerialNo: l.SerialNo || null, Qty: l.Qty, Rate: l.Rate, GstPct: l.GstPct, IsWarranty: l.IsWarranty, Remarks: l.Remarks || null })),
        photos: photoData,
        removePhotoIds: removedPhotoIds,
        videoIds: videos.map((v) => v.AttachmentId),
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

  const openCalls = complaints.filter((c) => !["Closed", "Cancelled", "Resolved", "In Approval"].includes(c.Status) || c.ComplaintId === selectedCallId)
    .filter((c) => !isEngineer || c.EngineerUserId === user?.UserId);
  const faultOptions = Object.entries(faultMasters.filter((f: any) => f.IsActive).reduce<Record<string, any[]>>((groups, f: any) => { (groups[f.Category] ||= []).push(f); return groups; }, {}))
    .map(([category, list]) => ({ label: category, options: list.map((f: any) => ({ value: f.FaultMasterId, label: `${f.FaultName}` })) }));
  const engineerOptions = engineers.filter((e: any) => !serviceCenterId || !e.ServiceCenterId || e.ServiceCenterId === serviceCenterId);
  const photoCount = existingPhotos.filter((p) => !removedPhotoIds.includes(p.AttachmentId)).length + photos.length;

  return (
    <Drawer rootClassName="entry-drawer" open={open} onClose={onClose} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
      title={<DrawerHeader icon={<ToolOutlined />} title={jobCardNo ? `Edit Job Card — ${jobCardNo}` : "New Job Card (Estimate)"} subtitle="Spares and labour needed for the repair — warranty lines are borne by the company, the rest is charged to the customer" meta={<DrawerChip label={status} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={onClose} />}
      footer={<div className="flex flex-wrap items-center justify-between gap-2 py-2">
        <div className="text-xs text-slate-500">Grand total <b className="text-slate-900">₹ {inr(totals.grand, 2)}</b> · Company <b className="text-emerald-700">₹ {inr(totals.borne, 2)}</b> · Customer pays <b className="text-blue-700">₹ {inr(totals.payable, 2)}</b></div>
        <div className="flex gap-2">
          <Button onClick={onClose} disabled={!!saving}>Cancel</Button>
          {status !== "In Approval" && <Button icon={<SaveOutlined />} onClick={() => save(false)} loading={saving === "draft"} disabled={!!saving}>Save draft</Button>}
          <Button type="primary" icon={<SendOutlined />} onClick={() => save(true)} loading={saving === "submit"} disabled={!!saving} className="bg-teal-600">{status === "In Approval" ? "Save & restart approval" : "Save & send for approval"}</Button>
        </div>
      </div>}
    >
      <Spin spinning={loading}>
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form !max-w-none">
          <FormSection number="01" title="Job card header" description="The call, where the repair is done and who does it.">
            <div className="form-grid form-grid-three">
              <div className="entry-field-wide"><Form.Item name="ComplaintId" label={fieldLabel("Service Call")} rules={[{ required: true, message: "Select the service call" }]}>
                <Select showSearch optionFilterProp="label" placeholder="— select a call —" disabled={!!jobCardId}
                  onChange={(id) => { setLines([]); setComponents([]); loadCall(id, true); }}
                  options={openCalls.map((c) => ({ value: c.ComplaintId, label: `${c.ComplaintNo} — ${c.CustomerName} (${c.Village || c.District || ""})${c.WarrantyStatus ? ` · ${c.WarrantyStatus}` : ""}` }))} />
              </Form.Item></div>
              <Form.Item name="JobCardDate" label={fieldLabel("Job Card Date")} rules={[{ required: true, message: "Date is required" }]}><SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} /></Form.Item>
              <Form.Item name="ServiceCenterId" label={fieldLabel("Service Center")} rules={[{ required: true, message: "Select the service center" }]}>
                <Select placeholder="— select —" options={serviceCenters.filter((s: any) => s.IsActive || s.ServiceCenterId === serviceCenterId).map((s: any) => ({ value: s.ServiceCenterId, label: s.ServiceCenterName }))}
                  onChange={() => { const eng = engineers.find((e: any) => e.UserId === form.getFieldValue("EngineerUserId")); if (!isEngineer && eng?.ServiceCenterId && eng.ServiceCenterId !== form.getFieldValue("ServiceCenterId")) form.setFieldValue("EngineerUserId", undefined); }} />
              </Form.Item>
              <Form.Item name="EngineerUserId" label={fieldLabel("Engineer")}>
                <Select allowClear disabled={isEngineer} placeholder="— unassigned —" options={(isEngineer && user ? [{ UserId: user.UserId, FirstName: user.FirstName, LastName: user.LastName }] : engineerOptions).map((e: any) => ({ value: e.UserId, label: `${e.FirstName} ${e.LastName || ""}`.trim() }))} />
              </Form.Item>
              <div className="entry-field-wide"><Form.Item name="Remarks" label={fieldLabel("Notes / Remarks")}><Input placeholder="e.g. Motor rewinding needed; customer informed of charges" /></Form.Item></div>
            </div>
            {components.length > 0 && (
              <div className="pb-5">
                <div className="text-xs font-semibold text-slate-500 mb-1.5">Components on this call</div>
                <Table size="small" rowKey={(r: any, i) => `${r.SerialNo || r.Category}-${i}`} dataSource={components} pagination={false} scroll={{ x: 600 }} columns={[
                  { title: "Component", dataIndex: "Category" },
                  { title: "Serial", dataIndex: "SerialNo", render: (v: string) => v ? <span className="font-mono">{v}</span> : "—" },
                  { title: "Model", dataIndex: "ModelName", render: (v: string) => v || "—" },
                  { title: "Warranty", dataIndex: "Warranty", render: (w: any) => w ? <Tag color={WARRANTY_TAG[w.State]}>{w.Label}</Tag> : "—" },
                  { title: "Valid till", key: "end", render: (_: any, r: any) => r.Warranty?.EndDate ? dayjs(r.Warranty.EndDate).format("DD-MMM-YYYY") : "—" },
                  { title: "Fault reported", dataIndex: "ReportedFault", render: (v: string) => v || "—" },
                ]} />
              </div>
            )}
          </FormSection>
        </Form>

        <section className="entry-section">
          <div className="entry-section-heading justify-between flex-wrap">
            <div className="flex items-start gap-3"><span className="entry-section-number">02</span><div><h3>Fault details</h3><p>What was found.</p></div></div>
            <Select className="w-72" value={null as any} placeholder="+ Add fault…" showSearch optionFilterProp="label" options={faultOptions}
              onChange={(id: string) => { const f: any = faultMasters.find((x: any) => x.FaultMasterId === id); if (f && !faults.some((x) => x.FaultMasterId === id)) setFaults((fs) => [...fs, { key: uid(), FaultMasterId: id, Category: f.Category, FaultName: f.FaultName, Remarks: f.DefaultNature || "" }]); }} />
          </div>
          <div className="entry-section-fields !pb-5">
            {!faults.length ? <span className="text-xs text-slate-500">No fault added — pick from “Add fault”.</span> : (
              <Table size="small" rowKey="key" dataSource={faults} pagination={false} columns={[
                { title: "Component", dataIndex: "Category", width: 120, render: (v: string) => <Tag>{v}</Tag> },
                { title: "Fault", dataIndex: "FaultName", width: "30%" },
                { title: "Nature / diagnosis", key: "nature", render: (_: any, f: FaultLine) => <Input size="small" value={f.Remarks} maxLength={250} onChange={(e) => setFaults((fs) => fs.map((x) => (x.key === f.key ? { ...x, Remarks: e.target.value } : x)))} /> },
                { title: "", key: "del", width: 44, render: (_: any, f: FaultLine) => <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setFaults((fs) => fs.filter((x) => x.key !== f.key))} /> },
              ]} />
            )}
          </div>
        </section>

        <section className="entry-section">
          <div className="entry-section-heading justify-between flex-wrap">
            <div className="flex items-start gap-3"><span className="entry-section-number">03</span><div><h3>Spares &amp; labour</h3><p>Tick Warranty when the company bears the line.</p></div></div>
            <div className="flex flex-wrap gap-2">
              <Select className="w-64" value={null as any} placeholder="+ Add spare…" showSearch optionFilterProp="label"
                options={spares.filter((s: any) => s.IsActive).map((s: any) => ({ value: s.SpareId, label: `${s.SpareName} (${s.SpareCode}) — ₹${inr(s.CurrentRate)}` }))} onChange={(id: string) => addItem("Spare", id)} />
              <Select className="w-60" value={null as any} placeholder="+ Add labour…" showSearch optionFilterProp="label"
                options={labourMasters.filter((l: any) => l.IsActive).map((l: any) => ({ value: l.LabourMasterId, label: `${l.LabourName} — ₹${inr(l.StandardRate)}` }))} onChange={(id: string) => addItem("Labour", id)} />
              <Button icon={<UploadOutlined />} onClick={() => importInput.current?.click()}>Import lines (Excel)</Button>
              <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>Template</Button>
              <input ref={importInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importLines(f); e.target.value = ""; }} />
            </div>
          </div>
          <div className="entry-section-fields !p-0">
            {!lines.length ? <div className="py-8 text-center text-sm text-slate-400">No lines yet — add spares and labour using the selectors above, or import from Excel.</div> : (
              <Table size="small" rowKey="key" dataSource={lines} pagination={false} scroll={{ x: 1080 }} columns={[
                { title: "#", key: "n", width: 36, render: (_: any, __: Line, i: number) => i + 1 },
                { title: "Type", dataIndex: "ItemType", width: 80, render: (t: string) => <Tag color={t === "Spare" ? "blue" : "purple"}>{t}</Tag> },
                { title: "Particulars", key: "p", render: (_: any, l: Line) => <div><b className="text-slate-800">{l.Name}</b> <span className="text-[11px] text-slate-400">{l.Code}</span>{stockChip(l)}</div> },
                { title: "Component serial", key: "sn", width: 200, render: (_: any, l: Line) => (
                  <Select size="small" className="w-full" value={l.SerialNo || ""} onChange={(v: string) => updateLine(l.key, { SerialNo: v, IsWarranty: v ? warrantyFor(v) : l.IsWarranty })}
                    options={[{ value: "", label: "— none —" }, ...serialOptions.map((c) => ({ value: c.SerialNo as string, label: `${c.Category} · ${c.SerialNo}` })), ...(l.SerialNo && !serialOptions.some((c) => c.SerialNo === l.SerialNo) ? [{ value: l.SerialNo, label: l.SerialNo }] : [])]} />
                ) },
                { title: "Qty", key: "q", width: 80, render: (_: any, l: Line) => <InputNumber size="small" min={1} precision={0} value={l.Qty} onChange={(v) => updateLine(l.key, { Qty: Number(v) || 1 })} className="w-full" /> },
                { title: "Rate ₹", key: "r", width: 110, render: (_: any, l: Line) => <InputNumber size="small" min={0} precision={2} value={l.Rate} onChange={(v) => updateLine(l.key, { Rate: Number(v) || 0 })} className="w-full" /> },
                { title: "GST %", key: "g", width: 80, render: (_: any, l: Line) => <InputNumber size="small" min={0} max={100} precision={2} value={l.GstPct} onChange={(v) => updateLine(l.key, { GstPct: Number(v) || 0 })} className="w-full" /> },
                { title: "Amount ₹", key: "a", width: 110, align: "right" as const, render: (_: any, l: Line) => { const amt = round2(l.Qty * l.Rate); return <div><b>{inr(amt + round2((amt * l.GstPct) / 100), 2)}</b><div className="text-[10px] text-slate-400">{inr(amt, 2)} + GST</div></div>; } },
                { title: <Tooltip title="Tick when the company bears this line (in warranty)">Warranty</Tooltip>, key: "w", width: 80, align: "center" as const, render: (_: any, l: Line) => <Checkbox checked={l.IsWarranty} onChange={(e) => updateLine(l.key, { IsWarranty: e.target.checked })} /> },
                { title: "", key: "del", width: 44, render: (_: any, l: Line) => <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /> },
              ]} />
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
          <section className="entry-section !mb-0">
            <div className="entry-section-heading"><span className="entry-section-number">04</span><div><h3>Photos &amp; videos <span className="text-red-500">*</span></h3><p>At least one photo of the fault / site is required — up to {MAX_JOBCARD_PHOTOS}, compressed before saving. Videos are optional.</p></div></div>
            <div className="entry-section-fields !pb-5 space-y-3">
              {existingPhotos.length > 0 && (
                <Image.PreviewGroup>
                  <div className="flex flex-wrap gap-3">
                    {existingPhotos.map((p) => {
                      const removed = removedPhotoIds.includes(p.AttachmentId);
                      return (
                        <div key={p.AttachmentId} className={`relative ${removed ? "opacity-40" : ""}`}>
                          <Image src={p.FileUrl} alt={p.FileName} width={104} height={104} className="object-cover rounded-lg border border-slate-200" />
                          <Button size="small" shape="circle" className="!absolute -top-2 -right-2" danger={!removed} icon={removed ? <UndoOutlined /> : <DeleteOutlined />}
                            onClick={() => setRemovedPhotoIds((ids) => (removed ? ids.filter((x) => x !== p.AttachmentId) : [...ids, p.AttachmentId]))} />
                        </div>
                      );
                    })}
                  </div>
                </Image.PreviewGroup>
              )}
              <Upload listType="picture-card" accept="image/*" multiple fileList={photos} beforeUpload={() => false}
                onChange={({ fileList }) => setPhotos(fileList.slice(0, Math.max(0, MAX_JOBCARD_PHOTOS - (existingPhotos.length - removedPhotoIds.length))))}>
                {photoCount < MAX_JOBCARD_PHOTOS && <div className="text-slate-500"><CameraOutlined className="text-lg" /><div className="text-xs mt-1">Add photos</div></div>}
              </Upload>
              <div className={`text-xs ${photoCount ? "text-slate-500" : "text-red-600"}`}>{photoCount ? `${photoCount} photo${photoCount > 1 ? "s" : ""} attached` : "No photo yet — at least one is required"}</div>
              <div className="pt-2 border-t border-slate-100"><div className="text-xs font-semibold text-slate-600 mb-2">Videos</div><VideoAttachments value={videos} onChange={setVideos} onUploadingChange={setVideoUploading} /></div>
            </div>
          </section>

          <section className="entry-section !mb-0">
            <div className="entry-section-heading"><div><h3>Estimate summary</h3></div></div>
            <div className="entry-section-fields !pb-5 space-y-2 text-sm">
              {[["Spares", totals.spare], ["Labour", totals.labour], ["GST", totals.gst]].map(([label, value]) => (
                <div key={label as string} className="flex justify-between text-slate-600"><span>{label}</span><span>{inr(value, 2)}</span></div>
              ))}
              <div className="flex justify-between items-center text-slate-600"><span>Other charges (transport etc.)</span>
                <InputNumber size="small" min={0} precision={2} value={otherCharges} onChange={(v) => setOtherCharges(Number(v) || 0)} className="w-28" /></div>
              <div className="flex justify-between pt-2 border-t border-slate-100 font-bold text-slate-900"><span>Grand total</span><span className="text-base">₹ {inr(totals.grand, 2)}</span></div>
              <div className="flex justify-between text-emerald-700"><span>Borne by company (warranty)</span><span>− {inr(totals.borne, 2)}</span></div>
              <div className="flex justify-between font-bold text-emerald-700"><span>Customer payable</span><span className="text-base">₹ {inr(totals.payable, 2)}</span></div>
              <div className="pt-2 text-[11px] text-slate-400">Approval route for ₹ {inr(totals.grand)}: {approvalRoute || "no approval needed — approved on submit"}</div>
            </div>
          </section>
        </div>
      </Spin>
    </Drawer>
  );
}
