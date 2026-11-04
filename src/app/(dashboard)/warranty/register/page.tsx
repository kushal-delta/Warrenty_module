"use client";

import { DistrictSelect } from "@/components/common/DistrictSelect";
import React, { useEffect, useRef, useState } from "react";
import {
  Form,
  Input,
  Select,
  Button,
  Card,
  Alert,
  Divider,
  Tag,
  message,
  Result,
  AutoComplete,
  Checkbox,
} from "antd";
import {
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  ShopOutlined,
  ArrowRightOutlined,
  UserOutlined,
  EnvironmentOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useWarrantyStore } from "@/lib/store/useWarrantyStore";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { SmartDatePicker } from "@/components/ui/smart-date-picker";
import { reportFormError } from "@/lib/utils/formErrors";
import Link from "next/link";
import dayjs from "dayjs";
import axios from "axios";

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
  const lookupCustomer = async (mobile: string) => {
    if (!/^[6-9]\d{9}$/.test(mobile) || mobile === lastMobile.current) return;
    lastMobile.current = mobile;
    try {
      const data = (await axios.post("/api/warranty/installations/lookup-customer", { mobile })).data;
      if (!data.found) { setCustomerNote(null); return; }
      const c = data.customer;
      form.setFieldsValue({ customerName: c.CustomerName, email: c.Email || undefined, language: c.Language || "EN", siteAddress: c.Address || undefined, village: c.Village || undefined, stateId: c.StateId || undefined, district: c.District || undefined, pincode: c.Pincode || undefined });
      setCustomerNote(`Existing customer loaded — ${c.CustomerName}`);
    } catch { setCustomerNote(null); }
  };

  const [submittedResult, setSubmittedResult] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Product serial numbers — any mix of pump / motor / controller, each with its own warranty (prototype layout).
   * Every serial is looked up in the Serial Register: its type, model and warranty months come from there.
   */
  interface SerialInfo { status: "ok" | "registered" | "unknown"; category?: string; modelName?: string; modelId?: string; months?: number }
  interface SerialRow { key: string; serial: string; info: SerialInfo | "loading" | null }
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
          months: Number(model?.WarrantyMonths) || (sticker.Category === "CONTROLLER" ? 36 : 24),
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
      info: { status: "ok", category: sticker.Category, modelName: sticker.ModelName || model?.ModelName, modelId: sticker.ProductModelId, months: Number(model?.WarrantyMonths) || (sticker.Category === "CONTROLLER" ? 36 : 24) },
    } : r)));
  };
  const infoText = (row: SerialRow) => {
    if (row.info === "loading") return <span className="text-xs text-slate-400">Checking…</span>;
    if (!row.info) return <span className="text-xs text-slate-400">Pump, motor or controller serial</span>;
    if (row.info.status === "unknown") return <span className="text-xs text-red-600">Not in the Serial Register — check the number</span>;
    const tag = <Tag color={row.info.category === "PUMP" ? "blue" : row.info.category === "MOTOR" ? "cyan" : "purple"} className="m-0">{row.info.category}</Tag>;
    if (row.info.status === "registered") return <span className="text-xs text-red-600 flex items-center gap-2">{tag} Already registered to a customer</span>;
    return <span className="text-xs text-slate-600 flex flex-wrap items-center gap-2">{tag}<span>{row.info.modelName || "—"}</span><span className="text-emerald-700">· {row.info.months} months warranty</span></span>;
  };

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
      const components = checked.map(({ row, info }) => ({ serialNo: row.serial.trim().toUpperCase(), category: info!.category, productModelId: info!.modelId, warrantyMonths: info!.months }));

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
      setSubmittedResult(result);
      message.success("Installation and warranties registered successfully!");
    } catch (err: any) {
      reportFormError(err, { form, fallback: "Failed to register installation and warranties" });
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedResult) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <Card className="shadow-lg border-slate-200 rounded-2xl p-6 text-center">
          <Result
            status="success"
            title="Warranty Successfully Registered!"
            subTitle={`Installation Reference: ${submittedResult.installation?.InstallNo}`}
            extra={[
              <Link key="active" href="/warranty/active">
                <Button type="primary" size="large" className="bg-blue-600">
                  View in Active Warranties
                </Button>
              </Link>,
              <Button
                key="new"
                size="large"
                onClick={() => {
                  setSubmittedResult(null);
                  form.resetFields();
                }}
              >
                Register Another Installation
              </Button>,
            ]}
          />

          <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-left">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Registered Component Warranties:
            </h4>
            <div className="space-y-2">
              {submittedResult.warranties?.map((w: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 text-sm"
                >
                  <div className="flex items-center space-x-2">
                    <Tag color="blue">{w.Category}</Tag>
                    <span className="font-mono font-bold text-slate-800">{w.SerialNo}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Warranty No: <span className="font-semibold text-slate-700">{w.WarrantyNo}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <SafetyCertificateOutlined className="text-blue-600" />
            Register Solar Pump Installation & Warranties
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Add customer and site details, then register the pump, motor, and controller warranties.
          </p>
        </div>
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
      >
        {/* Section 1: product serials — any mix of pump / motor / controller, add or remove rows */}
        <Card
          title={
            <div className="flex flex-wrap items-center gap-2 text-slate-800 text-sm font-bold">
              <ThunderboltOutlined className="text-blue-600" />
              <span>1. Product Serial Numbers</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pump, motor and controller of the set — each has its own warranty</span>
            </div>
          }
          className="shadow-xs border-slate-200 rounded-xl"
        >
          <div className="space-y-2.5">
            {rows.map((row, index) => (
              <div key={row.key} className="flex flex-wrap md:flex-nowrap items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700 border border-teal-100">{index + 1}</span>
                <Select
                  showSearch
                  allowClear
                  className="w-full md:w-80 shrink-0"
                  placeholder="Search / scan serial no"
                  value={row.serial || undefined}
                  filterOption={false}
                  loading={searching}
                  notFoundContent={searching ? "Searching…" : "No free serial found"}
                  onFocus={() => suggest("", row.key)}
                  onSearch={(text) => suggest(text, row.key)}
                  onClear={() => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, serial: "", info: null } : r)))}
                  onChange={(value: string) => { const st = suggestions.find((x) => x.SerialNo === value); if (st) chooseSerial(row.key, st); }}
                  labelRender={(p) => <span className="font-mono">{p.value}</span>}
                  options={suggestions.map((st) => ({
                    value: st.SerialNo,
                    label: (
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-semibold text-slate-800">{st.SerialNo}</span>
                        <Tag color={st.Category === "PUMP" ? "blue" : st.Category === "MOTOR" ? "cyan" : "purple"} className="m-0 text-[10px]">{st.Category}</Tag>
                        <span className="truncate text-xs text-slate-500">{st.ModelName}</span>
                      </div>
                    ),
                  }))}
                />
                <div className="flex-1 min-w-0">{infoText(row)}</div>
                <Button type="text" danger icon={<DeleteOutlined />} disabled={rows.length === 1}
                  aria-label={`Remove serial ${index + 1}`}
                  onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} />
              </div>
            ))}
            <Button icon={<PlusOutlined />} onClick={() => setRows((rs) => [...rs, newRow()])} className="mt-1">Add another serial</Button>
            <p className="text-[11px] text-slate-400 pt-1">At least one serial is needed. The type, model and warranty period come from the Serial Register; free serials are suggested as you type.</p>
          </div>
        </Card>

        {/* Section 2: Customer details (prototype order: serials → customer → installation) */}
        <Card
          title={
            <div className="flex items-center space-x-2 text-slate-800 text-sm font-bold">
              <UserOutlined className="text-blue-600" />
              <span>2. Customer Details</span>
            </div>
          }
          className="shadow-xs border-slate-200 rounded-xl mt-4"
        >
          <div className="form-grid form-grid-three">
            <Form.Item
              name="mobile"
              label={<span className="text-xs font-semibold text-slate-700">Mobile Number</span>}
              rules={[{ required: true, message: "Mobile number is required" }, { pattern: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit mobile number" }]}
              extra={<span className="text-[11px]">{customerNote || "Existing customers are filled in automatically"}</span>}
            >
              <Input placeholder="e.g. 9810101001" maxLength={10} inputMode="numeric" onChange={(e) => lookupCustomer(e.target.value.trim())} />
            </Form.Item>

            <Form.Item
              name="customerName"
              label={<span className="text-xs font-semibold text-slate-700">Customer Name</span>}
              rules={[{ required: true, message: "Customer name is required" }, { max: 120 }]}
            >
              <Input placeholder="e.g. Ramesh Kumar Patel" />
            </Form.Item>

            <Form.Item
              name="language"
              label={<span className="text-xs font-semibold text-slate-700">Preferred Language</span>}
            >
              <Select options={[{ value: "EN", label: "English" }, { value: "HI", label: "Hindi" }, { value: "GU", label: "Gujarati" }]} />
            </Form.Item>
          </div>

          <Form.Item
            name="siteAddress"
            label={<span className="text-xs font-semibold text-slate-700">Address</span>}
            rules={[{ required: true, message: "Address is required" }, { max: 300 }]}
          >
            <Input placeholder="Khet / farm location, landmarks..." />
          </Form.Item>

          <div className="form-grid form-grid-three">
            <Form.Item
              name="village"
              label={<span className="text-xs font-semibold text-slate-700">Village / Area</span>}
            >
              <Input placeholder="e.g. Sikri Kalan" maxLength={100} />
            </Form.Item>

            <Form.Item
              name="stateId"
              label={<span className="text-xs font-semibold text-slate-700">State</span>}
              rules={[{ required: true, message: "State is required" }]}
            >
              <Select placeholder="Select state" showSearch optionFilterProp="label" onChange={() => form.setFieldValue("district", undefined)}
                options={states.map((s) => ({ value: s.StateId, label: s.StateName }))} />
            </Form.Item>

            <Form.Item
              name="district"
              label={<span className="text-xs font-semibold text-slate-700">District</span>}
              rules={[{ required: true, message: "District is required" }]}
            ><DistrictSelect stateField="stateId" />
            </Form.Item>

            <Form.Item
              name="pincode"
              label={<span className="text-xs font-semibold text-slate-700">Pincode</span>}
              rules={[{ required: true, message: "Pincode is required" }, { pattern: /^\d{6}$/, message: "Pincode must be 6 digits" }]}
            >
              <Input placeholder="e.g. 250103" maxLength={6} inputMode="numeric" />
            </Form.Item>

            <Form.Item
              name="email"
              label={<span className="text-xs font-semibold text-slate-700">Email</span>}
              rules={[{ type: "email", message: "Email address is invalid" }]}
            >
              <Input placeholder="optional" maxLength={120} />
            </Form.Item>
          </div>
        </Card>

        {/* Section 3: Installation */}
        <Card
          title={
            <div className="flex items-center space-x-2 text-slate-800 text-sm font-bold">
              <EnvironmentOutlined className="text-blue-600" />
              <span>3. Installation</span>
            </div>
          }
          className="shadow-xs border-slate-200 rounded-xl mt-4"
        >
          <div className="form-grid form-grid-three">
            <Form.Item
              name="installDate"
              label={<span className="text-xs font-semibold text-slate-700">Date of Installation / Invoice</span>}
              rules={[{ required: true, message: "Installation date is required" }]}
              extra={<span className="text-[11px]">Warranty starts from this date</span>}
            >
              <SmartDatePicker placeholder="Select or type date" disabledDate={(d) => d.isAfter(dayjs(), "day")} />
            </Form.Item>

            <Form.Item
              name="invoiceNo"
              label={<span className="text-xs font-semibold text-slate-700">Invoice No</span>}
            >
              <Input placeholder="e.g. INV-1001" maxLength={60} />
            </Form.Item>

            {!isDealerLogin && (
              <Form.Item
                name="dealerId"
                label={<span className="text-xs font-semibold text-slate-700">Purchased From Dealer</span>}
              >
                <Select allowClear showSearch optionFilterProp="label" placeholder="— direct / not listed —"
                  options={dealers.filter((d) => d.Status === "Approved" || d.DealerId === form.getFieldValue("dealerId")).map((d) => ({ value: d.DealerId, label: `${d.FirmName}${d.DealerCode ? ` (${d.DealerCode})` : ""}` }))} />
              </Form.Item>
            )}

            <Form.Item
              name="borewellDepthM"
              label={<span className="text-xs font-semibold text-slate-700">Borewell Depth (m)</span>}
            >
              <Input type="number" min={0} placeholder="60" />
            </Form.Item>

            <Form.Item
              name="dynamicHeadM"
              label={<span className="text-xs font-semibold text-slate-700">Dynamic Head (m)</span>}
            >
              <Input type="number" min={0} placeholder="45" />
            </Form.Item>

            <Form.Item
              name="panelKwp"
              label={<span className="text-xs font-semibold text-slate-700">Solar Array (kWp)</span>}
            >
              <Input placeholder="3.0" />
            </Form.Item>

            <Form.Item
              name="projectId"
              label={<span className="text-xs font-semibold text-slate-700">Project / Scheme</span>}
            >
              <Select allowClear placeholder="Select Project" options={projects.map((p) => ({ value: p.ProjectId, label: p.ProjectName }))} />
            </Form.Item>
          </div>

          <Form.Item name="consent" valuePropName="checked" className="!mb-0">
            <Checkbox>I agree to the privacy policy and want warranty updates on WhatsApp / SMS</Checkbox>
          </Form.Item>
        </Card>

        <div className="form-actions">
          <Button size="large" onClick={() => { form.resetFields(); setRows([newRow(), newRow()]); setSuggestions([]); }}>
            Reset Form
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            loading={submitting || isLoading}
            className="bg-blue-600 shadow-md font-semibold px-8"
          >
            Register Installation
          </Button>
        </div>
      </Form>
    </div>
  );
}
