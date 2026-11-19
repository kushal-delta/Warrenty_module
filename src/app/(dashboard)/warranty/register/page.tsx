"use client";

import { DistrictSelect } from "@/components/common/DistrictSelect";
import React, { useEffect, useRef, useState } from "react";
import {
  Form,
  Input,
  Select,
  Button,
  Tag,
  message,
  Checkbox,
  Segmented,
  InputNumber,
  Tooltip,
} from "antd";
import {
  SafetyCertificateFilled,
  CheckCircleFilled,
  CheckOutlined,
  ExclamationCircleFilled,
  LoadingOutlined,
  BarcodeOutlined,
  UserOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  CalendarOutlined,
  ShopOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  WhatsAppOutlined,
  ArrowRightOutlined,
  ToolOutlined,
  SearchOutlined,
  FileProtectOutlined,
} from "@ant-design/icons";
import { useWarrantyStore } from "@/lib/store/useWarrantyStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { FormSection } from "@/components/common/FormSection";
import { fieldLabel } from "@/components/common/PageHeader";
import { CategoryIcon } from "@/components/warranty/SerialPassport";
import { reportFormError } from "@/lib/utils/formErrors";
import Link from "next/link";
import dayjs from "dayjs";
import axios from "axios";

/** Colour per component type — the same blue / cyan / purple used for the type tags across the app. */
const CAT: Record<string, { color: string; bg: string; label: string; tag: string }> = {
  PUMP: { color: "#2563eb", bg: "#eff6ff", label: "Pump", tag: "blue" },
  MOTOR: { color: "#0891b2", bg: "#ecfeff", label: "Motor", tag: "cyan" },
  CONTROLLER: { color: "#7c3aed", bg: "#f5f3ff", label: "Controller", tag: "purple" },
};
const catOf = (c?: string) => CAT[String(c || "").toUpperCase()] || { color: "#64748b", bg: "#f8fafc", label: c || "Component", tag: "default" };
/** "2 years", "18 months", "5 years". */
const spanText = (months: number) => (months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${months} months`);
const fmt = (d: dayjs.Dayjs | null | undefined) => (d ? d.format("DD MMM YYYY") : "—");

export default function RegisterWarrantyPage() {
  const [form] = Form.useForm();
  const { addFullInstallation, isLoading } = useWarrantyStore();
  const { states, productModels, projects } = useMasterStore();
  const { dealers, fetchDealers } = useWarrantyStore();
  const authUser = useAuthStore((st) => st.user);
  const isDealerLogin = authUser?.Role === "DEALER" && !authUser?.IsAdmin; // dealers are recorded under their own code by the server
  useEffect(() => { if (!dealers.length && !isDealerLogin) fetchDealers().catch(() => undefined); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile → existing customer: fill the customer details (only when they belong to the user's rights).
  const [customerNote, setCustomerNote] = useState<string | null>(null);
  const lastMobile = useRef("");
  /** What the mobile lookup filled in — cleared again when the mobile changes to another / unknown number. */
  const autoFill = useRef<Record<string, any> | null>(null);
  const clearAutoFill = () => {
    setCustomerNote(null);
    const filled = autoFill.current;
    if (!filled) return;
    autoFill.current = null;
    const reset: Record<string, any> = {};
    // Only fields still holding the looked-up value are cleared — anything the user typed since is kept.
    Object.entries(filled).forEach(([key, value]) => { if (form.getFieldValue(key) === value) reset[key] = key === "language" ? "EN" : undefined; });
    form.setFieldsValue(reset);
  };
  const onMobileChange = (mobile: string) => {
    if (mobile === lastMobile.current) return;
    if (autoFill.current) clearAutoFill();
    if (!/^[6-9]\d{9}$/.test(mobile)) { lastMobile.current = ""; return; }
    lookupCustomer(mobile);
  };
  const lookupCustomer = async (mobile: string) => {
    if (!/^[6-9]\d{9}$/.test(mobile) || mobile === lastMobile.current) return;
    lastMobile.current = mobile;
    try {
      const data = (await axios.post("/api/warranty/installations/lookup-customer", { mobile })).data;
      if (String(form.getFieldValue("mobile") || "").trim() !== mobile) return; // number changed while looking up
      clearAutoFill();
      if (!data.found) return;
      const c = data.customer;
      const values: Record<string, any> = { customerName: c.CustomerName, email: c.Email || undefined, language: c.Language || "EN", siteAddress: c.Address || undefined, village: c.Village || undefined, stateId: c.StateId || undefined, district: c.District || undefined, pincode: c.Pincode || undefined };
      form.setFieldsValue(values);
      autoFill.current = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ""));
      setCustomerNote(`Existing customer loaded — ${c.CustomerName}`);
    } catch { setCustomerNote(null); }
  };

  const [submittedResult, setSubmittedResult] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Product serial numbers — any mix of pump / motor / controller, each with its own warranty (prototype layout).
   * Every serial is looked up in the Serial Register: its type, model and warranty months come from there.
   */
  interface SerialInfo { status: "ok" | "registered" | "unknown"; category?: string; modelName?: string; modelId?: string; months?: number; mfgDate?: string | null }
  interface SerialRow { key: string; serial: string; info: SerialInfo | "loading" | null; start?: dayjs.Dayjs | null; months?: number }
  const installDateValue = Form.useWatch("installDate", form);
  /** Warranty start = chosen date, else the serial's manufacturing date, else the installation date. */
  const startOf = (r: SerialRow): dayjs.Dayjs | null => r.start ?? (r.info && r.info !== "loading" && r.info.mfgDate ? dayjs(r.info.mfgDate) : installDateValue || null);
  const monthsOf = (r: SerialRow) => r.months ?? (r.info && r.info !== "loading" ? r.info.months || 24 : 24);
  const newRow = (): SerialRow => ({ key: Math.random().toString(36).slice(2), serial: "", info: null });
  const [rows, setRows] = useState<SerialRow[]>(() => [newRow(), newRow()]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();

  const findSticker = async (serial: string) => {
    const res = await axios.post("/api/warranty/stickers/get", { search: serial, limit: 30 });
    return (res.data.stickers || []) as any[];
  };
  const lookupRow = async (key: string, serial: string): Promise<SerialInfo | null> => {
    const sn = serial.trim().toUpperCase();
    if (!sn) { setRows((rs) => rs.map((r) => (r.key === key ? { ...r, info: null } : r))); return null; }
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, serial: sn, info: "loading" } : r)));
    let info: SerialInfo;
    try {
      const sticker = (await findSticker(sn)).find((st) => String(st.SerialNo).toUpperCase() === sn);
      if (!sticker) info = { status: "unknown" };
      else {
        const model = productModels.find((m) => m.ProductModelId === sticker.ProductModelId);
        info = {
          status: ["Registered", "Replaced"].includes(sticker.Status) ? "registered" : "ok",
          category: sticker.Category, modelName: sticker.ModelName || model?.ModelName, modelId: sticker.ProductModelId,
          months: Number(model?.WarrantyMonths) || (sticker.Category === "CONTROLLER" ? 36 : 24), mfgDate: sticker.MfgDate || null,
        };
      }
    } catch {
      info = { status: "unknown" };
    }
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, info } : r)));
    return info;
  };
  /** Free stickers (Generated / Printed, not used in another row) matching the typed text; all free ones when empty. */
  const suggest = (text: string, key: string) => {
    clearTimeout(suggestTimer.current);
    const q = text.trim();
    setSearching(true);
    suggestTimer.current = setTimeout(async () => {
      try {
        const found = q
          ? await findSticker(q)
          : (await Promise.all(["Generated", "Printed"].map((status) => axios.post("/api/warranty/stickers/get", { status, limit: 50 }).then((r) => r.data.stickers || [])))).flat();
        const used = rows.filter((r) => r.key !== key).map((r) => r.serial.toUpperCase());
        const free = found.filter((st: any) => ["Generated", "Printed"].includes(st.Status) && !used.includes(String(st.SerialNo).toUpperCase()));
        setSuggestions(free.sort((a: any, b: any) => String(a.SerialNo).localeCompare(String(b.SerialNo))).slice(0, 50));
      } catch { setSuggestions([]); }
      finally { setSearching(false); }
    }, q ? 250 : 0);
  };
  /** Picking a serial from the list: its type / model / warranty are already known from the option. */
  const chooseSerial = (key: string, sticker: any) => {
    const model = productModels.find((m) => m.ProductModelId === sticker.ProductModelId);
    setRows((rs) => rs.map((r) => (r.key === key ? {
      ...r, serial: String(sticker.SerialNo).toUpperCase(),
      info: { status: "ok", category: sticker.Category, modelName: sticker.ModelName || model?.ModelName, modelId: sticker.ProductModelId, months: Number(model?.WarrantyMonths) || (sticker.Category === "CONTROLLER" ? 36 : 24), mfgDate: sticker.MfgDate || null },
      start: undefined, months: undefined,
    } : r)));
  };
  const patchRow = (key: string, patch: Partial<SerialRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const resetAll = () => {
    form.resetFields(); setRows([newRow(), newRow()]); setSuggestions([]); setCustomerNote(null); lastMobile.current = ""; autoFill.current = null;
  };

  /* ---------- live progress (drives the step bar, checklist and warranty card preview) ---------- */
  const mobileValue = Form.useWatch("mobile", form);
  const customerNameValue = Form.useWatch("customerName", form);
  const siteAddressValue = Form.useWatch("siteAddress", form);
  const villageValue = Form.useWatch("village", form);
  const stateIdValue = Form.useWatch("stateId", form);
  const districtValue = Form.useWatch("district", form);
  const pincodeValue = Form.useWatch("pincode", form);
  const dealerIdValue = Form.useWatch("dealerId", form);
  const consentValue = Form.useWatch("consent", form);

  const isOk = (r: SerialRow) => Boolean(r.info && r.info !== "loading" && r.info.status === "ok");
  const isBad = (r: SerialRow) => Boolean(r.info && r.info !== "loading" && r.info.status !== "ok");
  const okRows = rows.filter(isOk);
  const badCount = rows.filter(isBad).length;
  const serialsDone = okRows.length > 0 && badCount === 0;
  const customerDone = /^[6-9]\d{9}$/.test(String(mobileValue || "")) && Boolean(String(customerNameValue || "").trim()) && Boolean(String(siteAddressValue || "").trim())
    && Boolean(stateIdValue) && Boolean(districtValue) && /^\d{6}$/.test(String(pincodeValue || ""));
  const installDone = Boolean(installDateValue);
  const allDone = serialsDone && customerDone && installDone;
  const stateName = states.find((s) => s.StateId === stateIdValue)?.StateName;
  const dealerName = dealers.find((d) => d.DealerId === dealerIdValue)?.FirmName;
  const maxMonths = Math.max(24, ...okRows.map(monthsOf));

  const steps = [
    { label: "Product serials", hint: okRows.length ? `${okRows.length} component${okRows.length === 1 ? "" : "s"} ready${badCount ? ` · ${badCount} to fix` : ""}` : "Scan or pick a serial", done: serialsDone, warn: badCount > 0 },
    { label: "Customer", hint: customerDone ? String(customerNameValue).trim() : "Mobile, name and address", done: customerDone },
    { label: "Installation", hint: installDone ? `Installed ${fmt(dayjs(installDateValue))}` : "Date, invoice and site", done: installDone },
    { label: "Register", hint: allDone ? "Ready to submit" : "Complete the steps above", done: false, ready: allDone },
  ];

  const handleSubmit = async (values: any) => {
    try {
      setSubmitting(true);

      // Look up any serial not checked yet, then refuse unknown / registered / repeated serials.
      const filled = rows.filter((r) => r.serial.trim());
      if (!filled.length) { message.error("Enter at least one product serial number"); return; }
      const checked = await Promise.all(filled.map(async (r) => ({ row: r, info: r.info && r.info !== "loading" ? r.info : await lookupRow(r.key, r.serial) })));
      const seen = new Set<string>();
      for (const { row, info } of checked) {
        const sn = row.serial.trim().toUpperCase();
        if (seen.has(sn)) { message.error(`Serial ${sn} is entered twice`); return; }
        seen.add(sn);
        if (!info || info.status === "unknown") { message.error(`Serial ${sn} is not in the Serial Register`); return; }
        if (info.status === "registered") { message.error(`Serial ${sn} is already registered to a customer`); return; }
      }
      const components = checked.map(({ row, info }) => ({ serialNo: row.serial.trim().toUpperCase(), category: info!.category, productModelId: info!.modelId, warrantyMonths: monthsOf(row), startDate: (startOf(row) || dayjs()).toISOString() }));

      const payload = {
        customerName: values.customerName,
        mobile: values.mobile,
        siteAddress: values.siteAddress,
        village: values.village,
        district: values.district,
        stateId: values.stateId,
        pincode: values.pincode,
        projectId: values.projectId,
        dealerId: values.dealerId,
        installDate: values.installDate ? values.installDate.toISOString() : new Date().toISOString(),
        borewellDepthM: values.borewellDepthM,
        dynamicHeadM: values.dynamicHeadM,
        panelKwp: values.panelKwp,
        invoiceNo: values.invoiceNo,
        invoiceDate: values.installDate ? values.installDate.toISOString() : null,
        email: values.email || null,
        language: values.language,
        consent: Boolean(values.consent),
        remarks: values.remarks,
        components,
      };

      const result = await addFullInstallation(payload);
      setSubmittedResult({
        ...result, customerName: values.customerName, mobile: values.mobile, consent: Boolean(values.consent),
        location: [values.village, values.district, states.find((st) => st.StateId === values.stateId)?.StateName].filter(Boolean).join(", "),
        address: values.siteAddress, pincode: values.pincode, installDate: values.installDate, invoiceNo: values.invoiceNo,
        dealerName: isDealerLogin ? "Your dealership" : dealers.find((d) => d.DealerId === values.dealerId)?.FirmName || "Direct",
      });
      message.success("Installation and warranties registered successfully!");
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Failed to register installation and warranties" });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- success: the registered warranty card ---------- */
  if (submittedResult) {
    const warranties: any[] = submittedResult.warranties || [];
    const longest = Math.max(...warranties.map((w: any) => Number(w.WarrantyMonths) || 24), 24);
    const lastEnd = warranties.reduce<dayjs.Dayjs | null>((acc, w: any) => { const e = dayjs(w.EndDate); return !acc || e.isAfter(acc) ? e : acc; }, null);
    // Saved installation row from the server — the summary reads from it so it is always filled in.
    const ins: any = submittedResult.installation || {};
    const facts: [string, React.ReactNode][] = [
      ["Customer", submittedResult.customerName],
      ["Mobile", `+91 ${submittedResult.mobile}`],
      ["Site", [submittedResult.address || ins.SiteAddress, submittedResult.location || [ins.Village, ins.District, states.find((st) => st.StateId === ins.StateId)?.StateName].filter(Boolean).join(", "), submittedResult.pincode || ins.Pincode].filter(Boolean).join(", ") || "—"],
      ["Installed on", submittedResult.installDate || ins.InstallDate ? fmt(dayjs(submittedResult.installDate || ins.InstallDate)) : "—"],
      ["Invoice No", submittedResult.invoiceNo || ins.InvoiceNo || "—"],
      ["Dealer", submittedResult.dealerName || (isDealerLogin ? "Your dealership" : dealers.find((d) => d.DealerId === ins.DealerId)?.FirmName || "Direct")],
    ];
    return (
      <div className="space-y-5 verify-pop">
      {/* Same page header as the rest of the application */}
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="tick-anim" aria-hidden="true">
              <svg viewBox="0 0 52 52"><circle className="tick-anim-circle" cx="26" cy="26" r="24" /><path className="tick-anim-check" d="M15 27 l7.5 7.5 L37.5 19" /></svg>
            </span>
            Warranty Registered — {submittedResult.customerName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">The installation is saved and every component below now has an active warranty.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Tag color="blue" className="m-0">Installation {submittedResult.installation?.InstallNo}</Tag>
            <Tag color="green" className="m-0">{warranties.length} warrant{warranties.length === 1 ? "y" : "ies"} active</Tag>
            {submittedResult.consent && <Tag color="cyan" icon={<WhatsAppOutlined />} className="m-0">Sent to +91 {submittedResult.mobile}</Tag>}
          </div>
        </div>
        <div className="page-actions">
          <Button icon={<PlusOutlined />} onClick={() => { setSubmittedResult(null); resetAll(); }}>Register Another</Button>
          <Link href="/warranty/active"><Button type="primary">View in Active Warranties</Button></Link>
        </div>
      </div>

      <div className="reg-done">
        <div className="reg-done-body">
          <div className="min-w-0">
            <div className="reg-subhead">Component warranties</div>
            <div className="reg-done-grid">
              {warranties.map((w: any) => {
                const c = catOf(w.Category), m = Number(w.WarrantyMonths) || 24;
                return (
                  <div key={w.WarrantyId || w.SerialNo} className="reg-done-unit" style={{ ["--cat" as any]: c.color, ["--cat-bg" as any]: c.bg }}>
                    <div className="flex items-start gap-3">
                      <div className="reg-unit-icon"><CategoryIcon category={w.Category} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="reg-unit-cat">{c.label}</span>
                          <span className="reg-done-badge"><CheckCircleFilled /> Active</span>
                        </div>
                        <div className="font-mono text-[15px] font-bold text-slate-900 truncate">{w.SerialNo}</div>
                        <div className="text-[11px] text-slate-500 truncate">Warranty No · <span className="font-semibold text-slate-700">{w.WarrantyNo}</span></div>
                      </div>
                    </div>
                    <div className="reg-bar mt-3"><i style={{ width: `${Math.max(8, (m / longest) * 100)}%` }} /></div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div><span className="reg-mini-label !mb-0.5">Starts</span><span className="font-semibold text-slate-800">{fmt(dayjs(w.StartDate))}</span></div>
                      <div><span className="reg-mini-label !mb-0.5">Period</span><span className="font-semibold text-slate-800">{spanText(m)}</span></div>
                      <div><span className="reg-mini-label !mb-0.5">Ends</span><span className="font-semibold text-emerald-700">{fmt(dayjs(w.EndDate))}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="reg-subhead mt-6">What happens next</div>
            <div className="reg-next-grid">
              <div className="reg-next">
                <span className="reg-next-icon" style={{ color: "#16a34a", background: "#f0fdf4" }}><WhatsAppOutlined /></span>
                <div className="min-w-0"><b>Warranty message</b><p>{submittedResult.consent ? `Warranty details queued on WhatsApp / SMS to +91 ${submittedResult.mobile}.` : "Customer did not opt in to WhatsApp / SMS updates."}</p></div>
              </div>
              <Link href="/warranty/active" className="reg-next">
                <span className="reg-next-icon" style={{ color: "#2563eb", background: "#eff6ff" }}><FileProtectOutlined /></span>
                <div className="min-w-0"><b>Active Warranties</b><p>Extend the period, change the start date or void a warranty later.</p></div>
                <ArrowRightOutlined className="reg-next-go" />
              </Link>
              <Link href="/service/complaints" className="reg-next">
                <span className="reg-next-icon" style={{ color: "#d97706", background: "#fffbeb" }}><ToolOutlined /></span>
                <div className="min-w-0"><b>Service calls</b><p>Any complaint on these serials is raised as a service call and checked against this warranty.</p></div>
                <ArrowRightOutlined className="reg-next-go" />
              </Link>
              <Link href="/warranty/search" className="reg-next">
                <span className="reg-next-icon" style={{ color: "#7c3aed", background: "#f5f3ff" }}><SearchOutlined /></span>
                <div className="min-w-0"><b>Serial No. Search Report</b><p>See the full lifecycle, pump set and owner of any serial.</p></div>
                <ArrowRightOutlined className="reg-next-go" />
              </Link>
            </div>
          </div>

          <aside className="reg-done-side">
            <div className="reg-subhead">Registration summary</div>
            <dl className="reg-done-facts">
              {facts.map(([k, v]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>))}
            </dl>
            {lastEnd && (
              <div className="reg-end mt-4">
                <span>Last warranty ends</span>
                <strong>{fmt(lastEnd)}</strong>
                <span>{lastEnd.isAfter(dayjs()) ? `${lastEnd.diff(dayjs(), "month")} months from today` : "Already ended"}</span>
              </div>
            )}
          </aside>
        </div>
      </div>
      </div>
    );
  }

  /* ---------- one product serial card ---------- */
  const renderUnit = (row: SerialRow, index: number) => {
    const info = row.info && row.info !== "loading" ? row.info : null;
    const ok = isOk(row), bad = isBad(row);
    const c = info?.category ? catOf(info.category) : null;
    const start = ok ? startOf(row) : null, months = monthsOf(row), end = start ? start.add(months, "month") : null;
    const source = row.start ? "Date you picked" : info?.mfgDate ? "From manufacturing date" : "From installation date";
    return (
      <div key={row.key} className={`reg-unit verify-pop ${!row.serial ? "is-empty" : ""} ${bad ? "is-error" : ""}`}
        style={c && !bad ? { ["--cat" as any]: c.color, ["--cat-bg" as any]: c.bg } : undefined}>
        <div className="reg-unit-head">
          <div className="reg-unit-icon">
            {row.info === "loading" ? <LoadingOutlined /> : bad ? <ExclamationCircleFilled /> : c ? <CategoryIcon category={info?.category} /> : <BarcodeOutlined />}
          </div>
          <Select
            showSearch
            allowClear
            className="reg-unit-select"
            placeholder={`Serial ${index + 1} — search or scan`}
            value={row.serial || undefined}
            filterOption={false}
            loading={searching}
            notFoundContent={searching ? "Searching…" : "No free serial found"}
            onFocus={() => suggest("", row.key)}
            onSearch={(text) => suggest(text, row.key)}
            onClear={() => patchRow(row.key, { serial: "", info: null, start: undefined, months: undefined })}
            onChange={(value: string) => { const st = suggestions.find((x) => x.SerialNo === value); if (st) chooseSerial(row.key, st); }}
            labelRender={(p) => <span className="font-mono font-semibold">{p.value}</span>}
            options={suggestions.map((st) => ({
              value: st.SerialNo,
              label: (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-semibold text-slate-800">{st.SerialNo}</span>
                  <Tag color={catOf(st.Category).tag} className="m-0 text-[10px]">{st.Category}</Tag>
                  <span className="truncate text-xs text-slate-500">{st.ModelName}</span>
                </div>
              ),
            }))}
          />
          <div className="reg-unit-meta">
            {row.info === "loading" ? <span className="text-xs text-slate-400">Checking the Serial Register…</span>
              : !info ? <span className="text-xs text-slate-400">Pump, motor or controller serial from the Serial Register</span>
              : info.status === "unknown" ? <span className="text-xs font-semibold text-red-600">Not in the Serial Register — check the number</span>
              : info.status === "registered" ? <span className="text-xs font-semibold text-red-600">Already registered to a customer</span>
              : <>
                  <div className="reg-unit-cat">{c?.label}</div>
                  <div className="reg-unit-model" title={info.modelName}>{info.modelName || "—"}</div>
                </>}
          </div>
          <Tooltip title={rows.length === 1 ? "At least one serial is needed" : "Remove this serial"}>
            <Button type="text" danger icon={<DeleteOutlined />} disabled={rows.length === 1}
              aria-label={`Remove serial ${index + 1}`}
              onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} />
          </Tooltip>
        </div>
        {ok && (
          <div className="reg-unit-body">
            <div>
              <span className="reg-mini-label">Warranty starts</span>
              <SmartDatePicker value={start} allowClear={false} placeholder="Start date" disabledDate={(d) => d.isAfter(dayjs(), "day")}
                onChange={(d: any) => patchRow(row.key, { start: d })} />
              <span className="reg-source"><CalendarOutlined /> {source}</span>
            </div>
            <div>
              <span className="reg-mini-label">Warranty period</span>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented value={months} options={[{ label: "2 Years", value: 24 }, { label: "5 Years", value: 60 }]}
                  onChange={(v) => patchRow(row.key, { months: Number(v) })} />
                <InputNumber min={1} max={120} value={months} suffix="months" style={{ width: 130 }}
                  onChange={(v) => patchRow(row.key, { months: Number(v) || 24 })} />
              </div>
              <span className="reg-source">Model default {spanText(info?.months || 24)}</span>
            </div>
            <div className="reg-end">
              <span>Warranty ends</span>
              <strong>{fmt(end)}</strong>
              <span>{spanText(months)} cover</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Page header (same as other pages) with live step progress */}
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <SafetyCertificateFilled className="text-blue-600" />
            Register Solar Pump Installation &amp; Warranties
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Pick the pump set serials, add the customer and site, and every component gets its own warranty.</p>
        </div>
        <ol className="reg-steps" aria-label="Registration progress">
          {steps.map((s, i) => (
            <li key={s.label} className={`reg-step ${s.done ? "is-done" : ""} ${s.warn ? "is-warn" : ""} ${s.ready ? "is-ready" : ""}`}>
              <span className="reg-step-dot">{s.done ? <CheckOutlined /> : s.warn ? "!" : i + 1}</span>
              <span className="min-w-0">
                <span className="reg-step-label">{s.label}</span>
                <span className="reg-step-hint">{s.hint}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          installDate: dayjs(),
          borewellDepthM: 60,
          dynamicHeadM: 45,
          panelKwp: "3.0",
          language: "EN",
          consent: true,
        }}
        requiredMark
        className="entry-form-compact"
      >
        <div className="reg-layout">
          <div className="min-w-0">
            {/* Section 1: product serials — any mix of pump / motor / controller, add or remove rows */}
            <FormSection
              number={<BarcodeOutlined />}
              title="Product serial numbers"
              description="Pump, motor and controller of the set. Each one gets its own warranty, starting from its manufacturing date."
              extra={okRows.length > 1 ? (
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="hidden sm:inline">Set all to</span>
                  <Segmented size="small" value={okRows.every((r) => monthsOf(r) === 24) ? 24 : okRows.every((r) => monthsOf(r) === 60) ? 60 : undefined as any}
                    options={[{ label: "2 Years", value: 24 }, { label: "5 Years", value: 60 }]}
                    onChange={(v) => setRows((rs) => rs.map((r) => (isOk(r) ? { ...r, months: Number(v) } : r)))} />
                </span>
              ) : undefined}
            >
              <div className="reg-units pb-4">
                {rows.map(renderUnit)}
                <Button className="reg-add" icon={<PlusOutlined />} onClick={() => setRows((rs) => [...rs, newRow()])}>Add another serial</Button>
              </div>
            </FormSection>

            {/* Section 2: Customer details */}
            <FormSection number={<UserOutlined />} title="Customer details" description="Type the mobile number first — an existing customer's details fill in automatically.">
              {customerNote && (
                <div className="reg-found verify-pop"><CheckCircleFilled /> {customerNote}</div>
              )}
              <div className="form-grid form-grid-three">
                <Form.Item
                  name="mobile"
                  label={fieldLabel("Mobile Number")}
                  rules={[{ required: true, message: "Mobile number is required" }, { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit mobile number" }]}
                >
                  <Input prefix={<PhoneOutlined className="text-slate-400" />} placeholder="e.g. 9810101001" maxLength={10} inputMode="numeric" onChange={(e) => onMobileChange(e.target.value.trim())} />
                </Form.Item>
                <Form.Item name="customerName" label={fieldLabel("Customer Name")} rules={[{ required: true, message: "Customer name is required" }, { max: 120 }]}>
                  <Input prefix={<UserOutlined className="text-slate-400" />} placeholder="e.g. Ramesh Kumar Patel" />
                </Form.Item>
                <Form.Item name="language" label={fieldLabel("Preferred Language")}>
                  <Select options={[{ value: "EN", label: "English" }, { value: "HI", label: "Hindi" }, { value: "GU", label: "Gujarati" }]} />
                </Form.Item>
              </div>

              <Form.Item name="siteAddress" label={fieldLabel("Address")} rules={[{ required: true, message: "Address is required" }, { max: 300 }]}>
                <Input prefix={<EnvironmentOutlined className="text-slate-400" />} placeholder="Khet / farm location, landmarks..." />
              </Form.Item>

              <div className="form-grid form-grid-three">
                <Form.Item name="village" label={fieldLabel("Village / Area")}>
                  <Input placeholder="e.g. Sikri Kalan" maxLength={100} />
                </Form.Item>
                <Form.Item name="stateId" label={fieldLabel("State")} rules={[{ required: true, message: "State is required" }]}>
                  <Select placeholder="Select state" showSearch optionFilterProp="label" onChange={() => form.setFieldValue("district", undefined)}
                    options={states.map((s) => ({ value: s.StateId, label: s.StateName }))} />
                </Form.Item>
                <Form.Item name="district" label={fieldLabel("District")} rules={[{ required: true, message: "District is required" }]}>
                  <DistrictSelect stateField="stateId" />
                </Form.Item>
                <Form.Item name="pincode" label={fieldLabel("Pincode")} rules={[{ required: true, message: "Pincode is required" }, { pattern: /^\d{6}$/, message: "Pincode must be 6 digits" }]}>
                  <Input placeholder="e.g. 250103" maxLength={6} inputMode="numeric" />
                </Form.Item>
                <Form.Item name="email" label={fieldLabel("Email")} rules={[{ type: "email", message: "Email address is invalid" }]}>
                  <Input placeholder="optional" maxLength={120} />
                </Form.Item>
              </div>
            </FormSection>

            {/* Section 3: Installation */}
            <FormSection number={<EnvironmentOutlined />} title="Installation" description="When and where the set was installed, the sale invoice and the site specifications.">
              <div className="reg-subhead">Sale</div>
              <div className="form-grid form-grid-three">
                <Form.Item
                  name="installDate"
                  label={fieldLabel("Date of Installation / Invoice")}
                  rules={[{ required: true, message: "Installation date is required" }]}
                  extra={<span className="text-[11px]">Warranty start for serials without a manufacturing date</span>}
                >
                  <SmartDatePicker placeholder="Select or type date" disabledDate={(d) => d.isAfter(dayjs(), "day")} />
                </Form.Item>
                <Form.Item name="invoiceNo" label={fieldLabel("Invoice No")}>
                  <Input placeholder="e.g. INV-1001" maxLength={60} />
                </Form.Item>
                {!isDealerLogin && (
                  <Form.Item name="dealerId" label={fieldLabel("Purchased From Dealer")}>
                    <Select allowClear showSearch optionFilterProp="label" placeholder="— direct / not listed —"
                      options={dealers.filter((d) => d.Status === "Approved" || d.DealerId === form.getFieldValue("dealerId")).map((d) => ({ value: d.DealerId, label: `${d.FirmName}${d.DealerCode ? ` (${d.DealerCode})` : ""}` }))} />
                  </Form.Item>
                )}
              </div>

              <div className="reg-subhead">Site specifications</div>
              <div className="form-grid form-grid-three">
                <Form.Item name="borewellDepthM" label={fieldLabel("Borewell Depth")}>
                  <Input type="number" min={0} placeholder="60" suffix={<span className="text-xs text-slate-400">m</span>} />
                </Form.Item>
                <Form.Item name="dynamicHeadM" label={fieldLabel("Dynamic Head")}>
                  <Input type="number" min={0} placeholder="45" suffix={<span className="text-xs text-slate-400">m</span>} />
                </Form.Item>
                <Form.Item name="panelKwp" label={fieldLabel("Solar Array")}>
                  <Input placeholder="3.0" suffix={<span className="text-xs text-slate-400">kWp</span>} />
                </Form.Item>
                <Form.Item name="projectId" label={fieldLabel("Project / Scheme")}>
                  <Select allowClear placeholder="Select Project" options={projects.map((p) => ({ value: p.ProjectId, label: p.ProjectName }))} />
                </Form.Item>
              </div>

              <div className="reg-consent mb-4">
                <WhatsAppOutlined className="text-xl text-emerald-600" />
                <Form.Item name="consent" valuePropName="checked" className="!mb-0">
                  <Checkbox>I agree to the privacy policy and want warranty updates on WhatsApp / SMS</Checkbox>
                </Form.Item>
              </div>
            </FormSection>
          </div>

          {/* Live warranty card preview + submit */}
          <aside className="reg-aside">
            <div className="reg-cert">
              <div className="reg-cert-top">
                <div className="reg-cert-brand"><span><SafetyCertificateFilled /> Warranty card</span><span>Preview</span></div>
                <div className={`reg-cert-name ${customerNameValue ? "" : "is-placeholder"}`}>{String(customerNameValue || "").trim() || "Customer name"}</div>
                <div className="reg-cert-sub">
                  <span><PhoneOutlined /> {mobileValue ? `+91 ${mobileValue}` : "Mobile"}</span>
                  <span><EnvironmentOutlined /> {[villageValue, districtValue, stateName].filter(Boolean).join(", ") || "Location"}</span>
                </div>
              </div>
              <div className="reg-cert-body">
                {okRows.length === 0 ? (
                  <div className="reg-cert-empty"><BarcodeOutlined className="text-lg" /><div className="mt-1">Components appear here as you pick serials</div></div>
                ) : okRows.map((r) => {
                  const info = r.info as SerialInfo, c = catOf(info.category), s = startOf(r), m = monthsOf(r), e = s ? s.add(m, "month") : null;
                  return (
                    <div key={r.key} className="reg-cert-item verify-pop" style={{ ["--cat" as any]: c.color, ["--cat-bg" as any]: c.bg }}>
                      <div className="reg-unit-icon reg-unit-icon-sm"><CategoryIcon category={info.category} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-[13px] font-bold text-slate-900 truncate">{r.serial}</span>
                          <span className="text-[11px] font-bold shrink-0" style={{ color: c.color }}>{spanText(m)}</span>
                        </div>
                        <div className="reg-bar"><i style={{ width: `${Math.max(8, (m / maxMonths) * 100)}%` }} /></div>
                        <div className="mt-1 text-[11px] text-slate-500">{fmt(s)} → <span className="font-semibold text-emerald-700">{fmt(e)}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="reg-cert-foot">
                <div><span className="reg-mini-label">Installed</span><span className="text-xs font-semibold text-slate-800">{installDateValue ? fmt(dayjs(installDateValue)) : "—"}</span></div>
                <div className="min-w-0"><span className="reg-mini-label">Dealer</span><span className="block truncate text-xs font-semibold text-slate-800">{isDealerLogin ? "Your dealership" : dealerName || "Direct"}</span></div>
              </div>
            </div>

            <div className="reg-check">
              <div className="reg-mini-label">Before you register</div>
              <ul>
                <li className={serialsDone ? "is-done" : ""}>{serialsDone ? <CheckCircleFilled /> : <span className="reg-check-dot" />} At least one valid serial{badCount ? ` (${badCount} to fix)` : ""}</li>
                <li className={customerDone ? "is-done" : ""}>{customerDone ? <CheckCircleFilled /> : <span className="reg-check-dot" />} Customer mobile, name and address</li>
                <li className={installDone ? "is-done" : ""}>{installDone ? <CheckCircleFilled /> : <span className="reg-check-dot" />} Installation date</li>
                <li className={consentValue ? "is-done" : ""}>{consentValue ? <CheckCircleFilled /> : <span className="reg-check-dot" />} WhatsApp / SMS updates {consentValue ? "on" : "off"}</li>
              </ul>
            </div>

            <Button type="primary" htmlType="submit" size="large" block loading={submitting || isLoading}
              icon={<SafetyCertificateFilled />} className={`reg-submit ${allDone ? "is-ready" : ""}`}>
              Register Installation{okRows.length ? ` · ${okRows.length} warrant${okRows.length === 1 ? "y" : "ies"}` : ""}
            </Button>
            <Button block icon={<ReloadOutlined />} onClick={resetAll}>Reset Form</Button>
          </aside>
        </div>
      </Form>
    </div>
  );
}
