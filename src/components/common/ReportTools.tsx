"use client";

import React, { useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { Button, DatePicker, message } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";

/** [from, to] chosen in a DateRangeFilter; null = all dates. */
export type DateRange = [Dayjs | null, Dayjs | null] | null;

/** Indian financial year (April–March) containing the date. */
const fyStart = (d: Dayjs) => (d.month() >= 3 ? d.startOf("year").month(3) : d.subtract(1, "year").startOf("year").month(3));

const PRESETS: { label: string; value: () => [Dayjs, Dayjs] }[] = [
  { label: "Today", value: () => [dayjs().startOf("day"), dayjs().endOf("day")] },
  { label: "Yesterday", value: () => [dayjs().subtract(1, "day").startOf("day"), dayjs().subtract(1, "day").endOf("day")] },
  { label: "Last 7 days", value: () => [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")] },
  { label: "Last 30 days", value: () => [dayjs().subtract(29, "day").startOf("day"), dayjs().endOf("day")] },
  { label: "This month", value: () => [dayjs().startOf("month"), dayjs().endOf("month")] },
  { label: "Last month", value: () => [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
  { label: "This quarter", value: () => { const q = Math.floor(dayjs().month() / 3) * 3; const s = dayjs().month(q).startOf("month"); return [s, s.add(2, "month").endOf("month")]; } },
  { label: "This FY", value: () => { const s = fyStart(dayjs()); return [s, s.add(1, "year").subtract(1, "day").endOf("day")]; } },
  { label: "Last FY", value: () => { const s = fyStart(dayjs()).subtract(1, "year"); return [s, s.add(1, "year").subtract(1, "day").endOf("day")]; } },
];

/** The same date-range control on every screen: DD/MM/YYYY, quick presets (today … last financial year), clearable. */
export function DateRangeFilter({ value, onChange, placeholder = ["From date", "To date"], className = "w-64", variant }: {
  value: DateRange; onChange: (range: DateRange) => void; placeholder?: [string, string]; className?: string;
  /** "borderless" inside a FilterBar chip. */
  variant?: "outlined" | "borderless" | "filled";
}) {
  return (
    <DatePicker.RangePicker value={value as any} onChange={(v) => onChange(v ? [v[0] ? v[0].startOf("day") : null, v[1] ? v[1].endOf("day") : null] : null)}
      format="DD/MM/YYYY" allowClear allowEmpty={[true, true]} placeholder={placeholder} presets={PRESETS} className={className} variant={variant} />
  );
}

/** True when the value's date lies inside the range (inclusive). No range = always true; no date = only when no range. */
export function inDateRange(value: unknown, range: DateRange) {
  if (!range || (!range[0] && !range[1])) return true;
  if (!value) return false;
  const d = dayjs(value as any);
  if (!d.isValid()) return false;
  if (range[0] && d.isBefore(range[0].startOf("day"))) return false;
  if (range[1] && d.isAfter(range[1].endOf("day"))) return false;
  return true;
}

/** ISO bounds for APIs that take fromDate / toDate. */
export const rangeToApi = (range: DateRange) => ({
  fromDate: range?.[0] ? range[0].startOf("day").toISOString() : undefined,
  toDate: range?.[1] ? range[1].endOf("day").toISOString() : undefined,
});

/** The same "Export Excel" button everywhere (shows progress, reports failures). */
export function ExportExcelButton({ onExport, disabled, label = "Export Excel", size }: { onExport: () => Promise<void> | void; disabled?: boolean; label?: string; size?: "small" | "middle" | "large" }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button size={size} icon={<FileExcelOutlined className="text-emerald-600" />} loading={busy} disabled={disabled}
      onClick={async () => {
        setBusy(true);
        try { await onExport(); }
        catch (err: any) { console.error("Excel export failed", err); message.error(err?.message || "Could not create the Excel file"); }
        finally { setBusy(false); }
      }}>
      {label}
    </Button>
  );
}
