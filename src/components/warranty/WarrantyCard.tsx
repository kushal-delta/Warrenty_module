"use client";

import React, { forwardRef } from "react";
import dayjs from "dayjs";
import type { Company } from "@/lib/store/useMasterStore";

/**
 * Digital Warranty Card of one installation, as in the prototype: letterhead with a QR to the serial search,
 * customer and installation blocks, every component warranty (pump, motor, controller) and the warranty terms.
 * Inline styles only, so the same markup prints from a separate window (printCard).
 */
const CATEGORY: Record<string, string> = { PUMP: "Pump", MOTOR: "Motor", CONTROLLER: "Controller" };
const dmy = (v?: string | null) => (v ? dayjs(v).format("DD-MMM-YYYY") : "—");
const statusOf = (w: any) => (w.Status === "Replaced" ? "Replaced" : w.Status === "Void" ? "Void" : dayjs(w.EndDate).isBefore(dayjs(), "day") ? "Expired" : dayjs(w.EndDate).diff(dayjs(), "day") <= 45 ? "Expiring" : "Active");

const s = {
  paper: { fontFamily: "Inter, Arial, sans-serif", color: "#0f172a", background: "#fff", maxWidth: 820, margin: "0 auto", padding: 28, border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5 } as React.CSSProperties,
  head: { display: "flex", alignItems: "flex-start", gap: 16, borderBottom: "2px solid #0f766e", paddingBottom: 14 } as React.CSSProperties,
  hd: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#64748b", marginBottom: 4 } as React.CSSProperties,
  box: { flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px" } as React.CSSProperties,
  th: { textAlign: "left", background: "#f1f5f9", padding: "7px 8px", fontSize: 11, color: "#334155", borderBottom: "1px solid #e2e8f0" } as React.CSSProperties,
  td: { padding: "7px 8px", borderBottom: "1px solid #eef2f7", verticalAlign: "top" } as React.CSSProperties,
};

export const WarrantyCard = forwardRef<HTMLDivElement, { company: Company | null; installation: any; warranties: any[]; qr?: string }>(function WarrantyCard({ company, installation: i, warranties, qr }, ref) {
  const c = company;
  return (
    <div ref={ref} style={s.paper}>
      <div style={s.head}>
        <img src="/solartive-logo-sm.png" alt="" style={{ height: 44, width: "auto" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{c?.CompanyName || "Solartive Techno Industries"}</div>
          <div style={{ color: "#475569", fontSize: 11.5 }}>
            {[c?.Address, c?.City && `${c.City}${c?.Pincode ? ` - ${c.Pincode}` : ""}`, c?.State].filter(Boolean).join(", ")}
            {c?.Gstin && <><br />GSTIN: {c.Gstin}</>}{c?.TollFree && <> · Customer care: {c.TollFree}</>}
          </div>
        </div>
        {qr && <div style={{ textAlign: "center", fontSize: 10, color: "#64748b" }}><img src={qr} alt="QR" style={{ width: 78, height: 78 }} /><br />Scan to check status</div>}
      </div>

      <div style={{ textAlign: "center", margin: "16px 0 12px" }}><span style={{ fontSize: 17, fontWeight: 800, letterSpacing: ".04em", color: "#0f766e" }}>DIGITAL WARRANTY CARD</span></div>

      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div style={s.box}>
          <div style={s.hd}>Customer</div>
          <b>{i?.CustomerName}</b><br />{i?.CustomerMobile}<br />
          {[i?.SiteAddress, i?.Village].filter(Boolean).join(", ")}<br />
          {[i?.District, i?.StateName].filter(Boolean).join(", ")}{i?.Pincode ? ` - ${i.Pincode}` : ""}
        </div>
        <div style={s.box}>
          <div style={s.hd}>Installation</div>
          Installation no: <b>{i?.InstallNo}</b><br />Date: <b>{dmy(i?.InstallDate)}</b><br />
          Dealer: <b>{i?.DealerName || "Direct"}</b><br />
          {[i?.BorewellDepthM && `Borewell ${i.BorewellDepthM} m`, i?.DynamicHeadM && `Head ${i.DynamicHeadM} m`, i?.PanelKwp && `Array ${i.PanelKwp} kWp`].filter(Boolean).join(" · ")}
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <thead><tr>{["Component", "Model", "Serial no", "Warranty from", "Valid till", "Status"].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr></thead>
        <tbody>
          {warranties.map((w) => (
            <tr key={w.WarrantyId}>
              <td style={s.td}>{CATEGORY[w.Category] || w.Category}</td>
              <td style={s.td}>{w.ModelName || "—"}</td>
              <td style={{ ...s.td, fontFamily: "monospace", fontWeight: 700 }}>{w.SerialNo}</td>
              <td style={s.td}>{dmy(w.StartDate)}</td>
              <td style={{ ...s.td, fontWeight: 700 }}>{dmy(w.EndDate)}</td>
              <td style={s.td}>{statusOf(w)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {c?.WarrantyTerms && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          <div style={s.hd}>Warranty terms</div>
          <div style={{ whiteSpace: "pre-line", color: "#334155", fontSize: 11.5 }}>{c.WarrantyTerms}</div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", fontSize: 10.5, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
        <span>This is a computer generated card and needs no signature.</span><span>Printed {dayjs().format("DD-MMM-YYYY")}</span>
      </div>
    </div>
  );
});

/** Prints the card markup in its own window (only the card, not the page around it). */
export function printCard(el: HTMLElement | null, title: string) {
  if (!el) return;
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title><base href="${window.location.origin}/"><style>body{margin:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:12mm}</style><script>window.onload=function(){window.focus();window.print();}</script></head><body>${el.outerHTML}</body></html>`);
  win.document.close();
}
