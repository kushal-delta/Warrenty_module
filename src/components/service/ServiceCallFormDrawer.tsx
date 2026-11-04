"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, Drawer, Form, Input, Select, Spin, Tag, Upload, message } from "antd";
import type { UploadFile } from "antd";
import { CustomerServiceOutlined, DeleteOutlined, PlusOutlined, CameraOutlined, CheckCircleFilled } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useWarrantyStore } from "@/lib/store/useWarrantyStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { DrawerHeader, DrawerChip, DRAWER_WIDTH, DRAWER_HEADER_STYLE } from "@/components/common/DrawerHeader";
import { FormSection } from "@/components/common/FormSection";
import { DistrictSelect } from "@/components/common/DistrictSelect";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { fieldLabel } from "@/components/common/PageHeader";
import { CALL_PRIORITIES, CALL_SOURCES } from "@/lib/config/service";
import { reportFormError } from "@/lib/utils/formErrors";
import { ServiceCallProgress } from "./ServiceCallProgress";
import { VideoAttachments, type VideoItem } from "@/components/common/VideoAttachments";

const COMPONENTS = [{ value: "PUMP", label: "Pump" }, { value: "MOTOR", label: "Motor" }, { value: "CONTROLLER", label: "Controller" }];
const STATE_TAG: Record<string, string> = { in: "green", out: "red", unreg: "default", unk: "red" };
const MAX_PHOTOS = 5;

/** Shrinks a photo to ≤1600px JPEG before upload (keeps requests small on mobile networks). */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const img = new Image();
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

interface SerialInfo { State: "in" | "out" | "unreg" | "unk"; Label: string; ModelName?: string; Category?: string; EndDate?: string; DaysLeft?: number; DealerId?: string; InstallationId?: string }

/**
 * "New service call" form, matching the prototype: call details · customer & site (auto-filled from the mobile) ·
 * faulty components (each serial checked for warranty) · complaint & photos · optional assignment.
 */
