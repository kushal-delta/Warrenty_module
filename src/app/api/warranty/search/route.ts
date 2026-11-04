import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { getScope, namedParams, warrantyFilter } from "@/lib/auth/scope";

const DAY = 24 * 60 * 60 * 1000;

/** Warranty state of one row: active · expiring (≤ 45 days) · expired · replaced. */
function stateOf(w: { Status: string; EndDate: string }) {
  const days = Math.ceil((new Date(w.EndDate).getTime() - Date.now()) / DAY);
  if (w.Status === "Replaced") return { state: "replaced", label: "Replaced", days: 0 };
  if (w.Status !== "Active" || days < 0) return { state: "expired", label: w.Status === "Active" ? "Expired" : w.Status, days: 0 };
  return { state: days <= 45 ? "expiring" : "active", label: days <= 45 ? "Ending soon" : "Active", days };
}

/**
 * Serial No. Search Report: authenticity, balance warranty, customer, dealer, the set's other components and the history
 * (registration, service calls, replacements) of any serial. Staff, dealers and customers may check any serial's warranty
 * status, but owner details and history only for units inside their rights.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { serialNo } = await request.json().catch(() => ({}));
    const sn = String(serialNo || "").trim().toUpperCase();
    if (!sn) return fail("Serial number is required");

    const sticker = (await runQuery<any>(`SELECT TOP 1 s.[SerialNo], s.[Category], s.[Status], s.[ProductModelId], p.[ModelName], p.[ModelCode], p.[Hp], p.[Kw], p.[Technology], p.[WarrantyMonths]
      FROM dbo.[Stickers] s LEFT JOIN dbo.[ProductModels] p ON s.[ProductModelId] = p.[ProductModelId] WHERE s.[SerialNo] = @sn`, { sn }))[0];
    const warranty = (await runQuery<any>(`SELECT TOP 1 w.*, p.[ModelName], p.[Hp], p.[Kw] FROM dbo.[Warranties] w LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId] WHERE w.[SerialNo] = @sn ORDER BY w.[StartDate] DESC`, { sn }))[0];

    if (!sticker && !warranty) return NextResponse.json({ success: true, status: "unknown", serialNo: sn });
    const model = { ModelName: warranty?.ModelName || sticker?.ModelName, ModelCode: sticker?.ModelCode, Hp: warranty?.Hp ?? sticker?.Hp, Kw: warranty?.Kw ?? sticker?.Kw, Technology: sticker?.Technology, WarrantyMonths: sticker?.WarrantyMonths };
    const category = warranty?.Category || sticker?.Category;
    if (!warranty) return NextResponse.json({ success: true, status: "unregistered", serialNo: sn, category, model });

    const st = stateOf(warranty);
    const total = Math.max(1, Math.round((new Date(warranty.EndDate).getTime() - new Date(warranty.StartDate).getTime()) / DAY));
    const used = Math.min(total, Math.max(0, Math.round((Date.now() - new Date(warranty.StartDate).getTime()) / DAY)));
    const base = { success: true, status: "registered", serialNo: sn, category, model, warranty: { WarrantyNo: warranty.WarrantyNo, StartDate: warranty.StartDate, EndDate: warranty.EndDate, WarrantyMonths: warranty.WarrantyMonths, ExtendedMonths: warranty.ExtendedMonths, State: st.state, Label: st.label, DaysLeft: st.days, ElapsedPct: Math.round((used / total) * 100) } };

    // Owner details and history only for units inside the user's rights.
    const values: Record<string, unknown> = { id: warranty.WarrantyId };
    const filter = warrantyFilter(await getScope(user), "w", namedParams(values));
    const visible = !filter || (await runQuery(`SELECT TOP 1 1 AS [ok] FROM dbo.[Warranties] w WHERE w.[WarrantyId] = @id AND ${filter}`, values)).length > 0;
    if (!visible) return NextResponse.json({ ...base, visible: false });

    const [owner, components, calls, replacements] = await Promise.all([
      runQuery<any>(`SELECT TOP 1 cu.[CustomerName], cu.[Mobile], i.[InstallNo], i.[InstallDate], i.[Village], i.[District], i.[Pincode], i.[BorewellDepthM], i.[DynamicHeadM], s.[StateName], d.[FirmName] AS [DealerName]
        FROM dbo.[Warranties] w LEFT JOIN dbo.[Customers] cu ON w.[CustomerId] = cu.[CustomerId] LEFT JOIN dbo.[Installations] i ON w.[InstallationId] = i.[InstallationId]
        LEFT JOIN dbo.[States] s ON i.[StateId] = s.[StateId] LEFT JOIN dbo.[Dealers] d ON w.[DealerId] = d.[DealerId] WHERE w.[WarrantyId] = @id`, { id: warranty.WarrantyId }),
      runQuery<any>(`SELECT w.[SerialNo], w.[Category], w.[EndDate], w.[Status], p.[ModelName] FROM dbo.[Warranties] w LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId]
        WHERE w.[InstallationId] = @inst AND w.[Status] <> 'Replaced' ORDER BY CASE w.[Category] WHEN 'PUMP' THEN 0 WHEN 'MOTOR' THEN 1 ELSE 2 END`, { inst: warranty.InstallationId }),
      runQuery<any>(`SELECT c.[ComplaintId], c.[ComplaintNo], c.[CallDate], c.[Status], c.[ComplaintText], i.[ReportedFault] FROM dbo.[ComplaintItemLns] i JOIN dbo.[Complaints] c ON i.[ComplaintId] = c.[ComplaintId] WHERE i.[SerialNo] = @sn`, { sn }),
      runQuery<any>(`SELECT r.[ReplNo], r.[ReplDate], i.[OldSerialNo], i.[NewSerialNo] FROM dbo.[ReplacementItemLns] i JOIN dbo.[Replacements] r ON i.[ReplacementId] = r.[ReplacementId] WHERE i.[OldSerialNo] = @sn OR i.[NewSerialNo] = @sn`, { sn }),
    ]);

    const history = [
      { date: warranty.RegisteredOn || warranty.StartDate, title: "Warranty registered", detail: `by ${warranty.RegisteredBy || "—"} · valid till ${new Date(warranty.EndDate).toLocaleDateString("en-GB")}`, tone: "green" },
      ...calls.map((c) => ({ date: c.CallDate, title: `Service call ${c.ComplaintNo}`, detail: `${c.ReportedFault || c.ComplaintText} · ${c.Status}`, tone: "amber", complaintId: c.ComplaintId })),
      ...replacements.map((r) => ({ date: r.ReplDate, title: `Replacement ${r.ReplNo}`, detail: `${r.OldSerialNo} → ${r.NewSerialNo}`, tone: "amber" })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      ...base, visible: true, owner: owner[0] || null, replacedFromSerial: warranty.ReplacedFromSerial || null, registeredBy: warranty.RegisteredBy, registeredOn: warranty.RegisteredOn,
      components: components.map((c) => ({ ...c, ...(() => { const s = stateOf(c); return { State: s.state, Label: s.label, DaysLeft: s.days }; })() })), history,
    });
  } catch (err) {
    return handleApiError(err, "Serial search failed");
  }
}
