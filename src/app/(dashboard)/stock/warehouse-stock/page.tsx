"use client";

import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Button, Select, Table, Tag, Tooltip } from "antd";
import { AlertOutlined, AppstoreOutlined, CalendarOutlined, DatabaseOutlined, HomeOutlined, ReloadOutlined } from "@ant-design/icons";
import { PageHeader, StatStrip, TABLE_CARD, inr } from "@/components/common/PageHeader";
import { reportFormError } from "@/lib/utils/formErrors";
import { DateRangeFilter, ExportExcelButton, type DateRange } from "@/components/common/ReportTools";
import { FilterBar } from "@/components/common/FilterBar";
import { exportTable, rangeLabel } from "@/lib/utils/excelExport";

const qty = (n: unknown) => Number(Number(n || 0).toFixed(3)).toLocaleString("en-IN", { maximumFractionDigits: 3 });
/** Same tag colours as the rest of the app (green ok, gold warning, red problem). */
const STATUS_COLOR: Record<string, string> = { OK: "green", "Over maximum": "blue", "Below minimum": "gold", "Out of stock": "red", "No levels set": "default" };
const STATUSES = ["OK", "Over maximum", "Below minimum", "Out of stock", "No levels set"];
const Qty = ({ v, uom, tone }: { v: number; uom?: string; tone?: string }) => <span className={tone}>{qty(v)}<span className="ml-1 text-[11px] text-slate-400">{uom || ""}</span></span>;