/** `preset` (new calls only) books a call straight from a warranty: the serial and customer mobile are filled and looked up. */
export function ServiceCallFormDrawer({ open, onClose, onSaved, complaintId, preset }: { open: boolean; onClose: () => void; onSaved: (complaintNo: string) => void; complaintId?: string; preset?: { serialNo: string; category?: string; mobile?: string } | null }) {
  const [record, setRecord] = useState<any>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form] = Form.useForm();
  const { callTypes, projects, states, serviceCenters, engineers } = useMasterStore();
  const { dealers, fetchDealers } = useWarrantyStore();
  const user = useAuthStore((s) => s.user);
  const portal = user && !user.IsAdmin && (user.Role === "DEALER" || user.Role === "CUSTOMER") ? user.Role : null;

  const [maximized, setMaximized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<UploadFile[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoUploading, setVideoUploading] = useState(false);
  const [serialInfo, setSerialInfo] = useState<Record<number, SerialInfo | "loading">>({});
  const [customerNote, setCustomerNote] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const installationId = useRef<string | null>(null);
  const customerId = useRef<string | null>(null);
  const lastMobile = useRef("");

  const callTypeId = Form.useWatch("callTypeId", form);
  const callDate = Form.useWatch("callDate", form);
  const serviceCenterId = Form.useWatch("serviceCenterId", form);
  const callType = callTypes.find((t: any) => t.CallTypeId === callTypeId);
  const dueDate = callType && callDate ? dayjs(callDate).add(Number(callType.ValidDays || 3), "day") : null;

  useEffect(() => {
    if (!open) return;
    if (!dealers.length) fetchDealers().catch(() => undefined);
    form.resetFields();
    const warrantyType = callTypes.find((t: any) => t.IsActive && t.IsWarranty) || callTypes.find((t: any) => t.IsActive);
    form.setFieldsValue({
      callDate: dayjs(), callTypeId: warrantyType?.CallTypeId, priority: "Medium",
      source: portal === "DEALER" ? "Dealer" : portal === "CUSTOMER" ? "Customer" : "Toll Free",
      components: [{ category: "PUMP" }],
    });
    setPhotos([]); setVideos([]); setSerialInfo({}); setCustomerNote(null);
    installationId.current = null; customerId.current = null; lastMobile.current = "";
    setRecord(null); setLoadFailed(false);
    if (!complaintId && preset?.serialNo) {
      form.setFieldsValue({ mobile: preset.mobile, components: [{ category: preset.category || "PUMP", serialNo: preset.serialNo }] });
      (async () => {
        if (preset.mobile) await lookupCustomer(preset.mobile);
        installationId.current = null; // the warranty's own installation comes from the serial
        await lookupSerial(0);
      })();
    }
    if (!complaintId) return;
    let active = true;
    setLoadingEdit(true);
    axios.post("/api/service/complaints/detail", { ComplaintId: complaintId }).then(({ data }) => {
      if (!active) return;
      const c = data.complaint;
      setRecord(c);
      form.setFieldsValue({ ...Object.fromEntries(Object.entries(c).map(([key, value]) => [key[0].toLowerCase() + key.slice(1), value])), callDate: dayjs(c.CallDate), components: data.components.map((l: any) => ({ category: l.Category, serialNo: l.SerialNo, fault: l.ReportedFault })) });
      customerId.current = c.CustomerId; installationId.current = c.InstallationId; lastMobile.current = c.Mobile;
      setPhotos(data.photos.map((p: any) => ({ uid: p.AttachmentId, name: p.FileName, url: p.FileUrl, status: "done" })));
      setVideos(data.videos || []);
      setSerialInfo(Object.fromEntries(data.components.map((l: any, i: number) => [i, l.Warranty ? { ...l.Warranty, ModelName: l.ModelName, Category: l.Category } : undefined])));
    }).catch(err => { if (active) { setLoadFailed(true); reportFormError(err, { fallback: "Could not load service call" }); } }).finally(() => { if (active) setLoadingEdit(false); });
    return () => { active = false; };
  }, [open, complaintId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Serial → model & warranty; corrects the component type and fills the dealer when blank. */
  const lookupSerial = async (index: number) => {
    const serialNo = String(form.getFieldValue(["components", index, "serialNo"]) || "").trim().toUpperCase();
    if (!serialNo) { setSerialInfo((m) => { const n = { ...m }; delete n[index]; return n; }); return; }
    form.setFieldValue(["components", index, "serialNo"], serialNo);
    setSerialInfo((m) => ({ ...m, [index]: "loading" }));
    try {
      const { serial } = (await axios.post("/api/service/complaints/lookup-serial", { serialNo })).data;
      setSerialInfo((m) => ({ ...m, [index]: serial }));
      if (serial.Category && serial.Category !== form.getFieldValue(["components", index, "category"])) form.setFieldValue(["components", index, "category"], serial.Category);
      if (serial.DealerId && !form.getFieldValue("dealerId") && portal !== "DEALER") form.setFieldValue("dealerId", serial.DealerId);
      if (serial.InstallationId && !installationId.current) installationId.current = serial.InstallationId;
    } catch {
      setSerialInfo((m) => { const n = { ...m }; delete n[index]; return n; });
    }
  };

  /** Mobile → existing customer: fills the site and, when the components are still empty, their pump set serials. */
  const lookupCustomer = async (mobile: string) => {
    if (!/^[6-9]\d{9}$/.test(mobile) || mobile === lastMobile.current) return;
    lastMobile.current = mobile;
    setLookingUp(true);
    try {
      const data = (await axios.post("/api/service/complaints/lookup-customer", { mobile })).data;
      if (!data.found) { setCustomerNote(null); customerId.current = null; installationId.current = null; return; }
      const c = data.customer, inst = data.installations?.[0];
      customerId.current = c.CustomerId;
      installationId.current = inst?.InstallationId || null;
      form.setFieldsValue({
        customerName: c.CustomerName,
        village: inst?.Village || c.Village || undefined,
        address: inst?.SiteAddress || c.Address || undefined,
        stateId: inst?.StateId || c.StateId || form.getFieldValue("stateId"),
        district: inst?.District || c.District || undefined,
        pincode: inst?.Pincode || c.Pincode || undefined,
        ...(inst?.DealerId && portal !== "DEALER" ? { dealerId: inst.DealerId } : {}),
        ...(inst?.ProjectId ? { projectId: inst.ProjectId } : {}),
      });
      const current = form.getFieldValue("components") || [];
      const empty = current.every((l: any) => !l?.serialNo && !l?.fault);
      if (empty && inst?.Serials?.length) {
        form.setFieldValue("components", inst.Serials.map((s: any) => ({ category: s.Category, serialNo: s.SerialNo })));
        setSerialInfo({});
        setTimeout(() => inst.Serials.forEach((_: any, i: number) => lookupSerial(i)), 0);
      }
      setCustomerNote(`Existing customer loaded${inst ? ` · ${inst.InstallNo}${inst.DealerName ? ` · dealer ${inst.DealerName}` : ""}` : ""}${data.installations?.length > 1 ? ` (${data.installations.length} pump sets — latest used)` : ""}`);
    } catch {
      setCustomerNote(null);
    } finally {
      setLookingUp(false);
    }
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      const rows: any[] = values.components || [];
      const components = rows.filter((l) => l?.serialNo || l?.fault);
      if (!components.length) { message.error("Add at least one faulty component (serial no or fault)"); return; }
      const unknownRow = rows.findIndex((l, i) => { const info = serialInfo[i]; return l?.serialNo && info && info !== "loading" && info.State === "unk"; });
      if (unknownRow >= 0) { message.error(`Serial ${rows[unknownRow].serialNo} is not in the sticker register — correct it or clear it`); return; }
      if (videoUploading) { message.warning("Wait for the video upload to finish"); return; }
      setSaving(true);
      const photoData = await Promise.all(photos.filter(f => f.originFileObj).map(async (f) => ({ fileName: f.name, dataUrl: await compressImage(f.originFileObj as File) })));
      const res = await axios.post(complaintId ? "/api/service/complaints/update" : "/api/service/complaints/add", {
        ComplaintId: complaintId, retainedPhotoIds: photos.filter(f => !f.originFileObj).map(f => f.uid), videoIds: videos.map((v) => v.AttachmentId),
        callDate: values.callDate.toISOString(), callTypeId: values.callTypeId, priority: values.priority, source: values.source,
        projectId: values.projectId || null, dealerId: values.dealerId || null,
        mobile: values.mobile, customerName: values.customerName, village: values.village, address: values.address,
        stateId: values.stateId, district: values.district, pincode: values.pincode,
        customerId: customerId.current, installationId: installationId.current,
        components: components.map((l: any) => ({ category: l.category, serialNo: l.serialNo, fault: l.fault })),
        complaintText: values.complaintText, photos: photoData,
        serviceCenterId: values.serviceCenterId || null, engineerUserId: values.engineerUserId || null,
      });
      const c = res.data.complaint;
      message.success(`Service call ${c.ComplaintNo} ${complaintId ? "updated" : "registered"}`);
      onSaved(c.ComplaintNo);
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not register the service call" });
    } finally {
      setSaving(false);
    }
  };

  const engineerOptions = engineers.filter((e: any) => !serviceCenterId || !e.ServiceCenterId || e.ServiceCenterId === serviceCenterId);

  return (
    <Drawer rootClassName="entry-drawer" open={open} onClose={onClose} closable={false} width={maximized ? "100%" : DRAWER_WIDTH} styles={{ header: DRAWER_HEADER_STYLE }} destroyOnClose
      title={<DrawerHeader icon={<CustomerServiceOutlined />} title={complaintId ? `Edit service call ${record?.ComplaintNo || ""}` : "New service call"} subtitle="Call details, components, photos / videos and assignment" meta={<DrawerChip label={complaintId ? "Edit mode" : "New Service Call"} tone="solid" />} maximized={maximized} onToggleMaximize={() => setMaximized(!maximized)} onClose={onClose} />}
      footer={<div className="flex items-center justify-end gap-2 py-2"><Button onClick={onClose} disabled={saving}>Cancel</Button><Button type="primary" onClick={save} disabled={loadingEdit || loadFailed} loading={saving} className="bg-teal-600">{complaintId ? "Save changes" : "Register call"}</Button></div>}
    >
      {record && <div className="mb-5"><ServiceCallProgress status={record.Status} /></div>}
      <Spin spinning={loadingEdit}><Form disabled={loadingEdit || loadFailed} form={form} layout="vertical" requiredMark scrollToFirstError className="entry-form">
        <FormSection number="01" title="Call details" description="Type of call, priority and where the call came from.">
          <div className="form-grid form-grid-three">
            <Form.Item name="callDate" label={fieldLabel("Call Date")} rules={[{ required: true, message: "Call date is required" }]}><SmartDatePicker disabledDate={(d) => d.isAfter(dayjs(), "day")} /></Form.Item>
            <Form.Item name="callTypeId" label={fieldLabel("Call Type")} rules={[{ required: true, message: "Select the call type" }]}
              extra={dueDate ? <span className="text-[11px]">Due by {dueDate.format("DD-MMM-YYYY")} ({callType.ValidDays} valid days)</span> : null}>
              <Select placeholder="Select call type" options={callTypes.filter((t: any) => t.IsActive).map((t: any) => ({ value: t.CallTypeId, label: `${t.CallTypeName} (${t.ValidDays} days)` }))} />
            </Form.Item>
            <Form.Item name="priority" label={fieldLabel("Priority")}><Select options={CALL_PRIORITIES.map((p) => ({ value: p, label: p }))} /></Form.Item>
            <Form.Item name="source" label={fieldLabel("Call Source")}><Select disabled={!!portal} options={CALL_SOURCES.map((s) => ({ value: s, label: s }))} /></Form.Item>
            <Form.Item name="projectId" label={fieldLabel("Project / Scheme")}><Select allowClear placeholder="Select Project / Scheme" options={projects.map((p: any) => ({ value: p.ProjectId, label: `${p.ProjectName}${p.ProjectNo ? ` (${p.ProjectNo})` : ""}` }))} /></Form.Item>
            {portal !== "DEALER" && <Form.Item name="dealerId" label={fieldLabel("Dealer")}><Select allowClear showSearch optionFilterProp="label" placeholder="Select Dealer" options={dealers.map((d) => ({ value: d.DealerId, label: `${d.FirmName}${d.DealerCode ? ` (${d.DealerCode})` : ""}` }))} /></Form.Item>}
          </div>
        </FormSection>

        <FormSection number="02" title="Customer & site" description="Type the mobile — an existing customer loads automatically.">
          <div className="form-grid form-grid-three">
            <Form.Item name="mobile" label={fieldLabel("Mobile")} rules={[{ required: true, message: "Mobile number is required" }, { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit mobile number" }]}
              extra={customerNote ? <span className="text-[11px] text-emerald-700"><CheckCircleFilled /> {customerNote}</span> : <span className="text-[11px]">Type the mobile — an existing customer loads automatically</span>}>
              <Input maxLength={10} inputMode="numeric" suffix={lookingUp ? <Spin size="small" /> : null} onChange={(e) => lookupCustomer(e.target.value.trim())} placeholder="e.g. 9414101017" />
            </Form.Item>
            <Form.Item name="customerName" label={fieldLabel("Customer Name")} rules={[{ required: true, message: "Customer name is required" }, { max: 120 }]}><Input /></Form.Item>
            <Form.Item name="village" label={fieldLabel("Village / Area")}><Input maxLength={100} /></Form.Item>
            <div className="entry-field-wide"><Form.Item name="address" label={fieldLabel("Address")}><Input maxLength={300} /></Form.Item></div>
            <Form.Item name="stateId" label={fieldLabel("State")} rules={[{ required: true, message: "Select the state" }]}>
              <Select showSearch optionFilterProp="label" placeholder="Select state" options={states.map((s: any) => ({ value: s.StateId, label: s.StateName }))} onChange={() => form.setFieldValue("district", undefined)} />
            </Form.Item>
            <Form.Item name="district" label={fieldLabel("District")}><DistrictSelect stateField="stateId" /></Form.Item>
            <Form.Item name="pincode" label={fieldLabel("Pincode")} rules={[{ pattern: /^\d{6}$/, message: "Pincode must be 6 digits" }]}><Input maxLength={6} inputMode="numeric" /></Form.Item>
          </div>
        </FormSection>

        <FormSection number="03" title="Faulty components" description="Pump, motor and controller each have their own serial and warranty.">
          <Form.List name="components">
            {(fields, { add, remove }) => (
              <div className="pb-4 space-y-2">
                <div className="hidden md:grid grid-cols-[140px_180px_1fr_1fr_40px] gap-3 px-1 text-xs font-semibold text-slate-600">
                  <span>Component</span><span>Serial no</span><span>Model &amp; warranty</span><span>Fault reported</span><span />
                </div>
                {fields.map((field) => {
                  const info = serialInfo[field.name];
                  return (
                    <div key={field.key} className="grid grid-cols-1 md:grid-cols-[140px_180px_1fr_1fr_40px] gap-3 items-start rounded-lg border border-slate-200 md:border-0 p-2 md:p-0">
                      <Form.Item name={[field.name, "category"]} className="!mb-0"><Select options={COMPONENTS} /></Form.Item>
                      <Form.Item name={[field.name, "serialNo"]} className="!mb-0"><Input className="font-mono uppercase" placeholder="Scan / type serial" onBlur={() => lookupSerial(field.name)} onPressEnter={(e) => { e.preventDefault(); lookupSerial(field.name); }} /></Form.Item>
                      <div className="text-xs pt-1.5 min-h-[32px]">
                        {info === "loading" ? <Spin size="small" /> : !info ? <span className="text-slate-400">Enter the serial to fetch warranty</span> : (
                          <span>
                            {info.ModelName && <span className="text-slate-700">{info.ModelName} </span>}
                            <Tag color={STATE_TAG[info.State]} className="ml-1">{info.Label}</Tag>
                            {info.EndDate && <span className="text-slate-400">till {dayjs(info.EndDate).format("DD-MMM-YYYY")}{info.State === "in" ? ` · ${info.DaysLeft} d left` : ""}</span>}
                            {info.State === "unk" && <span className="text-red-600 block">Not in the sticker register — correct or clear it</span>}
                          </span>
                        )}
                      </div>
                      <Form.Item name={[field.name, "fault"]} className="!mb-0" rules={[{ max: 250 }]}><Input placeholder="e.g. no discharge" /></Form.Item>
                      <Button type="text" danger icon={<DeleteOutlined />} disabled={fields.length === 1} onClick={() => { remove(field.name); setSerialInfo({}); setTimeout(() => (form.getFieldValue("components") || []).forEach((_: any, i: number) => lookupSerial(i)), 0); }} />
                    </div>
                  );
                })}
                <Button icon={<PlusOutlined />} onClick={() => add({ category: ["PUMP", "MOTOR", "CONTROLLER"][fields.length % 3] })}>Add component</Button>
              </div>
            )}
          </Form.List>
        </FormSection>

        <FormSection number="04" title="Complaint" description="What the customer reported, with optional photos and videos from the site.">
          <div className="form-grid form-grid-two">
            <div className="entry-field-wide">
              <Form.Item name="complaintText" label={fieldLabel("Complaint / Problem Reported")} rules={[{ required: true, message: "Describe the problem reported" }, { min: 3, message: "Describe the problem reported" }]}>
                <Input.TextArea rows={3} placeholder="Breakdown symptoms, discharge issues, controller trip code, motor heating..." />
              </Form.Item>
            </div>
            <div className="entry-field-wide">
              <Form.Item label={fieldLabel("Photos (optional)")} extra={<span className="text-[11px]">Up to {MAX_PHOTOS} photos from the site — compressed before saving</span>}>
                <Upload listType="picture-card" accept="image/*" multiple fileList={photos} beforeUpload={() => false}
                  onChange={({ fileList }) => setPhotos(fileList.slice(0, MAX_PHOTOS))}>
                  {photos.length < MAX_PHOTOS && <div className="text-slate-500"><CameraOutlined className="text-lg" /><div className="text-xs mt-1">Add photo</div></div>}
                </Upload>
              </Form.Item>
              <Form.Item label={fieldLabel("Videos (optional)")}>
                <VideoAttachments value={videos} onChange={setVideos} onUploadingChange={setVideoUploading} />
              </Form.Item>
            </div>
          </div>
        </FormSection>

        {!portal && (
          <FormSection number="05" title="Assignment" description="Optional — can also be done later from the call.">
            <div className="form-grid form-grid-two">
              <Form.Item name="serviceCenterId" label={fieldLabel("Service Center")}>
                <Select allowClear placeholder="Select Service Center" options={serviceCenters.map((s: any) => ({ value: s.ServiceCenterId, label: s.ServiceCenterName }))}
                  onChange={() => { const eng = engineers.find((e: any) => e.UserId === form.getFieldValue("engineerUserId")); if (eng && eng.ServiceCenterId && eng.ServiceCenterId !== form.getFieldValue("serviceCenterId")) form.setFieldValue("engineerUserId", undefined); }} />
              </Form.Item>
              <Form.Item name="engineerUserId" label={fieldLabel("Engineer")} extra={<span className="text-[11px]">Choosing an engineer books the call as Assigned.</span>}>
                <Select allowClear placeholder="Select Engineer" notFoundContent="No engineers for this centre" options={engineerOptions.map((e: any) => ({ value: e.UserId, label: `${e.FirstName} ${e.LastName || ""}`.trim() }))}
                  onChange={(id) => { const eng = engineers.find((e: any) => e.UserId === id); if (eng?.ServiceCenterId && !form.getFieldValue("serviceCenterId")) form.setFieldValue("serviceCenterId", eng.ServiceCenterId); }} />
              </Form.Item>
            </div>
          </FormSection>
        )}
      </Form></Spin>
    </Drawer>
  );
}
