"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Empty, Skeleton, Typography } from "antd";
import { BankOutlined, EnvironmentOutlined, PhoneOutlined, ReloadOutlined, SafetyCertificateOutlined, GlobalOutlined } from "@ant-design/icons";
import type { ErpCompany } from "@/lib/services/erpCompany";

function Detail({ label, value, copy = false }: { label: string; value?: string | null; copy?: boolean }) {
  const content = value?.trim();
  return <div className="company-detail"><dt>{label}</dt><dd>{content ? <Typography.Text copyable={copy ? { text: content } : false}>{content}</Typography.Text> : <span className="company-missing">Not provided</span>}</dd></div>;
}

export default function CompanyProfilePage() {
  const [company, setCompany] = useState<ErpCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/masters/company/get", { method: "POST", signal: controller.signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load company details.");
      setCompany(result.company);
      setFetchedAt(result.fetchedAt);
    } catch (err: any) {
      if (!controller.signal.aborted) setError(err.message || "Unable to load company details. Please try again.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); return () => active.current?.abort(); }, [load]);
  return <div className="space-y-6 company-profile">
    <div className="page-header"><div><h1 className="text-xl font-bold text-slate-900">Company Profile</h1><p className="text-slate-500">Company identity, office location, and contact details.</p></div><div className="page-actions"><Button icon={<ReloadOutlined />} loading={loading} onClick={load}>Refresh</Button></div></div>
    {error && <Alert type="error" showIcon message="Company details could not be refreshed" description={<>{error}{company && <p className="mt-2">Showing the details loaded earlier in this session.</p>}</>} action={<Button onClick={load} loading={loading}>Retry</Button>} />}
    {loading && !company ? <Card><Skeleton active paragraph={{ rows: 7 }} /></Card> : company ? <>
      <section className="company-hero">
        <div className="company-emblem"><BankOutlined /></div>
        <div className="company-hero-copy"><span className="company-eyebrow">COMPANY OVERVIEW</span><h2>{company.CompanyName || "Company name not provided"}</h2><p><EnvironmentOutlined /> {[company.City, company.State, company.Country].filter(Boolean).join(" · ") || "Location not provided"}</p></div>
        <div className="company-source">{fetchedAt && <span>Last refreshed {new Date(fetchedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>}</div>
      </section>
      <div className="company-card-grid">
        <Card title={<span><SafetyCertificateOutlined className="text-blue-600 mr-2" />Legal identity</span>}><dl className="company-details"><Detail label="Registered company name" value={company.CompanyName} /><Detail label="GSTIN" value={company.Gstin} copy /><Detail label="Corporate identification number (CIN)" value={company.Cin} copy /></dl></Card>
        <Card title={<span><PhoneOutlined className="text-blue-600 mr-2" />Contact information</span>}><dl className="company-details"><Detail label="Office phone" value={company.Phone} copy /><Detail label="Mobile" value={company.Mobile} copy /><Detail label="Company email" value={company.Email} copy /><Detail label="Service email" value={company.ServiceEmail} copy /></dl></Card>
      </div>
      <Card title={<span><EnvironmentOutlined className="text-blue-600 mr-2" />Office address</span>}><dl className="company-address"><Detail label="Full address" value={company.Address} copy /><div className="company-location"><Detail label="City" value={company.City} /><Detail label="State" value={company.State} /><Detail label="Postal code" value={company.Pincode} /><Detail label="Country" value={company.Country} /></div></dl></Card>
      <Card title={<span><GlobalOutlined className="text-blue-600 mr-2" />Website</span>}><dl><Detail label="Official website" value={company.Website} copy /></dl></Card>
    </> : !error && <Card><Empty description="No company details are available." /></Card>}
  </div>;
}
