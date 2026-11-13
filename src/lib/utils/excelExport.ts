"use client";

import dayjs from "dayjs";
import { useMasterStore } from "@/lib/store/useMasterStore";
import { useAuthStore } from "@/lib/store/useAuthStore";

/**
 * One Excel report design for every screen:
 *   row 1  company name (bold, teal)              row 2  report title
 *   row 3  filters applied · generated on · by    row 5  header (white on teal, bordered)
 *   data rows with borders and light banding, ₹ / number / date formats, an optional totals row,
 *   frozen header, auto-filter, fitted column widths and A4-landscape print setup.
 * exceljs is loaded only when the user exports, so it never weighs on page loads.
 */
export type ExcelCellType = "text" | "number" | "money" | "date" | "datetime" | "percent";
export interface ExcelColumn<T> {
  header: string;
  value: (row: T, index: number) => string | number | boolean | Date | null | undefined;
  type?: ExcelCellType;
  width?: number;
  /** Sum this column in the totals row (number / money). */
  total?: boolean;
}
export interface ExcelSheet<T> {
  name: string;
  columns: ExcelColumn<T>[];
  rows: T[];
  /** Sheet heading (defaults to the report title). */
  title?: string;
}
export interface ExcelReport {
  /** Report title, also used for the file name. */
  title: string;
  /** Filters shown under the title, e.g. { Period: "01-Oct-2026 to 31-Oct-2026", Status: "Open" }. Empty values are left out. */
  filters?: Record<string, string | null | undefined>;
  sheets: ExcelSheet<any>[];
  /** File name without extension (default: title + date). */
  fileName?: string;
}

const TEAL = "FF0F766E";
const TEAL_LIGHT = "FFF0FDFA";
const BORDER = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
const BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const FORMAT: Record<ExcelCellType, string | undefined> = {
  text: undefined,
  number: "#,##0",
  money: "₹ #,##,##0.00",
  date: "dd-mmm-yyyy",
  datetime: "dd-mmm-yyyy hh:mm",
  percent: "0.00\"%\"",
};

/** Turns a raw value into what Excel should store for the column type (real numbers and dates, not text). */
function cellValue(raw: unknown, type: ExcelCellType = "text") {
  if (raw === null || raw === undefined || raw === "") return null;
  if (type === "number" || type === "money" || type === "percent") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : String(raw);
  }
  if (type === "date" || type === "datetime") {
    const d = dayjs(raw as any);
    if (!d.isValid()) return String(raw);
    // Excel shows dates in the sheet's local time; keep the wall-clock date the screen shows.
    return new Date(Date.UTC(d.year(), d.month(), d.date(), type === "datetime" ? d.hour() : 0, type === "datetime" ? d.minute() : 0));
  }
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  return String(raw).trim();
}

/** "01-Oct-2026 to 31-Oct-2026" for a date-range filter, or null when no range is set. */
export function rangeLabel(range?: [any, any] | null) {
  if (!range || (!range[0] && !range[1])) return null;
  const f = (v: any) => (v ? dayjs(v).format("DD-MMM-YYYY") : "…");
  return `${f(range[0])} to ${f(range[1])}`;
}

