"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { Button, Select, Table, Tag } from "antd";
import { AppstoreOutlined, CalendarOutlined, ExperimentOutlined, ReloadOutlined, SafetyOutlined, ShopOutlined, UserOutlined } from "@ant-design/icons";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";
import { DateRangeFilter, ExportExcelButton, type DateRange } from "@/components/common/ReportTools";
import { FilterBar } from "@/components/common/FilterBar";
import { exportTable, rangeLabel } from "@/lib/utils/excelExport";

interface Row { StockTxnId: string; TxnDate: string; JobCardId: string; JobCardNo: string; CustomerName: string; SpareCode: string; SpareName: string; SerialNo?: string; FromLocType: string; FromLocName?: string; EngineerName?: string; ServiceCenterName?: string; Qty: number; Rate: number; Amount: number; IsWarranty: boolean }

/** Parts Consumption: spares consumed on approved job cards, with the warranty vs chargeable split. */
export default function PartsConsumptionPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<DateRange>(null); // consumption (transaction) date — sent to the API
  const [search, setSearch] = useState("");
  const [basis, setBasis] = useState<string>();
  const [spare, setSpare] = useState<string>();
  const [engineer, setEngineer] = useState<string>();
  const [centre, setCentre] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await axios.post("/api/stock/consumption", { fromDate: range?.[0]?.startOf("day").toISOString(), toDate: range?.[1]?.endOf("day").toISOString() })).data.consumption); }
    catch (err) { reportFormError(err, { fallback: "Could not load parts consumption" }); }
    finally { setLoading(false); }
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const opts = (get: (r: Row) => string | undefined) => Array.from(new Set(rows.map(get).filter(Boolean) as string[])).sort().map((v) => ({ value: v, label: v }));
  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (!q || [r.JobCardNo, r.SpareName, r.SpareCode, r.CustomerName, r.SerialNo].some((v) => v?.toLowerCase().includes(q)))
      && (!basis || (r.IsWarranty ? "Warranty" : "Chargeable") === basis) && (!spare || r.SpareName === spare)
      && (!engineer || r.EngineerName?.trim() === engineer) && (!centre || r.ServiceCenterName === centre);
  });
  const sum = (list: Row[], f: (r: Row) => number) => list.reduce((s, r) => s + f(r), 0);

  const exportExcel = () => exportTable("Parts Consumption", [
    { header: "Date", value: (r: Row) => r.TxnDate, type: "date" },
    { header: "Job Card", value: (r: Row) => r.JobCardNo },
    { header: "Customer", value: (r: Row) => r.CustomerName },
    { header: "Spare Code", value: (r: Row) => r.SpareCode },
    { header: "Spare", value: (r: Row) => r.SpareName },
    { header: "Component Serial", value: (r: Row) => r.SerialNo },
    { header: "Source", value: (r: Row) => (r.FromLocType === "ENG" ? "Engineer" : "Store") },
    { header: "Consumed From", value: (r: Row) => r.FromLocName?.trim() },
    { header: "Qty", value: (r: Row) => r.Qty, type: "number", total: true },
    { header: "Rate ₹", value: (r: Row) => r.Rate, type: "money" },
    { header: "Value ₹", value: (r: Row) => r.Amount, type: "money", total: true },
    { header: "Basis", value: (r: Row) => (r.IsWarranty ? "Warranty" : "Chargeable") },
  ], filtered, { Period: rangeLabel(range), Spare: spare, Engineer: engineer, "Service center": centre, Basis: basis, Search: search || null }, "Parts consumption");

  const columns = [
    { title: "Date", dataIndex: "TxnDate", key: "d", width: 105, render: (v: string) => formatDate(v) },
    { title: "Job Card", dataIndex: "JobCardNo", key: "j", width: 140, render: (v: string) => <Link href={`/service/jobcards?open=${rows.find((r) => r.JobCardNo === v)?.JobCardId}`} className="font-mono font-bold text-blue-700">{v}</Link> },
    { title: "Customer", dataIndex: "CustomerName", key: "c" },
    { title: "Spare", key: "s", render: (_: any, r: Row) => <div><div className="font-semibold text-slate-800">{r.SpareName}</div><div className="text-[11px] text-slate-400 font-mono">{r.SpareCode}</div></div> },
    { title: "Component serial", dataIndex: "SerialNo", key: "sn", render: (v: string) => v ? <span className="font-mono text-xs">{v}</span> : "—" },
    { title: "Consumed from", key: "f", render: (_: any, r: Row) => <span><Tag color={r.FromLocType === "ENG" ? "cyan" : "purple"}>{r.FromLocType === "ENG" ? "Engineer" : "Store"}</Tag>{r.FromLocName?.trim()}</span> },
    { title: "Qty", dataIndex: "Qty", key: "q", width: 70, align: "right" as const },
    { title: "Rate ₹", dataIndex: "Rate", key: "r", width: 100, align: "right" as const, render: (v: number) => inr(v, 2) },
    { title: "Value ₹", dataIndex: "Amount", key: "a", width: 110, align: "right" as const, render: (v: number) => <b>{inr(v, 2)}</b> },
    { title: "Basis", dataIndex: "IsWarranty", key: "b", width: 110, render: (w: boolean) => w ? <Tag color="green">Warranty</Tag> : <Tag color="orange">Chargeable</Tag> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader icon={<ExperimentOutlined />} title="Parts Consumption" subtitle="Spares consumed on approved job cards — with warranty vs chargeable split"
        actions={<><ExportExcelButton onExport={exportExcel} disabled={!filtered.length} /><Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button></>} />

      <StatStrip items={[
        { label: "Units consumed", value: inr(sum(filtered, (r) => r.Qty)) },
        { label: "Value ₹", value: inr(sum(filtered, (r) => Number(r.Amount))) },
        { label: "Under warranty ₹", value: inr(sum(filtered.filter((r) => r.IsWarranty), (r) => Number(r.Amount))), tone: "ok" },
        { label: "Chargeable ₹", value: inr(sum(filtered.filter((r) => !r.IsWarranty), (r) => Number(r.Amount))), tone: "warn" },
        { label: "Job cards", value: new Set(filtered.map((r) => r.JobCardNo)).size },
      ]} />

      <FilterBar
        storageKey="stock-consumption"
        search={{ value: search, onChange: setSearch, placeholder: "Search job card, spare, customer, serial…" }}
        filters={[
          { key: "date", label: "Consumed", icon: <CalendarOutlined />, pinned: true, active: !!(range?.[0] || range?.[1]), onClear: () => setRange(null),
            render: () => <DateRangeFilter variant="borderless" value={range} onChange={setRange} placeholder={["From", "To"]} className="" /> },
          { key: "basis", label: "Basis", icon: <SafetyOutlined />, pinned: true, active: !!basis, onClear: () => setBasis(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear value={basis} onChange={setBasis} popupMatchSelectWidth={false} options={[{ value: "Warranty", label: "Warranty" }, { value: "Chargeable", label: "Chargeable" }]} /> },
          { key: "spare", label: "Spare", group: "Item", icon: <AppstoreOutlined />, active: !!spare, onClear: () => setSpare(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={spare} onChange={setSpare} popupMatchSelectWidth={false} options={opts((r) => r.SpareName)} /> },
          { key: "engineer", label: "Engineer", group: "Location & team", icon: <UserOutlined />, active: !!engineer, onClear: () => setEngineer(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={engineer} onChange={setEngineer} popupMatchSelectWidth={false} options={opts((r) => r.EngineerName?.trim())} /> },
          { key: "center", label: "Service center", group: "Location & team", icon: <ShopOutlined />, active: !!centre, onClear: () => setCentre(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={centre} onChange={setCentre} popupMatchSelectWidth={false} options={opts((r) => r.ServiceCenterName)} /> },
        ]}
      />

      <div className={TABLE_CARD}>
        <Table dataSource={filtered} columns={columns} rowKey="StockTxnId" size="middle" loading={loading} scroll={{ x: 1100 }} pagination={{ defaultPageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: "No parts consumed yet — spares are consumed when a job card gets its final approval" }}
          summary={(data) => data.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={6}><b>Total</b></Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right"><b>{inr(sum(data as Row[], (r) => r.Qty))}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={7} />
              <Table.Summary.Cell index={8} align="right"><b>{inr(sum(data as Row[], (r) => Number(r.Amount)), 2)}</b></Table.Summary.Cell>
              <Table.Summary.Cell index={9} />
            </Table.Summary.Row>
          ) : null} />
      </div>
    </div>
  );
}
