"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import dayjs from "dayjs";
import { Button, Empty, Tag } from "antd";
import { InboxOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/lib/store/useAuthStore";
import { canUseForm } from "@/lib/auth/forms";
import { PageLoader } from "@/components/common/Loader";

const qty = (n: unknown) => Number(Number(n || 0).toFixed(3)).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const inrShort = (v: number) => v >= 1e7 ? `₹ ${(v / 1e7).toFixed(1)} Cr` : v >= 1e5 ? `₹ ${(v / 1e5).toFixed(1)} L` : v >= 1e3 ? `₹ ${(v / 1e3).toFixed(1)} K` : `₹ ${Math.round(v)}`;
const STATUS_COLOR: Record<string, string> = { OK: "green", "Over maximum": "blue", "Below minimum": "gold", "Out of stock": "red", "No levels set": "default" };

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col min-w-0">
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {aside && <span className="text-xs text-slate-400">{aside}</span>}
      </header>
      <div className="p-5 flex-1 min-h-0">{children}</div>
    </section>
  );
}

function Kpi({ label, value, sub, accent, href }: { label: string; value: React.ReactNode; sub: string; accent: string; href?: string }) {
  const body = (
    <>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 truncate">{label}</div>
      <div className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-none">{value}</div>
      <div className="text-xs text-slate-500 mt-2 truncate">{sub}</div>
    </>
  );
  const cls = "group block bg-white rounded-xl border border-slate-200 shadow-xs px-4 py-3.5 transition-all";
  return href
    ? <Link href={href} className={`${cls} hover:shadow-md hover:border-slate-300`} style={{ borderLeft: `4px solid ${accent}` }}>{body}</Link>
    : <div className={cls} style={{ borderLeft: `4px solid ${accent}` }}>{body}</div>;
}

/** A list row that links to the screen where the user acts on it. */
function Row({ href, stripe, title, subtitle, right }: { href: string; stripe: string; title: React.ReactNode; subtitle: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 border-b border-slate-100 py-2.5 pl-3 pr-1 last:border-b-0 hover:bg-slate-50" style={{ borderLeft: `3px solid ${stripe}` }}>
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-800">{title}</div><div className="truncate text-xs text-slate-500">{subtitle}</div></div>
      {right}
      <RightOutlined className="text-[10px] text-slate-300" />
    </Link>
  );
}

/**
 * Dashboard for a warehouse login — only its own warehouse and its own entries:
 * stock position, challans to receive, returnable challans still to send back, recent receipts and own material requests.
 * Each block loads from the screen it belongs to, so a block is simply left out when that screen is not ticked for the user.
 */
