"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import * as XLSX from "xlsx";
import { Button, DatePicker, Input, Select, Table, Tag } from "antd";
import { DownloadOutlined, ExperimentOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { formatDate } from "@/lib/utils/dateFormat";
import { reportFormError } from "@/lib/utils/formErrors";

interface Row { StockTxnId: string; TxnDate: string; JobCardId: string; JobCardNo: string; CustomerName: string; SpareCode: string; SpareName: string; SerialNo?: string; FromLocType: string; FromLocName?: string; EngineerName?: string; ServiceCenterName?: string; Qty: number; Rate: number; Amount: number; IsWarranty: boolean }

/** Parts Consumption: spares consumed on approved job cards, with the warranty vs chargeable split. */
export default function PartsConsumptionPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
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

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map((r) => ({ Date: formatDate(r.TxnDate), "Job Card": r.JobCardNo, Customer: r.CustomerName, Spare: r.SpareName, "Component Serial": r.SerialNo || "", "Consumed From": r.FromLocName?.trim() || "", Qty: r.Qty, Rate: Number(r.Rate), Value: Number(r.Amount), Basis: r.IsWarranty ? "Warranty" : "Chargeable" })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parts consumption");
    XLSX.writeFile(wb, "Parts_consumption.xlsx");
  };

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
        actions={<><DatePicker.RangePicker value={range as any} onChange={(v) => setRange(v as any)} format="DD/MM/YYYY" allowClear /><Button icon={<DownloadOutlined />} onClick={exportExcel} disabled={!filtered.length}>Export Excel</Button><Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button></>} />

      <StatStrip items={[
        { label: "Units consumed", value: inr(sum(filtered, (r) => r.Qty)) },
        { label: "Value ₹", value: inr(sum(filtered, (r) => Number(r.Amount))) },
        { label: "Under warranty ₹", value: inr(sum(filtered.filter((r) => r.IsWarranty), (r) => Number(r.Amount))), tone: "ok" },
        { label: "Chargeable ₹", value: inr(sum(filtered.filter((r) => !r.IsWarranty), (r) => Number(r.Amount))), tone: "warn" },
        { label: "Job cards", value: new Set(filtered.map((r) => r.JobCardNo)).size },
      ]} />

      <div className="filter-toolbar">
        <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search job card, spare, customer, serial…" value={search} onChange={(e) => setSearch(e.target.value)} allowClear className="w-80" />
        <Select allowClear showSearch placeholder="Spare" value={spare} onChange={setSpare} options={opts((r) => r.SpareName)} className="w-52" />
        <Select allowClear showSearch placeholder="Engineer" value={engineer} onChange={setEngineer} options={opts((r) => r.EngineerName?.trim())} className="w-44" />
        <Select allowClear placeholder="Service center" value={centre} onChange={setCentre} options={opts((r) => r.ServiceCenterName)} className="w-52" />
        <Select allowClear placeholder="Basis" value={basis} onChange={setBasis} options={[{ value: "Warranty", label: "Warranty" }, { value: "Chargeable", label: "Chargeable" }]} className="w-36" />
      </div>

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
