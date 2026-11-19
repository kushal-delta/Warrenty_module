"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, Drawer, Form, Image, Input, InputNumber, Select, Spin, Tag, Tooltip, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { CameraOutlined, DeleteOutlined, DownloadOutlined, SendOutlined, SaveOutlined, ToolOutlined, UploadOutlined, UndoOutlined, AuditOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import { CategoryIcon } from "@/components/warranty/SerialPassport";
import axios from "axios";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import { useJobCardStore } from "@/lib/store/useJobCardStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useServiceStore } from "@/lib/store/useServiceStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { DocNoChip, useNextDocNo } from "@/components/common/DocNoChip";
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
const CAT_COLOR: Record<string, string> = { PUMP: "#2563eb", MOTOR: "#0891b2", CONTROLLER: "#7c3aed" };
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
  const nextDocNo = useNextDocNo("JOBCARD", Boolean(open) && !jobCardId);
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
  /** Which master the "Add line" picker searches: spares or labour. */
  const [addType, setAddType] = useState<"Spare" | "Labour">("Spare");
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

  /**
   * Call components (serial + current warranty) and, for a new card, the call's centre / engineer.
   * `replace` (the user picked another call): the centre and engineer always follow the newly selected call;
   * otherwise only empty fields are filled. Only the latest request may update the form, so switching calls quickly
   * never shows the previous call's data.
   */
  const callRequest = useRef(0);
  const applyCallDefaults = (c: { ServiceCenterId?: string | null; EngineerUserId?: string | null } | undefined, replace: boolean) => {
    if (!c) return;
    if (!isEngineer) {
      if (replace || !form.getFieldValue("ServiceCenterId")) form.setFieldValue("ServiceCenterId", c.ServiceCenterId || undefined);
      if (replace || !form.getFieldValue("EngineerUserId")) form.setFieldValue("EngineerUserId", c.EngineerUserId || undefined);
    } else if (!form.getFieldValue("ServiceCenterId") && c.ServiceCenterId) {
      form.setFieldValue("ServiceCenterId", c.ServiceCenterId);
    }
  };
  const loadCall = async (id: string, applyDefaults: boolean, replace = false) => {
    const request = ++callRequest.current;
    const call = complaints.find((c) => c.ComplaintId === id);
    if (applyDefaults) applyCallDefaults(call, replace);
    if (replace) setCallWarranty(call?.WarrantyStatus || null);
    try {
      const d = (await axios.post("/api/service/complaints/detail", { ComplaintId: id })).data;
      if (request !== callRequest.current) return; // a newer call was selected meanwhile
      setComponents(d.components || []);
      setCallWarranty(d.complaint?.WarrantyStatus || null);
      if (applyDefaults) applyCallDefaults(d.complaint, replace);
    } catch {
      if (request === callRequest.current) setComponents([]);
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

  const availableOf = (spareId: string) => {
    const id = String(spareId).toLowerCase();
    const eng = engineerUserId ? stock[`ENG|${String(engineerUserId).toLowerCase()}|${id}`] || 0 : 0;
    const store = serviceCenterId ? stock[`SC|${String(serviceCenterId).toLowerCase()}|${id}`] || 0 : 0;
    return { eng, store };
  };
  /** Rich picker options: name, code, rate and (spares) stock in hand. Products of the Spares & Products master are left out. */
  const addOptions = addType === "Spare"
    ? spares.filter((s: any) => s.IsActive && (s.ItemType || "SPARE") !== "PRODUCT").map((s: any) => {
        const { eng, store } = availableOf(s.SpareId), added = lines.some((l) => l.ItemType === "Spare" && l.ItemId === s.SpareId);
        return {
          value: s.SpareId, search: `${s.SpareName} ${s.SpareCode} ${s.Category || ""}`,
          label: (
            <div className="jcf-opt">
              <span className="min-w-0 flex-1">
                <span className="jcf-opt-name">{s.SpareName}</span>
                <span className="jcf-opt-meta"><span className="font-mono">{s.SpareCode}</span>{s.Category ? ` · ${s.Category}` : ""}{added ? " · already added" : ""}</span>
              </span>
              <span className={`jcf-opt-stock ${eng + store > 0 ? "is-ok" : "is-low"}`}>{eng + store} in stock</span>
              <b className="jcf-opt-rate">₹{inr(s.CurrentRate, 2)}</b>
            </div>
          ),
        };
      })
    : labourMasters.filter((l: any) => l.IsActive).map((l: any) => ({
        value: l.LabourMasterId, search: `${l.LabourName} ${l.LabourCode || ""}`,
        label: (
          <div className="jcf-opt">
            <span className="min-w-0 flex-1">
              <span className="jcf-opt-name">{l.LabourName}</span>
              <span className="jcf-opt-meta"><span className="font-mono">{l.LabourCode}</span>{l.SkillLevel ? ` · ${l.SkillLevel}` : ""}</span>
            </span>
            <b className="jcf-opt-rate">₹{inr(l.StandardRate, 2)}</b>
          </div>
        ),
      }));

  const stockChip = (l: Line) => {
    if (l.ItemType !== "Spare") return null;
    const id = l.ItemId.toLowerCase();
    const eng = engineerUserId ? stock[`ENG|${String(engineerUserId).toLowerCase()}|${id}`] || 0 : 0;
    const store = serviceCenterId ? stock[`SC|${String(serviceCenterId).toLowerCase()}|${id}`] || 0 : 0;
    const ok = eng + store >= (Number(l.Qty) || 0);
    return <span className={`jcf-stock ${ok ? "is-ok" : "is-low"}`}>{ok ? "✓" : "✗"} Stock · engineer {eng} · store {store}</span>;
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
      title={<DrawerHeader docNo={<DocNoChip docNo={jobCardNo || nextDocNo} preview={!jobCardId} />} icon={<ToolOutlined />} title={jobCardNo ? `Edit Job Card — ${jobCardNo}` : "New Job Card (Estimate)"} subtitle="Spares and labour needed for the repair — warranty lines are borne by the company, the rest is charged to the customer" meta={<DrawerChip label={status} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={onClose} />}
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
        <Form form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form entry-form-compact !max-w-none">
          <FormSection number="01" title="Job card header" description="The call, where the repair is done and who does it.">
            <div className="form-grid form-grid-four">
              <div className="sc-span-2"><Form.Item name="ComplaintId" label={fieldLabel("Service Call")} rules={[{ required: true, message: "Select the service call" }]}>
                <Select showSearch optionFilterProp="label" placeholder="— select a call —" disabled={!!jobCardId}
                  onChange={(id) => { setLines([]); setComponents([]); loadCall(id, true, true); }}
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
              <div className="jcf-span-3"><Form.Item name="Remarks" label={fieldLabel("Notes / Remarks")}><Input placeholder="e.g. Motor rewinding needed; customer informed of charges" /></Form.Item></div>
            </div>
            {components.length > 0 && (
              <div className="pb-4">
                <div className="jc-label mb-2">Components on this call · {components.length}</div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {components.map((c: any, i: number) => {
                    const color = CAT_COLOR[String(c.Category).toUpperCase()] || "#64748b", w = c.Warranty;
                    return (
                      <div key={`${c.SerialNo || c.Category}-${i}`} className="jc-fault" style={{ ["--c" as any]: color }}>
                        <span className="jc-fault-icon"><CategoryIcon category={c.Category} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="jc-fault-cat">{c.Category}{c.ModelName ? ` · ${c.ModelName}` : ""}</span>
                          <span className="jc-fault-name font-mono">{c.SerialNo || "No serial"}</span>
                          {c.ReportedFault && <span className="block truncate text-[11px] text-slate-500" title={c.ReportedFault}>{c.ReportedFault}</span>}
                        </span>
                        {w && <span className="shrink-0 text-right"><Tag color={WARRANTY_TAG[w.State]} className="m-0">{w.Label}</Tag>{w.EndDate && <span className="mt-0.5 block text-[10.5px] text-slate-400">till {dayjs(w.EndDate).format("DD-MMM-YYYY")}</span>}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </FormSection>
        </Form>

        <FormSection number="02" title="Fault details" description="What was found during the visit."
          extra={<Select className="w-72" value={null as any} placeholder="+ Add fault…" showSearch optionFilterProp="label" options={faultOptions}
            onChange={(id: string) => { const f: any = faultMasters.find((x: any) => x.FaultMasterId === id); if (f && !faults.some((x) => x.FaultMasterId === id)) setFaults((fs) => [...fs, { key: uid(), FaultMasterId: id, Category: f.Category, FaultName: f.FaultName, Remarks: f.DefaultNature || "" }]); }} />}>
          <div className="pb-4">
            {!faults.length ? <div className="jcf-empty">No fault added yet — pick one from “+ Add fault…”.</div> : (
              <div className="line-grid" style={{ ["--lg-cols" as any]: "170px minmax(200px,.8fr) minmax(260px,1.4fr) 48px" }}>
                <div className="line-grid-head"><span>Component</span><span>Fault</span><span>Nature / diagnosis</span><span /></div>
                {faults.map((f) => {
                  const color = CAT_COLOR[String(f.Category).toUpperCase()] || "#ea580c";
                  return (
                    <div key={f.key} className="line-grid-row">
                      <div className="lg-cell"><div className="lg-static !justify-start font-semibold" style={{ color }}><span className="sc-cat-icon"><CategoryIcon category={f.Category} /></span>{f.Category}</div></div>
                      <div className="lg-cell"><div className="lg-static !justify-start !whitespace-normal font-semibold text-slate-800">{f.FaultName}</div></div>
                      <div className="lg-cell"><Input value={f.Remarks} maxLength={250} placeholder="What exactly is wrong" onChange={(e) => setFaults((fs) => fs.map((x) => (x.key === f.key ? { ...x, Remarks: e.target.value } : x)))} /></div>
                      <div className="lg-cell lg-icon"><div className="lg-static"><Tooltip title="Remove fault"><Button danger size="small" icon={<DeleteOutlined />} onClick={() => setFaults((fs) => fs.filter((x) => x.key !== f.key))} /></Tooltip></div></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </FormSection>

        <FormSection number="03" title="Spares & labour" description="Tick Warranty when the company bears the line."
          extra={<div className="flex flex-wrap justify-end gap-2">
            <Tooltip title="Import lines from Excel"><Button icon={<UploadOutlined />} onClick={() => importInput.current?.click()}>Import Excel</Button></Tooltip>
            <Tooltip title="Download the Excel template"><Button icon={<DownloadOutlined />} onClick={downloadTemplate}>Template</Button></Tooltip>
            <input ref={importInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importLines(f); e.target.value = ""; }} />
          </div>}>
          <div className="pb-4">
            {/* Add a line: choose spare or labour, then search and pick — the line is added straight away */}
            <div className={`jcf-addbar is-${addType.toLowerCase()}`}>
              <div className="jcf-addbar-type" role="radiogroup" aria-label="Line type">
                {(["Spare", "Labour"] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={addType === t} className={addType === t ? "is-on" : ""} onClick={() => setAddType(t)}>
                    {t === "Spare" ? <ToolOutlined /> : <UserOutlined />} {t === "Spare" ? "Spare part" : "Labour / service"}
                    <span className="jcf-addbar-count">{lines.filter((l) => l.ItemType === t).length}</span>
                  </button>
                ))}
              </div>
              <Select className="jcf-addbar-select" size="large" value={null as any} showSearch optionFilterProp="search" options={addOptions as any}
                placeholder={<span><PlusOutlined /> {addType === "Spare" ? "Search a spare by name or code to add it…" : "Search a labour / service charge to add it…"}</span>}
                notFoundContent={addType === "Spare" ? "No spare found" : "No labour charge found"}
                onChange={(id: string) => { addItem(addType, id); message.success({ content: `${addType === "Spare" ? "Spare" : "Labour"} added`, duration: 1.2 }); }} />
            </div>
            {!lines.length ? <div className="jcf-empty">No lines yet — pick Spare part or Labour / service above, then search and select to add it.</div> : (
              <div className="overflow-x-auto">
                <div className="line-grid min-w-[1100px]" style={{ ["--lg-cols" as any]: "40px minmax(240px,1.4fr) 200px 100px 120px 96px 130px 84px 48px" }}>
                  <div className="line-grid-head">
                    <span>#</span><span>Particulars</span><span>Component serial</span><span className="num">Qty</span><span className="num">Rate</span><span className="num">GST %</span><span className="num">Amount</span>
                    <span><Tooltip title="Tick when the company bears this line (in warranty)">Warranty</Tooltip></span><span />
                  </div>
                  {lines.map((l, i) => {
                    const amt = round2(l.Qty * l.Rate), withTax = amt + round2((amt * l.GstPct) / 100);
                    return (
                      <div key={l.key} className={`line-grid-row ${l.IsWarranty ? "jcf-row-warranty" : ""}`}>
                        <div className="lg-cell"><div className="lg-static !justify-start text-slate-400">{i + 1}</div></div>
                        <div className="lg-cell">
                          <div className="flex min-h-[var(--ant-control-height,32px)] flex-wrap items-center gap-x-2 gap-y-1">
                            <Tag color={l.ItemType === "Spare" ? "blue" : "purple"} className="m-0">{l.ItemType}</Tag>
                            <b className="min-w-0 truncate text-[13.5px] text-slate-800" title={l.Name}>{l.Name}</b>
                            {l.Code && <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-px font-mono text-[10.5px] font-semibold text-slate-600">{l.Code}</span>}
                          </div>
                          {stockChip(l)}
                        </div>
                        <div className="lg-cell">
                          <Select className="w-full" value={l.SerialNo || ""} onChange={(v: string) => updateLine(l.key, { SerialNo: v, IsWarranty: v ? warrantyFor(v) : l.IsWarranty })}
                            options={[{ value: "", label: "— none —" }, ...serialOptions.map((c) => ({ value: c.SerialNo as string, label: `${c.Category} · ${c.SerialNo}` })), ...(l.SerialNo && !serialOptions.some((c) => c.SerialNo === l.SerialNo) ? [{ value: l.SerialNo, label: l.SerialNo }] : [])]} />
                        </div>
                        <div className="lg-cell"><InputNumber className="w-full lg-num" min={1} precision={0} value={l.Qty} onChange={(v) => updateLine(l.key, { Qty: Number(v) || 1 })} /></div>
                        <div className="lg-cell"><InputNumber className="w-full lg-num" min={0} precision={2} prefix="₹" value={l.Rate} onChange={(v) => updateLine(l.key, { Rate: Number(v) || 0 })} /></div>
                        <div className="lg-cell"><InputNumber className="w-full lg-num" min={0} max={100} precision={2} suffix="%" value={l.GstPct} onChange={(v) => updateLine(l.key, { GstPct: Number(v) || 0 })} /></div>
                        <div className="lg-cell"><div className="lg-static lg-strong !flex-col !items-end !gap-0"><span>₹{inr(withTax, 2)}</span><span className="text-[10px] font-normal text-slate-400">{inr(amt, 2)} + GST</span></div></div>
                        <div className="lg-cell"><div className="lg-static !justify-center"><Checkbox checked={l.IsWarranty} onChange={(e) => updateLine(l.key, { IsWarranty: e.target.checked })} /></div></div>
                        <div className="lg-cell lg-icon"><div className="lg-static"><Tooltip title="Remove line"><Button danger size="small" icon={<DeleteOutlined />} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} /></Tooltip></div></div>
                      </div>
                    );
                  })}
                  <div className="line-grid-foot">
                    <span className="text-slate-500">{lines.length} line{lines.length === 1 ? "" : "s"} · {lines.filter((l) => l.IsWarranty).length} under warranty</span>
                    <span className="text-slate-500">Spares <b>₹{inr(totals.spare, 2)}</b></span>
                    <span className="text-slate-500">Labour <b>₹{inr(totals.labour, 2)}</b></span>
                    <span className="text-slate-500">GST <b>₹{inr(totals.gst, 2)}</b></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </FormSection>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5">
          <FormSection number="04" title={<>Photos &amp; videos <span className="text-red-500">*</span></>} description={`At least one photo of the fault / site is required — up to ${MAX_JOBCARD_PHOTOS}, compressed before saving. Videos are optional.`}
            extra={<span className={`sc-chip ${photoCount ? "sc-chip-green" : "jcf-chip-red"}`}><CameraOutlined /> {photoCount ? `${photoCount} photo${photoCount > 1 ? "s" : ""}` : "Photo required"}</span>}>
            <div className="form-grid form-grid-two pb-4">
              <div className="sc-media !mb-0">
                <div className="jc-label mb-2">Photos</div>
                {existingPhotos.length > 0 && (
                  <Image.PreviewGroup>
                    <div className="mb-3 flex flex-wrap gap-3">
                      {existingPhotos.map((p) => {
                        const removed = removedPhotoIds.includes(p.AttachmentId);
                        return (
                          <div key={p.AttachmentId} className={`relative ${removed ? "opacity-40" : ""}`}>
                            <Image src={p.FileUrl} alt={p.FileName} width={96} height={96} className="object-cover rounded-lg border border-slate-200" />
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
                <div className={`text-[11px] ${photoCount ? "text-slate-500" : "text-red-600"}`}>{photoCount ? `${photoCount} of ${MAX_JOBCARD_PHOTOS} photos attached` : "No photo yet — at least one is required"}</div>
              </div>
              <div className="sc-media !mb-0">
                <div className="jc-label mb-2">Videos (optional)</div>
                <VideoAttachments value={videos} onChange={setVideos} onUploadingChange={setVideoUploading} />
              </div>
            </div>
          </FormSection>

          <section className="jcf-summary">
            <div className="jcf-summary-top">
              <span className="jc-label !text-blue-100">Estimate summary</span>
              <strong>₹ {inr(totals.grand, 2)}</strong>
              <span className="text-xs text-blue-100">Grand total · {lines.length} line{lines.length === 1 ? "" : "s"}</span>
            </div>
            <div className="space-y-2 p-4 text-sm">
              {[["Spares", totals.spare, "#2563eb"], ["Labour", totals.labour, "#7c3aed"], ["GST", totals.gst, "#f59e0b"]].map(([label, value, color]) => (
                <div key={label as string} className="flex items-center justify-between text-slate-600"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-sm" style={{ background: color as string }} />{label}</span><span className="font-semibold text-slate-800">₹ {inr(value, 2)}</span></div>
              ))}
              <div className="flex items-center justify-between text-slate-600"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-sm bg-slate-400" />Other charges</span>
                <InputNumber size="small" min={0} precision={2} prefix="₹" value={otherCharges} onChange={(v) => setOtherCharges(Number(v) || 0)} className="w-32 lg-num" /></div>
              <div className="jc-split-bar !my-3" aria-hidden="true"><i style={{ width: `${totals.grand ? Math.round((totals.borne / totals.grand) * 100) : 0}%` }} /></div>
              <div className="jc-payers">
                <div className="jc-payer is-company"><span>Company · warranty</span><b>₹ {inr(totals.borne, 2)}</b></div>
                <div className="jc-payer is-customer"><span>Customer pays</span><b>₹ {inr(totals.payable, 2)}</b></div>
              </div>
              <div className="jcf-route"><AuditOutlined /> <span><b>Approval route:</b> {approvalRoute || "none — approved on submit"}</span></div>
            </div>
          </section>
        </div>
      </Spin>
    </Drawer>
  );
}