export function WarehouseDashboard() {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [d, setD] = useState<{ stock: any[]; warehouses: any[]; toReceive: any[]; toReturn: any[]; receipts: any[]; requests: any[] } | null>(null);
  const can = (form: string) => canUseForm(user, form);

  const load = useCallback(async () => {
    setLoading(true);
    const call = (ok: boolean, url: string) => (ok ? axios.post(url, {}).then((r) => r.data).catch(() => null) : Promise.resolve(null));
    const [stock, toReceive, toReturn, receipts, requests] = await Promise.all([
      call(can("stock.warehouse-stock"), "/api/stock/warehouse-stock"),
      call(can("stock.grn"), "/api/stock/grn/challans"),
      call(can("stock.dcreturn"), "/api/stock/dcreturn/challans"),
      call(can("stock.grn"), "/api/stock/grn/get"),
      call(can("stock.requests"), "/api/stock/material-requests/get"),
    ]);
    setD({ stock: stock?.items || [], warehouses: stock?.warehouses || [], toReceive: toReceive?.challans || [], toReturn: toReturn?.challans || [], receipts: receipts?.receipts || [], requests: requests?.requests || [] });
    setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 120000);
    return () => clearInterval(timer);
  }, [load]);

  if (!d) return <PageLoader label="Loading your warehouse…" minHeight="60vh" />;

  const stockValue = d.stock.reduce((s, r) => s + Number(r.Closing || 0) * Number(r.Rate || 0), 0);
  const low = d.stock.filter((r) => r.Status === "Below minimum" || r.Status === "Out of stock");
  const overdueReturn = d.toReturn.filter((c) => c.ExpectedBackBy && dayjs(c.ExpectedBackBy).isBefore(dayjs(), "day"));
  const grnThisMonth = d.receipts.filter((r) => dayjs(r.ReceiptDate).isSame(dayjs(), "month"));
  const pendingRequests = d.requests.filter((r) => r.Status === "Pending");
  const whName = d.warehouses.length === 1 ? d.warehouses[0].WarehouseName : user?.FirstName;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><span className="text-blue-600"><InboxOutlined /></span>Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5 truncate"><span className="uppercase">{whName || "Warehouse"}</span> · your stock, receipts and returns · {dayjs().format("DD-MMM-YYYY")}</p>
        </div>
        <div className="page-actions"><Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button></div>
      </div>

      <div className={`space-y-4 transition-opacity ${loading ? "opacity-70" : ""}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
          <Kpi label="Stock value" value={inrShort(stockValue)} sub={`${d.stock.filter((r) => Number(r.Closing) > 0).length} items in stock`} accent="#0d9488" href={can("stock.warehouse-stock") ? "/stock/warehouse-stock" : undefined} />
          <Kpi label="Below min / out of stock" value={low.length} sub={`${d.stock.filter((r) => r.Status === "Out of stock").length} out of stock`} accent="#f59e0b" href={can("stock.warehouse-stock") ? "/stock/warehouse-stock" : undefined} />
          <Kpi label="Challans to receive" value={d.toReceive.length} sub={`${qty(d.toReceive.reduce((s, c) => s + Number(c.PendingQty || 0), 0))} qty pending`} accent="#2563eb" href={can("stock.grn") ? "/stock/grn" : undefined} />
          <Kpi label="RDC to send back" value={d.toReturn.length} sub={`${overdueReturn.length} past expected-back date`} accent="#dc2626" href={can("stock.dcreturn") ? "/stock/dcreturn" : undefined} />
          <Kpi label="Goods receipts this month" value={grnThisMonth.length} sub={`${qty(grnThisMonth.reduce((s, r) => s + Number(r.QtyReceived || 0), 0))} qty received`} accent="#16a34a" href={can("stock.grn") ? "/stock/grn" : undefined} />
          <Kpi label="My material requests" value={d.requests.length} sub={`${pendingRequests.length} waiting for approval`} accent="#7c3aed" href={can("stock.requests") ? "/stock/material-requests" : undefined} />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card title="To receive" aside={`${d.toReceive.length} challans`}>
            {d.toReceive.length ? d.toReceive.slice(0, 6).map((c) => (
              <Row key={c.DeliveryChallanId} href="/stock/grn" stripe="#2563eb" title={<span className="font-mono">{c.ChallanNo}</span>} subtitle={`${dayjs(c.ChallanDate).format("DD-MMM-YYYY")} · ${c.ChallanType} · from ${c.DispatchLocName || "—"}`} right={<b className="text-sm text-blue-700">{qty(c.PendingQty)}</b>} />
            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing waiting to be received" />}
          </Card>
          <Card title="To send back (returnable)" aside={`${d.toReturn.length} challans`}>
            {d.toReturn.length ? d.toReturn.slice(0, 6).map((c) => {
              const late = c.ExpectedBackBy && dayjs(c.ExpectedBackBy).isBefore(dayjs(), "day");
              return <Row key={c.DeliveryChallanId} href="/stock/dcreturn" stripe={late ? "#dc2626" : "#f59e0b"} title={<span className="font-mono">{c.ChallanNo}</span>}
                subtitle={c.ExpectedBackBy ? <span className={late ? "font-semibold text-red-600" : ""}>{late ? "Overdue · " : ""}expected back {dayjs(c.ExpectedBackBy).format("DD-MMM-YYYY")}</span> : c.Purpose} right={<b className="text-sm text-amber-600">{qty(c.PendingQty)}</b>} />;
            }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No returnable material pending" />}
          </Card>
          <Card title="Low stock" aside={`${low.length} items`}>
            {low.length ? low.slice(0, 6).map((r) => (
              <Row key={`${r.WarehouseId}|${r.ItemSource}|${r.ItemId}`} href="/stock/warehouse-stock" stripe={r.Status === "Out of stock" ? "#dc2626" : "#f59e0b"} title={r.ItemName}
                subtitle={`${r.ItemCode || "—"} · min ${r.Min ?? "—"}`} right={<span className="flex items-center gap-2"><b className="text-sm">{qty(r.Closing)}</b><Tag color={STATUS_COLOR[r.Status]} className="!mr-0">{r.Status}</Tag></span>} />
            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="All items at or above minimum" />}
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Recent goods receipts" aside="latest 6">
            {d.receipts.length ? d.receipts.slice(0, 6).map((r) => (
              <Row key={r.ChallanReceiptId} href="/stock/grn" stripe="#16a34a" title={<span className="font-mono">{r.ReceiptNo}</span>} subtitle={`${dayjs(r.ReceiptDate).format("DD-MMM-YYYY")} · against ${r.ChallanNo}`} right={<b className="text-sm text-emerald-700">{qty(r.QtyReceived)}</b>} />
            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No goods receipts yet" />}
          </Card>
          <Card title="My material requests" aside="latest 6">
            {d.requests.length ? d.requests.slice(0, 6).map((r) => (
              <Row key={r.MaterialRequestId} href="/stock/material-requests" stripe={r.Status === "Approved" ? "#16a34a" : r.Status === "Rejected" ? "#dc2626" : "#f59e0b"} title={<span className="font-mono">{r.RequestNo}</span>}
                subtitle={`${dayjs(r.RequestDate).format("DD-MMM-YYYY")} · ${r.ItemCount} items · ${r.Priority}`} right={<Tag color={r.Status === "Approved" ? "green" : r.Status === "Rejected" ? "red" : "gold"} className="!mr-0">{r.Status}</Tag>} />
            )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No material requests yet" />}
          </Card>
        </div>
      </div>
    </div>
  );
}