const safeSheetName = (name: string, used: Set<string>) => {
  let base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base, i = 2;
  while (used.has(candidate.toLowerCase())) { const suffix = ` (${i++})`; candidate = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(candidate.toLowerCase());
  return candidate;
};

export async function exportExcel(report: ExcelReport) {
  const ExcelJS = (await import("exceljs")).default;
  const company = useMasterStore.getState().company?.CompanyName || "Solartive Techno Industries";
  const user = useAuthStore.getState().user;
  const by = user ? [user.FirstName, (user as any).LastName].filter(Boolean).join(" ") || user.Username : "";

  const wb = new ExcelJS.Workbook();
  wb.creator = "Delta iERP · Warranty & Service";
  wb.created = new Date();
  const used = new Set<string>();

  for (const sheet of report.sheets) {
    const cols = sheet.columns;
    const ws = wb.addWorksheet(safeSheetName(sheet.name, used), {
      views: [{ state: "frozen", ySplit: 5 }],
      pageSetup: { paperSize: 9, orientation: cols.length > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      headerFooter: { oddFooter: `&L${company}&C${report.title}&RPage &P of &N` },
    });
    const last = Math.max(cols.length, 1);

    // Title block
    ws.mergeCells(1, 1, 1, last);
    ws.getCell(1, 1).value = company;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: TEAL } };
    ws.mergeCells(2, 1, 2, last);
    ws.getCell(2, 1).value = sheet.title || report.title;
    ws.getCell(2, 1).font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
    const filterText = Object.entries(report.filters || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    filterText.push(`Generated: ${dayjs().format("DD-MMM-YYYY hh:mm A")}${by ? ` by ${by}` : ""}`, `${sheet.rows.length} record${sheet.rows.length === 1 ? "" : "s"}`);
    ws.mergeCells(3, 1, 3, last);
    ws.getCell(3, 1).value = filterText.join("   ·   ");
    ws.getCell(3, 1).font = { size: 9, italic: true, color: { argb: "FF64748B" } };
    ws.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(3).height = filterText.join("   ·   ").length > 140 ? 30 : 16;

    // Header row
    const header = ws.getRow(5);
    cols.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
      cell.alignment = { vertical: "middle", horizontal: c.type && c.type !== "text" && c.type !== "date" && c.type !== "datetime" ? "right" : "left", wrapText: true };
      cell.border = BORDERS;
    });
    header.height = 22;

    // Data rows
    const widths = cols.map((c) => Math.max(c.header.length + 2, 8));
    sheet.rows.forEach((row, r) => {
      const excelRow = ws.getRow(6 + r);
      cols.forEach((c, i) => {
        const cell = excelRow.getCell(i + 1);
        const value = cellValue(c.value(row, r), c.type);
        cell.value = value as any;
        if (FORMAT[c.type || "text"] && typeof value !== "string") cell.numFmt = c.type === "number" && typeof value === "number" && !Number.isInteger(value) ? "#,##0.00" : FORMAT[c.type || "text"]!;
        cell.border = BORDERS;
        cell.alignment = { vertical: "top", wrapText: false };
        if (r % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL_LIGHT } };
        const shown = value instanceof Date ? 12 : typeof value === "number" ? String(Math.round(value)).length + (c.type === "money" ? 7 : 3) : String(value ?? "").length;
        widths[i] = Math.max(widths[i], Math.min(shown + 2, 60));
      });
    });

    // Totals row
    const totals = cols.some((c) => c.total);
    if (totals && sheet.rows.length) {
      const tr = ws.getRow(6 + sheet.rows.length);
      cols.forEach((c, i) => {
        const cell = tr.getCell(i + 1);
        if (i === 0) cell.value = "Total";
        if (c.total) {
          const letter = ws.getColumn(i + 1).letter;
          cell.value = { formula: `SUBTOTAL(9,${letter}6:${letter}${5 + sheet.rows.length})`, result: sheet.rows.reduce((s, row, r) => s + (Number(c.value(row, r)) || 0), 0) } as any;
          if (FORMAT[c.type || "number"]) cell.numFmt = FORMAT[c.type || "number"]!;
        }
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
        cell.border = { ...BORDERS, top: { style: "medium", color: { argb: TEAL } } };
      });
    }
    if (!sheet.rows.length) {
      ws.mergeCells(6, 1, 6, last);
      ws.getCell(6, 1).value = "No records for the selected filters";
      ws.getCell(6, 1).font = { italic: true, color: { argb: "FF94A3B8" } };
    }

    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || widths[i]; });
    if (sheet.rows.length) ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + sheet.rows.length, column: last } };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(report.fileName || `${report.title} ${dayjs().format("DD-MMM-YYYY")}`).replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Single-table shortcut. */
export function exportTable<T>(title: string, columns: ExcelColumn<T>[], rows: T[], filters?: ExcelReport["filters"], sheetName?: string) {
  return exportExcel({ title, filters, sheets: [{ name: sheetName || title, columns, rows }] });
}
