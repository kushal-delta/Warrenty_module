import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { callFilter, geoFilter, getScope, namedParams, replacementFilter } from "@/lib/auth/scope";
import { canUseForm } from "@/lib/auth/forms";

const LIMIT = 6;

/** Each result group opens this screen, so it is only shown to users with rights to it. */
const GROUP_FORM: Record<string, string> = { serials: "warranty.verify", calls: "service.complaints", jobcards: "service.jobcards", customers: "warranty.customers", dealers: "warranty.dealers", replacements: "service.replacements" };

/** Escapes LIKE wildcards so user text is matched literally. */
const likeSafe = (text: string) => text.replace(/[\[%_]/g, (ch) => `[${ch}]`);

/**
 * Global search across serials, service calls, customers, dealers, job cards and replacements.
 * Prefix matches rank first. Engineers only see their own calls and job cards.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { q } = await request.json().catch(() => ({}));
    const term = String(q || "").trim().slice(0, 60);
    if (term.length < 2) return NextResponse.json({ success: true, groups: [] });

    const values: Record<string, unknown> = { prefix: `${likeSafe(term)}%`, any: `%${likeSafe(term)}%` };
    const mine = user.Role === "ENGINEER";
    // Results follow the user's rights (state / district, manager centre, engineer's own calls). Serial lookup stays open, like Serial Verification.
    const scope = await getScope(user), add = namedParams(values);
    const pre = (condition: string) => (condition ? ` AND ${condition}` : "");
    const callScope = pre(callFilter(scope, "c", add));
    const customerScope = pre(geoFilter(scope, { state: "cu.[StateId]", district: "cu.[District]", customer: "cu.[CustomerId]" }, add));
    const dealerScope = pre(geoFilter(scope, { state: "d.[StateId]", district: "d.[District]", dealer: "d.[DealerId]" }, add));
    const replScope = pre(replacementFilter(scope, "r", add));
    const [serials, calls, customers, dealers, jobCards, replacements] = await Promise.all([
      runQuery(`SELECT TOP ${LIMIT} s.[StickerId], s.[SerialNo], s.[Category], s.[Status], p.[ModelName],
          (SELECT TOP 1 CASE WHEN w.[Status] = 'Active' AND w.[EndDate] < SYSUTCDATETIME() THEN 'Expired' ELSE w.[Status] END FROM dbo.[Warranties] w WHERE w.[SerialNo] = s.[SerialNo] ORDER BY w.[StartDate] DESC) AS [WarrantyStatus]
        FROM dbo.[Stickers] s LEFT JOIN dbo.[ProductModels] p ON s.[ProductModelId] = p.[ProductModelId]
        WHERE s.[SerialNo] LIKE @any OR s.[InvoiceNo] LIKE @prefix
        ORDER BY CASE WHEN s.[SerialNo] LIKE @prefix THEN 0 ELSE 1 END, s.[SerialNo]`, values),
      runQuery(`SELECT TOP ${LIMIT} c.[ComplaintId], c.[ComplaintNo], c.[CustomerName], c.[Mobile], c.[Status], c.[Village]
        FROM dbo.[Complaints] c
        WHERE (c.[ComplaintNo] LIKE @any OR c.[CustomerName] LIKE @any OR c.[Mobile] LIKE @prefix)${callScope}
        ORDER BY CASE WHEN c.[ComplaintNo] LIKE @prefix OR c.[CustomerName] LIKE @prefix THEN 0 ELSE 1 END, c.[CallDate] DESC`, values),
      mine ? Promise.resolve([]) : runQuery(`SELECT TOP ${LIMIT} [CustomerId], [CustomerName], [Mobile], [Village], [District]
        FROM dbo.[Customers] cu
        WHERE ([CustomerName] LIKE @any OR [Mobile] LIKE @prefix OR [Village] LIKE @prefix)${customerScope}
        ORDER BY CASE WHEN [CustomerName] LIKE @prefix OR [Mobile] LIKE @prefix THEN 0 ELSE 1 END, [CustomerName]`, values),
      mine ? Promise.resolve([]) : runQuery(`SELECT TOP ${LIMIT} [DealerId], [DealerCode], [FirmName], [City], [Status]
        FROM dbo.[Dealers] d
        WHERE ([FirmName] LIKE @any OR [DealerCode] LIKE @prefix OR [Mobile] LIKE @prefix)${dealerScope}
        ORDER BY CASE WHEN [FirmName] LIKE @prefix OR [DealerCode] LIKE @prefix THEN 0 ELSE 1 END, [FirmName]`, values),
      runQuery(`SELECT TOP ${LIMIT} j.[JobCardId], j.[JobCardNo], j.[Status], j.[TotalEstimate], c.[ComplaintNo], c.[CustomerName]
        FROM dbo.[JobCards] j JOIN dbo.[Complaints] c ON j.[ComplaintId] = c.[ComplaintId]
        WHERE (j.[JobCardNo] LIKE @any OR c.[ComplaintNo] LIKE @prefix)${callScope}
        ORDER BY CASE WHEN j.[JobCardNo] LIKE @prefix THEN 0 ELSE 1 END, j.[JobCardDate] DESC`, values),
      mine ? Promise.resolve([]) : runQuery(`SELECT TOP ${LIMIT} r.[ReplacementId], r.[ReplNo], r.[Status], r.[Source], d.[FirmName] AS [DealerName]
        FROM dbo.[Replacements] r LEFT JOIN dbo.[Dealers] d ON r.[DealerId] = d.[DealerId] LEFT JOIN dbo.[Complaints] c ON r.[ComplaintId] = c.[ComplaintId]
        WHERE (r.[ReplNo] LIKE @any OR r.[CnNo] LIKE @prefix OR EXISTS (SELECT 1 FROM dbo.[ReplacementItemLns] i WHERE i.[ReplacementId] = r.[ReplacementId] AND (i.[OldSerialNo] LIKE @prefix OR i.[NewSerialNo] LIKE @prefix)))${replScope}
        ORDER BY r.[ReplDate] DESC`, values),
    ]);

    const title = (s?: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
    const groups = [
      { key: "serials", label: "Serial Numbers", items: serials.map((s: any) => ({ id: s.StickerId, title: s.SerialNo, subtitle: [title(s.Category), s.ModelName, s.WarrantyStatus ? `Warranty ${s.WarrantyStatus}` : s.Status].filter(Boolean).join(" · "), url: `/warranty/verify?serial=${encodeURIComponent(s.SerialNo)}` })) },
      { key: "calls", label: "Service Calls", items: calls.map((c: any) => ({ id: c.ComplaintId, title: c.ComplaintNo, subtitle: [c.CustomerName, c.Village, c.Status].filter(Boolean).join(" · "), url: `/service/complaints?q=${encodeURIComponent(c.ComplaintNo)}` })) },
      { key: "jobcards", label: "Job Cards", items: jobCards.map((j: any) => ({ id: j.JobCardId, title: j.JobCardNo, subtitle: [j.CustomerName, j.ComplaintNo, j.Status, `₹ ${Number(j.TotalEstimate || 0).toLocaleString("en-IN")}`].filter(Boolean).join(" · "), url: `/service/jobcards?open=${j.JobCardId}` })) },
      { key: "customers", label: "Customers", items: customers.map((c: any) => ({ id: c.CustomerId, title: c.CustomerName, subtitle: [c.Mobile, c.Village, c.District].filter(Boolean).join(" · "), url: `/warranty/customers?q=${encodeURIComponent(c.Mobile)}` })) },
      { key: "dealers", label: "Dealers", items: dealers.map((d: any) => ({ id: d.DealerId, title: d.FirmName, subtitle: [d.DealerCode, d.City, d.Status].filter(Boolean).join(" · "), url: `/warranty/dealers?q=${encodeURIComponent(d.FirmName)}` })) },
      { key: "replacements", label: "Replacements", items: replacements.map((r: any) => ({ id: r.ReplacementId, title: r.ReplNo, subtitle: [r.DealerName, r.Source, r.Status].filter(Boolean).join(" · "), url: `/service/replacements?q=${encodeURIComponent(r.ReplNo)}` })) },
    ].filter((g) => g.items.length && canUseForm(user, GROUP_FORM[g.key]));

    return NextResponse.json({ success: true, groups });
  } catch (err) {
    return handleApiError(err, "Search failed");
  }
}