/** Spares Stock → Warehouse Stock: opening, inward (GRN), outward (returns against RDC) and closing per warehouse and item. */
export default function WarehouseStockPage() {
  const [range, setRange] = useState<DateRange>(null); // stock movement period, sent to the API
  const [warehouseId, setWarehouseId] = useState<string>();
  const [itemKeys, setItemKeys] = useState<string[]>([]);
  const [status, setStatus] = useState<string>();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.post("/api/stock/warehouse-stock", { fromDate: range?.[0]?.format("YYYY-MM-DD"), toDate: range?.[1]?.format("YYYY-MM-DD"), warehouseId });
      setItems(data.items); setWarehouses(data.warehouses);
    } catch (err) {
      reportFormError(err, { fallback: "Could not build the warehouse stock report" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [range, warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = (r: any) => `${r.ItemSource}|${r.ItemId}`;
  const itemOptions = useMemo(() => Array.from(new Map(items.map((r) => [key(r), `${r.ItemCode ? `${r.ItemCode} — ` : ""}${r.ItemName}`])).entries()).map(([value, label]) => ({ value, label })), [items]);
  const rows = items.filter((r) => {
    const q = search.toLowerCase();
    return (!itemKeys.length || itemKeys.includes(key(r))) && (!status || r.Status === status) && (!q || [r.ItemName, r.ItemCode, r.WarehouseName, r.Group].some((v) => v?.toLowerCase().includes(q)));
  });
  const showWarehouse = !warehouseId && warehouses.length !== 1;
  const value = (k: string) => rows.reduce((s, r) => s + Number(r[k] || 0) * Number(r.Rate || 0), 0);
  const periodText = range?.[0] && range?.[1] ? `${range[0].format("DD MMM YYYY")} – ${range[1].format("DD MMM YYYY")}` : "All dates";

  const exportExcel = () => {
    const wh = warehouses.find((w) => w.WarehouseId === warehouseId);
    return exportTable("Warehouse Stock", [
      { header: "Warehouse", value: (r: any) => r.WarehouseName },
      { header: "Item Code", value: (r: any) => r.ItemCode },
      { header: "Item", value: (r: any) => r.ItemName },
      { header: "Group", value: (r: any) => r.Group },
      { header: "Unit", value: (r: any) => r.Uom },
      { header: "Opening", value: (r: any) => Number(r.Opening), type: "number" },
      { header: "Inward", value: (r: any) => Number(r.Inward), type: "number" },
      { header: "Outward", value: (r: any) => Number(r.Outward), type: "number" },
      { header: "Closing", value: (r: any) => Number(r.Closing), type: "number" },
      { header: "Rate", value: (r: any) => r.Rate, type: "money" },
      { header: "Closing Value", value: (r: any) => Number(r.Closing) * Number(r.Rate || 0), type: "money", total: true },
      { header: "Min Level", value: (r: any) => r.Min, type: "number" },
      { header: "Max Level", value: (r: any) => r.Max, type: "number" },
      { header: "Status", value: (r: any) => r.Status },
    ], rows, {
      Period: rangeLabel(range),
      Warehouse: wh ? `${wh.WarehouseName} (${wh.WarehouseCode})` : null,
      Items: itemKeys.length ? itemOptions.filter((o) => itemKeys.includes(o.value)).map((o) => o.label).join(", ") : null,
      Status: status,
      Search: search || null,
    }, "Warehouse stock");
  };

  const columns = [
    ...(showWarehouse ? [{ title: "Warehouse", dataIndex: "WarehouseName", key: "wh", width: 180, sorter: (a: any, b: any) => String(a.WarehouseName).localeCompare(String(b.WarehouseName)), render: (v: string, r: any) => <div><div className="font-medium text-slate-700">{v}</div><div className="text-[11px] font-mono text-slate-400">{r.WarehouseCode}</div></div> }] : []),
    { title: "Item", key: "item", sorter: (a: any, b: any) => String(a.ItemName).localeCompare(String(b.ItemName)),
      render: (_: any, r: any) => <div><div className="font-semibold text-slate-800">{r.ItemName}</div><div className="text-[11px] text-slate-400"><span className="font-mono">{r.ItemCode || "—"}</span> · {r.Group}</div></div> },
    { title: "Opening", dataIndex: "Opening", key: "o", width: 150, align: "right" as const, sorter: (a: any, b: any) => a.Opening - b.Opening, render: (v: number, r: any) => <Qty v={v} uom={r.Uom} /> },
    { title: "+ Inward", dataIndex: "Inward", key: "i", width: 150, align: "right" as const, sorter: (a: any, b: any) => a.Inward - b.Inward, render: (v: number, r: any) => <Qty v={v} uom={r.Uom} tone="text-emerald-600" /> },
    { title: "− Outward", dataIndex: "Outward", key: "u", width: 150, align: "right" as const, sorter: (a: any, b: any) => a.Outward - b.Outward, render: (v: number, r: any) => <Qty v={v} uom={r.Uom} tone="text-rose-600" /> },
    { title: "= Closing", dataIndex: "Closing", key: "c", width: 150, align: "right" as const, sorter: (a: any, b: any) => a.Closing - b.Closing, render: (v: number, r: any) => <b className="text-slate-900"><Qty v={v} uom={r.Uom} /></b> },
    { title: "Status", dataIndex: "Status", key: "s", width: 170, sorter: (a: any, b: any) => String(a.Status).localeCompare(String(b.Status)),
      render: (v: string, r: any) => (
        <Tooltip title={r.Min != null || r.Max != null ? `Min ${r.Min ?? "—"} · Max ${r.Max ?? "—"}` : undefined}>
          <Tag color={STATUS_COLOR[v]}>{v}</Tag>
        </Tooltip>
      ) },
  ];
  const off = showWarehouse ? 1 : 0;

  return (
    <div className="space-y-4">
      <PageHeader icon={<DatabaseOutlined />} title="Warehouse Stock" subtitle={`Opening + inward (goods receipts) − outward (returns against RDC, material issues) = closing, per warehouse and item · ${periodText}`}
        actions={<>
          <ExportExcelButton onExport={exportExcel} disabled={!rows.length} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
        </>} />

      <FilterBar
        storageKey="stock-warehouse-stock"
        search={{ value: search, onChange: setSearch, placeholder: "Search item, code, group..." }}
        filters={[
          { key: "date", label: "Movement", icon: <CalendarOutlined />, pinned: true, active: !!(range?.[0] || range?.[1]), onClear: () => setRange(null),
            render: () => <DateRangeFilter variant="borderless" value={range} onChange={setRange} placeholder={["From", "To"]} className="" /> },
          { key: "warehouse", label: "Warehouse", icon: <HomeOutlined />, pinned: true, active: !!warehouseId, onClear: () => { setWarehouseId(undefined); setItemKeys([]); },
            render: () => <Select variant="borderless" placeholder="All" allowClear showSearch optionFilterProp="label" value={warehouseId} onChange={(v) => { setWarehouseId(v); setItemKeys([]); }} popupMatchSelectWidth={false} options={warehouses.map((w) => ({ value: w.WarehouseId, label: `${w.WarehouseName} (${w.WarehouseCode})` }))} /> },
          { key: "items", label: "Item", group: "Stock", icon: <AppstoreOutlined />, active: itemKeys.length > 0, onClear: () => setItemKeys([]),
            render: () => <Select variant="borderless" mode="multiple" placeholder="All" allowClear showSearch optionFilterProp="label" value={itemKeys} onChange={setItemKeys} popupMatchSelectWidth={false} options={itemOptions} maxTagCount="responsive" className="min-w-64" /> },
          { key: "status", label: "Status", group: "Stock", icon: <AlertOutlined />, active: !!status, onClear: () => setStatus(undefined),
            render: () => <Select variant="borderless" placeholder="All" allowClear value={status} onChange={setStatus} popupMatchSelectWidth={false} options={STATUSES.map((s) => ({ value: s, label: s }))} /> },
        ]}
      />

      <StatStrip items={[
        { label: "Items", value: rows.length },
        { label: "Closing value ₹", value: inr(value("Closing")) },
        { label: "Inward value ₹", value: inr(value("Inward")), tone: "ok" },
        { label: "Outward value ₹", value: inr(value("Outward")), tone: "danger" },
        { label: "Below min / out of stock", value: rows.filter((r) => r.Status === "Below minimum" || r.Status === "Out of stock").length, tone: "warn" },
      ]} />

      <div className={TABLE_CARD}>
        <Table dataSource={rows} columns={columns} rowKey={(r: any) => `${r.WarehouseId}|${key(r)}`} size="middle" loading={loading} scroll={{ x: showWarehouse ? 1150 : 970 }}
          pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
          rowClassName={(r) => (r.Status === "Out of stock" ? "bg-red-50/40" : r.Status === "Below minimum" ? "bg-amber-50/40" : "")}
          locale={{ emptyText: "No warehouse stock yet — stock comes in on Goods Receipt (GRN) and goes out on Defective / Fresh Receipt or Material Issue" }}
          summary={() => rows.length ? (
            <Table.Summary>
              <Table.Summary.Row className="bg-slate-50">
                <Table.Summary.Cell index={0} colSpan={1 + off}><b>Total</b></Table.Summary.Cell>
                <Table.Summary.Cell index={1 + off} align="right"><b>₹{inr(value("Opening"), 2)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={2 + off} align="right"><b className="text-emerald-700">₹{inr(value("Inward"), 2)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={3 + off} align="right"><b className="text-rose-700">₹{inr(value("Outward"), 2)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={4 + off} align="right"><b>₹{inr(value("Closing"), 2)}</b></Table.Summary.Cell>
                <Table.Summary.Cell index={5 + off} />
              </Table.Summary.Row>
            </Table.Summary>
          ) : null} />
      </div>
      <p className="text-xs text-slate-400">Values use the challan rate of each item. The TOTAL row is the value of all filtered items.</p>
    </div>
  );
}
