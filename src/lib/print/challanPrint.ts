import dayjs from "dayjs";

/**
 * Delivery challan print (Returnable / Non-returnable), opened in its own window.
 * "Save as PDF" uses the browser's print-to-PDF; the window title is the challan number so the PDF is named after it.
 */
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const num = (v: unknown, d = 2) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const qty = (v: unknown) => Number(Number(v || 0).toFixed(3)).toLocaleString("en-IN");
const date = (v: unknown) => (v ? dayjs(String(v)).format("DD-MMM-YYYY") : "—");

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font:12px/1.5 "Segoe UI",Roboto,Arial,sans-serif;color:#1e293b;background:#eef2f6;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 18px;background:#0f172a;color:#e2e8f0;font-size:13px}
.bar b{color:#fff}.bar .btns{display:flex;gap:8px}
.bar button{border:0;border-radius:6px;padding:7px 14px;font:600 13px "Segoe UI",Arial,sans-serif;cursor:pointer;background:#334155;color:#fff}
.bar button.pri{background:#2563eb}
.sheet{width:210mm;min-height:280mm;margin:18px auto;background:#fff;padding:12mm 12mm 10mm;box-shadow:0 4px 24px rgba(15,23,42,.12);display:flex;flex-direction:column}
.lh{display:flex;align-items:flex-start;gap:18px;padding-bottom:12px;border-bottom:3px solid #e8590c}
.lh img{height:52px;width:auto;object-fit:contain}
.lh .co{flex:1}
.lh h1{font-size:18px;font-weight:800;letter-spacing:.2px;color:#0f172a}
.lh .adr{margin-top:3px;color:#475569;font-size:11.5px}
.lh .rt{text-align:right;font-size:11.5px;color:#475569;white-space:nowrap}
.lh .rt b{display:block;font-size:13px;color:#0f172a}
.title{margin:16px auto 14px;width:fit-content;padding:7px 28px;border:1.6px solid #0f172a;border-radius:3px;font-size:15px;font-weight:800;letter-spacing:4px;text-transform:uppercase}
.panels{display:grid;grid-template-columns:1fr 1fr;border:1px solid #cbd5e1}
.panels>div{padding:12px 14px}
.panels>div+div{border-left:1px solid #cbd5e1}
.panels h4{font-size:10.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;padding-bottom:6px;margin-bottom:8px;border-bottom:1px solid #e2e8f0}
.panels p{margin:3px 0;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border:1px solid #cbd5e1;padding:6px 8px;font-size:11.5px}
th{background:#f1f5f9;font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#334155;text-align:left}
td.r,th.r{text-align:right}
td.mono{font-family:Consolas,"SF Mono",Menlo,monospace;font-size:11px}
tr.tot td{background:#f8fafc;font-weight:700}
.sec{margin-top:18px}
.sec h5{font-size:10.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#475569;padding-bottom:5px;border-bottom:1px solid #cbd5e1;margin-bottom:8px}
.muted{color:#64748b}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:auto;padding-top:46px}
.sign div{text-align:center;border-top:1px solid #334155;padding-top:8px}
.sign b{display:block;font-size:12.5px;color:#0f172a}
@page{size:A4;margin:0}
@media print{body{background:#fff}.bar{display:none}.sheet{margin:0;box-shadow:none;width:auto;min-height:0}.sign{margin-top:0}}
`;

export function challanPrintHtml(d: any, origin: string) {
  const c = d.challan || {}, co = d.company || {}, party = d.party || {};
  const returnable = c.ChallanType === "Returnable";
  const lines: any[] = d.lines || [];
  const receipts: any[] = d.receipts || [];
  const totQty = lines.reduce((s, l) => s + Number(l.Qty || 0), 0);
  const totAmt = lines.reduce((s, l) => s + Number(l.Amount || 0), 0);
  const totRec = lines.reduce((s, l) => s + Number(l.Received || 0), 0);
  const totPen = lines.reduce((s, l) => s + Number(l.Pending || 0), 0);
  const coAddress = [co.Address, co.City, co.Pincode ? `- ${co.Pincode}` : "", co.State].filter(Boolean).join(", ").replace(", -", " -");
  const from = c.DispatchLocName ? `From ${esc(c.DispatchLocName)} to` : "Sent to";
  const toKind = c.WarehouseId ? "Warehouse" : "Service center";

  const rows = lines.map((l, i) => `<tr>
      <td>${i + 1}</td><td>${esc(l.ItemName)}${l.Remarks ? `<div class="muted" style="font-size:10.5px">${esc(l.Remarks)}</div>` : ""}</td><td class="mono">${esc(l.ItemCode || "—")}</td>
      <td class="r">${qty(l.Qty)}${l.Uom ? ` ${esc(l.Uom)}` : ""}</td><td class="r">${num(l.Rate)}</td><td class="r">${num(l.Amount)}</td>
      ${returnable ? `<td class="r">${qty(l.Received)}</td><td class="r"><b>${qty(l.Pending)}</b></td>` : ""}
    </tr>`).join("");

  const receiptBlock = returnable ? `<div class="sec"><h5>Goods received against this challan</h5>${receipts.length
    ? `<table style="margin-top:0"><thead><tr><th>GRN no.</th><th>Date</th><th class="r">Qty received</th><th>Received by</th><th>Remarks</th></tr></thead><tbody>${receipts.map((r) => `<tr><td class="mono">${esc(r.ReceiptNo)}</td><td>${date(r.ReceiptDate)}</td><td class="r">${qty(r.Qty)}</td><td>${esc(r.ReceivedBy?.trim() || "—")}</td><td>${esc(r.Remarks || "—")}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">Nothing received yet.</p>`}</div>` : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.ChallanNo || "Delivery Challan")}</title><base href="${esc(origin)}/"><style>${CSS}</style></head><body>
<div class="bar"><span><b>${esc(c.ChallanNo)}</b> · ${returnable ? "Returnable" : "Non-returnable"} delivery challan</span><div class="btns"><button class="pri" onclick="window.print()">Save as PDF</button></div></div>
<div class="sheet">
  <div class="lh">
    <img src="solartive-logo.png" alt="">
    <div class="co"><h1>${esc(co.CompanyName || "")}</h1><div class="adr">${esc(coAddress)}${co.Gstin ? `<br>GSTIN: ${esc(co.Gstin)}` : ""}</div></div>
    <div class="rt"><b>${esc(c.ChallanNo)}</b>Date: ${date(c.ChallanDate)}<br>${esc(c.Status || "")}</div>
  </div>
  <div class="title">${returnable ? "Returnable" : "Non-returnable"} delivery challan</div>
  <div class="panels">
    <div><h4>${from} — ${toKind.toLowerCase()} (job worker)</h4>
      <p><b>${esc(party.Name || c.JobWorkerName || "—")}</b>${party.Code ? ` (${esc(party.Code)})` : ""}</p>
      ${party.Address ? `<p>${esc(party.Address)}</p>` : ""}
      <p>${[party.ContactPerson, party.Phone].filter(Boolean).map(esc).join(" · ") || ""}</p>
      ${c.PartyKind ? `<p class="muted">Party kind: ${esc(c.PartyKind)}</p>` : ""}
    </div>
    <div><h4>Dispatch</h4>
      ${c.RequestNo ? `<p>Material request: <b>${esc(c.RequestNo)}</b></p>` : ""}
      <p>Purpose: <b>${esc(c.Purpose || "—")}</b></p>
      <p>Transporter: ${esc(c.TransporterName || "—")}${c.TransportMode ? ` (${esc(c.TransportMode)})` : ""}${c.VehicleNo ? ` · Vehicle: ${esc(c.VehicleNo)}` : ""}</p>
      ${c.LrNo ? `<p>LR / docket: ${esc(c.LrNo)}</p>` : ""}
      <p>${returnable ? `Expected return by: <b>${date(c.ExpectedBackBy)}</b>` : "Not to be returned"}</p>
    </div>
  </div>
  <table>
    <thead><tr><th style="width:34px">#</th><th>Particulars</th><th>Code</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th>${returnable ? `<th class="r">Received</th><th class="r">Pending</th>` : ""}</tr></thead>
    <tbody>${rows}<tr class="tot"><td colspan="3" class="r">Total</td><td class="r">${qty(totQty)}</td><td></td><td class="r">₹ ${num(totAmt)}</td>${returnable ? `<td class="r">${qty(totRec)}</td><td class="r">${qty(totPen)}</td>` : ""}</tr></tbody>
  </table>
  ${c.Remarks ? `<div class="sec"><h5>Remarks</h5><p>${esc(c.Remarks)}</p></div>` : ""}
  ${receiptBlock}
  <div class="sign">
    <div><b>For ${esc(co.CompanyName || "")}</b><span class="muted">Authorised signatory${d.createdBy ? ` (${esc(d.createdBy)})` : ""}</span></div>
    <div><b>Received by</b><span class="muted">${esc(party.Name || c.JobWorkerName || "")}</span></div>
  </div>
</div>
</body></html>`;
}

/** Opens the challan in its own window and starts the browser's print dialog (Save as PDF). */
export function openChallanPrint(data: any) {
  const win = window.open("", "_blank", "width=1000,height=1100");
  if (!win) return false;
  win.document.write(challanPrintHtml(data, window.location.origin));
  win.document.close();
  const run = () => {
    setTimeout(() => { win.focus(); win.print(); }, 350);
  };
  // The logo may still be loading; print once the window has loaded (or straight away if it already has).
  if (win.document.readyState === "complete") setTimeout(run, 300); else win.onload = run;
  return true;
}
