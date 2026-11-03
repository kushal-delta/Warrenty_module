"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Segmented, Select, Table, Tag } from "antd";
import { InboxOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from "@ant-design/icons";
import { useStockStore, StockRow } from "@/lib/store/useStockStore";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { reportFormError } from "@/lib/utils/formErrors";

/** Spares stock per service-centre store and engineer van, with faulty (damaged) parts held for warranty claims. */
export default function StockAvailabilityPage() {
  const { stock, fetchStock, isLoading } = useStockStore();
  const [view, setView] = useState<"ALL" | "SC" | "ENG">("ALL");
  const [location, setLocation] = useState<string>();
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);

  const refresh = () => fetchStock().catch((err) => reportFormError(err, { fallback: "Could not load stock" }));
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const locations = useMemo(() => Array.from(new Map(stock.filter((s) => view === "ALL" || s.LocType === view).map((s) => [s.LocId, { value: s.LocId, label: `${s.LocType === "SC" ? "Store" : "Engineer"} · ${s.LocName}` }])).values()), [stock, view]);
  const filtered = stock.filter((s) => {
    const q = search.toLowerCase();
    return (view === "ALL" || s.LocType === view) && (!location || s.LocId === location) && (!lowOnly || s.BelowMin)
      && (!q || [s.SpareCode, s.SpareName, s.LocName, s.ServiceCenterName].some((v) => v?.toLowerCase().includes(q)));
  }).sort((a, b) => a.LocType.localeCompare(b.LocType) || a.LocName.localeCompare(b.LocName) || a.SpareName.localeCompare(b.SpareName));

  const columns = [
    { title: "Location", key: "loc", render: (_: any, s: StockRow) => <div><Tag color={s.LocType === "SC" ? "purple" : "cyan"}>{s.LocType === "SC" ? "Store" : "Engineer"}</Tag><span className="font-semibold text-slate-800">{s.LocName}</span>{s.LocType === "ENG" && s.ServiceCenterName && <div className="text-[11px] text-slate-400 mt-0.5">{s.ServiceCenterName}</div>}</div> },
    { title: "Spare", key: "spare", render: (_: any, s: StockRow) => <div><div className="font-semibold text-slate-800">{s.SpareName}</div><div className="text-[11px] text-slate-400 font-mono">{s.SpareCode}{s.Category ? ` · ${s.Category}` : ""}</div></div> },
    { title: "Good Qty", dataIndex: "Good", key: "good", width: 110, align: "right" as const, render: (v: number, s: StockRow) => <span className={`font-bold ${v <= 0 ? "text-red-600" : s.BelowMin ? "text-amber-600" : "text-emerald-700"}`}>{v} {s.Uom}</span> },
    { title: "Min Stock", dataIndex: "MinStock", key: "min", width: 100, align: "right" as const, render: (v: number, s: StockRow) => s.LocType === "SC" ? v : "—" },
    { title: "Faulty (held)", dataIndex: "Damaged", key: "dmg", width: 120, align: "right" as const, render: (v: number) => v ? <Tag color="red">{v}</Tag> : "—" },
    { title: "Rate ₹", dataIndex: "Rate", key: "rate", width: 100, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Value ₹", dataIndex: "Value", key: "val", width: 120, align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
    { title: "", key: "flag", width: 110, render: (_: any, s: StockRow) => s.BelowMin ? <Tag icon={<WarningOutlined />} color="warning">Reorder</Tag> : null },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<InboxOutlined />} title="Stock Availability" subtitle="Spares at each service-centre store and engineer van · faulty parts from warranty job cards are held separately"
        actions={<Button icon={<ReloadOutlined />} onClick={refresh} loading={isLoading}>Refresh</Button>} />

      <StatStrip items={[
        { label: "Stock lines", value: stock.length },
        { label: "Stock value ₹", value: inr(stock.reduce((s, r) => s + r.Value, 0)) },
        { label: "In stores", value: stock.filter((s) => s.LocType === "SC").reduce((s, r) => s + r.Good, 0) },
        { label: "With engineers", value: stock.filter((s) => s.LocType === "ENG").reduce((s, r) => s + r.Good, 0) },
        { label: "Faulty held", value: stock.reduce((s, r) => s + r.Damaged, 0), tone: "danger" },
        { label: "Below minimum", value: stock.filter((s) => s.BelowMin).length, tone: "warn" },
      ]} />

      <div className="filter-toolbar">
        <Segmented value={view} onChange={(v) => { setView(v as any); setLocation(undefined); }} options={[{ value: "ALL", label: "All" }, { value: "SC", label: "Stores" }, { value: "ENG", label: "Engineer-wise" }]} />
        <Select placeholder="All Locations" value={location} onChange={setLocation} allowClear showSearch optionFilterProp="label" className="w-64" options={locations} />
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search spare code or name..." value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-64" />
        <Button type={lowOnly ? "primary" : "default"} icon={<WarningOutlined />} onClick={() => setLowOnly(!lowOnly)}>Below minimum</Button>
      </div>

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="key" size="middle" loading={isLoading} scroll={{ x: 1000 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          summary={(rows) => rows.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}><b>Total</b></Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right"><b>{rows.reduce((s, r) => s + r.Good, 0)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={3} />
              <Table.Summary.Cell index={4} align="right"><b>{rows.reduce((s, r) => s + r.Damaged, 0)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={5} />
              <Table.Summary.Cell index={6} align="right"><b>{inr(rows.reduce((s, r) => s + r.Value, 0), 2)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={7} />
            </Table.Summary.Row>
          ) : null} />
      </div>
    </div>
  );
}
