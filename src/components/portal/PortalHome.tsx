"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import dayjs from "dayjs";
import { Button, Empty, Form, Input, Modal, Select, Spin, Table, Tag, message } from "antd";
import { ArrowRightOutlined, PhoneOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { canUseForm } from "@/lib/auth/forms";
import { reportFormError } from "@/lib/utils/formErrors";
import { PageLoader } from "@/components/common/Loader";

const day = (v?: string) => (v ? dayjs(v).format("DD-MMM-YYYY") : "—");
const STATE_COLOR: Record<string, string> = { Active: "green", "Ending soon": "orange", Expired: "red", Replaced: "default" };

function Tile({ label, value, sub, accent, href }: { label: string; value: React.ReactNode; sub?: string; accent: string; href?: string }) {
  const body = (
    <div className="group bg-white rounded-xl border border-slate-200 shadow-xs px-4 py-3.5 h-full hover:shadow-md transition-all" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
        {href && <ArrowRightOutlined className="text-xs text-teal-600 opacity-60 group-hover:opacity-100" />}
      </div>
      <div className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-none">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-2">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

function NotLinked({ portal }: { portal: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-10">
      <Empty description={
        <span className="text-slate-600">
          Your login is not linked to a {portal === "DEALER" ? "dealer" : "customer"} record yet.<br />
          Ask head office to link it in User Management ({portal === "DEALER" ? "user name = your dealer code" : "user name = your registered mobile number"}).
        </span>} />
    </div>
  );
}

/** "Dealer Dashboard": own pump sets, warranties ending, open calls and latest installations. */
function DealerHome({ data, reload, loading }: { data: any; reload: () => void; loading: boolean }) {
  const user = useAuthStore((s) => s.user);
  const k = data.kpis || {};
  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Dealer Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">{data.dealer?.FirmName}{data.dealer?.DealerCode ? ` · dealer code ${data.dealer.DealerCode}` : ""}</p>
        </div>
        <div className="page-actions">
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>Refresh</Button>
          {canUseForm(user, "service.complaints") && <Link href="/service/complaints"><Button icon={<PhoneOutlined />}>Book Service Call</Button></Link>}
          {canUseForm(user, "warranty.register") && <Link href="/warranty/register"><Button type="primary" icon={<PlusOutlined />} className="bg-blue-600">Register Warranty</Button></Link>}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Tile label="Pump sets registered" value={k.PumpSets ?? 0} sub={`${k.Serials ?? 0} serials`} accent="#0d9488" href={canUseForm(user, "warranty.active") ? "/warranty/active" : undefined} />
        <Tile label="Serials in warranty" value={k.ActiveSerials ?? 0} sub="active today" accent="#16a34a" href={canUseForm(user, "warranty.active") ? "/warranty/active" : undefined} />
        <Tile label="Warranty ending in 45 days" value={k.Ending45 ?? 0} accent="#f59e0b" />
        <Tile label="Open service calls" value={k.OpenCalls ?? 0} sub={`${k.TotalCalls ?? 0} in total`} accent="#2563eb" href={canUseForm(user, "service.complaints") ? "/service/complaints" : undefined} />
      </div>
      <section className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <header className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-bold text-slate-900">My latest installations</h2></header>
        <Table size="middle" rowKey="InstallationId" dataSource={data.installations || []} pagination={false} scroll={{ x: 640 }} locale={{ emptyText: "No installations registered yet" }}
          columns={[
            { title: "Installation", dataIndex: "InstallNo", render: (v: string) => <b>{v}</b> },
            { title: "Date", dataIndex: "InstallDate", render: (v: string) => day(v) },
            { title: "Customer", dataIndex: "CustomerName", render: (v: string, r: any) => <div>{v}<div className="text-[11px] text-slate-400 font-mono">{r.Mobile}</div></div> },
            { title: "Place", key: "place", render: (_: any, r: any) => [r.Village, r.District].filter(Boolean).join(", ") || "—" },
            { title: "Serials", dataIndex: "Serials", align: "right" as const },
          ]} />
      </section>
    </div>
  );
}

/** "My Products": each pump set with its pump / motor / controller warranty, warranty card and service-call booking. */
function CustomerHome({ data, reload, loading }: { data: any; reload: () => void; loading: boolean }) {
  const user = useAuthStore((s) => s.user);
  const callTypes = useMasterStore((s) => s.callTypes);
  const [form] = Form.useForm();
  const [raising, setRaising] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const canBook = canUseForm(user, "service.complaints");

  const openRaise = (product: any) => {
    const inWarranty = product.WarrantyStatus === "In Warranty";
    const type = callTypes.find((t: any) => t.IsActive && Boolean(t.IsWarranty) === inWarranty) || callTypes.find((t: any) => t.IsActive);
    form.resetFields();
    form.setFieldsValue({ callTypeId: type?.CallTypeId });
    setRaising(product);
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const c = data.customer || {};
      const res = await axios.post("/api/service/complaints/add", {
        callDate: new Date().toISOString(), callTypeId: values.callTypeId, priority: "Medium", source: "Customer Portal",
        installationId: raising.InstallationId, customerId: c.CustomerId, customerName: c.CustomerName, mobile: c.Mobile,
        address: raising.SiteAddress, village: raising.Village, district: raising.District, stateId: raising.StateId, pincode: raising.Pincode,
        dealerId: raising.DealerId, warrantyStatus: raising.WarrantyStatus, complaintText: values.complaintText,
        components: (raising.Parts || []).map((p: any) => ({ category: p.Category, serialNo: p.SerialNo })),
      });
      message.success(`Service call ${res.data.complaint?.ComplaintNo || ""} booked — our team will contact you`);
      setRaising(null);
      reload();
    } catch (err) {
      reportFormError(err, { form, fallback: "Could not book the service call" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">My Products</h1>
          <p className="text-xs text-slate-500 mt-0.5">Namaste {data.customer?.CustomerName} · {data.customer?.Mobile}{data.openCalls ? ` · ${data.openCalls} open service call${data.openCalls > 1 ? "s" : ""}` : ""}</p>
        </div>
        <div className="page-actions">
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>Refresh</Button>
          {canUseForm(user, "warranty.register") && <Link href="/warranty/register"><Button type="primary" icon={<PlusOutlined />} className="bg-blue-600">Register Product</Button></Link>}
        </div>
      </div>

      {!(data.products || []).length && <div className="bg-white rounded-xl border border-slate-200 p-10"><Empty description="No products registered on your mobile number yet" /></div>}

      {(data.products || []).map((p: any) => (
        <section key={p.InstallationId} className="bg-white rounded-xl border border-slate-200 shadow-xs">
          <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">{p.Title}</h2>
            <span className="text-xs text-slate-400">installed {day(p.InstallDate)} · {p.InstallNo}</span>
          </header>
          <div className="p-5 space-y-4">
            <p className="text-xs text-slate-500">{[p.Village, p.District, p.StateName].filter(Boolean).join(", ")}{p.DealerName ? ` · dealer: ${p.DealerName}` : ""}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {p.Parts.map((w: any) => (
                <div key={w.WarrantyId} className="rounded-lg border border-slate-200 px-4 py-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{w.Category}</div>
                  <div className="font-mono font-semibold text-slate-900 mt-1">{w.SerialNo}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate" title={w.ModelName}>{w.ModelName || "—"}</div>
                  <Tag color={STATE_COLOR[w.State] || "default"} className="mt-2">{w.State}</Tag>
                  <div className="text-xs text-slate-400 mt-1">till {day(w.EndDate)}</div>
                </div>
              ))}
              {!p.Parts.length && <span className="text-xs text-slate-400">No serials on this installation</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {p.Parts[0] && canUseForm(user, "warranty.verify") && <Link href={`/warranty/verify?serial=${encodeURIComponent(p.Parts[0].SerialNo)}`}><Button icon={<PrinterOutlined />}>Warranty card</Button></Link>}
              {canBook && <Button type="primary" icon={<PhoneOutlined />} className="bg-teal-600" onClick={() => openRaise(p)}>Raise service call</Button>}
            </div>
          </div>
        </section>
      ))}

      <Modal open={!!raising} title={`Raise service call — ${raising?.Title || ""}`} onCancel={() => setRaising(null)} onOk={submit} confirmLoading={saving} okText="Book Service Call" destroyOnClose>
        <Form form={form} layout="vertical" className="pt-2">
          <p className="text-xs text-slate-500 mb-3">{raising?.WarrantyStatus} · {[raising?.Village, raising?.District].filter(Boolean).join(", ")}</p>
          <Form.Item name="callTypeId" label="Type of call" rules={[{ required: true, message: "Select the type of call" }]}>
            <Select options={callTypes.filter((t: any) => t.IsActive).map((t: any) => ({ value: t.CallTypeId, label: t.CallTypeName }))} />
          </Form.Item>
          <Form.Item name="complaintText" label="What is the problem?" rules={[{ required: true, message: "Describe the problem" }, { max: 1000 }]}>
            <Input.TextArea rows={4} placeholder="e.g. Pump not starting in the morning, controller shows a fault light" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/** Home page for dealer and customer logins. */
export function PortalHome({ portal }: { portal: "DEALER" | "CUSTOMER" }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData((await axios.post("/api/dashboard/portal", {})).data); }
    catch (err) { reportFormError(err, { fallback: "Could not load your dashboard" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) return <PageLoader label={portal === "DEALER" ? "Loading your dealer dashboard…" : "Loading your products…"} minHeight="60vh" />;
  if (!data.linked) return <NotLinked portal={portal} />;
  return data.portal === "DEALER" ? <DealerHome data={data} reload={load} loading={loading} /> : <CustomerHome data={data} reload={load} loading={loading} />;
}
