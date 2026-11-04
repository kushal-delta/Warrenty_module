import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { getScope } from "@/lib/auth/scope";

const OPEN_CALL = "c.[Status] NOT IN ('Closed','Resolved','Cancelled')";
const DAY = 24 * 60 * 60 * 1000;

/** Warranty state of one serial as the customer should read it. */
function warrantyState(w: any) {
  if (w.Status !== "Active") return w.Status;
  const daysLeft = Math.ceil((new Date(w.EndDate).getTime() - Date.now()) / DAY);
  return daysLeft < 0 ? "Expired" : daysLeft <= 45 ? "Ending soon" : "Active";
}

/**
 * Home page data for portal logins.
 *  - DEALER: KPI tiles and latest installations of their own dealership ("Dealer Dashboard").
 *  - CUSTOMER: each of their pump sets with its pump / motor / controller warranties ("My Products").
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const scope = await getScope(user);
    if (!scope.portal) return fail("This page is for dealer and customer logins", 400);
    if (!scope.dealerId && !scope.customerId) return NextResponse.json({ success: true, portal: scope.portal, linked: false });

    if (scope.portal === "DEALER") {
      const id = { d: scope.dealerId };
      const [dealer, kpi, latest] = await Promise.all([
        runQuery(`SELECT [DealerId], [DealerCode], [FirmName], [City], [District], [Mobile], [Status] FROM dbo.[Dealers] WHERE [DealerId] = @d`, id),
        runQuery(`SELECT
            (SELECT COUNT(*) FROM dbo.[Installations] i WHERE i.[DealerId] = @d) AS [PumpSets],
            (SELECT COUNT(*) FROM dbo.[Warranties] w WHERE w.[DealerId] = @d AND w.[Status] <> 'Replaced') AS [Serials],
            (SELECT COUNT(*) FROM dbo.[Warranties] w WHERE w.[DealerId] = @d AND w.[Status] = 'Active' AND w.[EndDate] >= SYSUTCDATETIME()) AS [ActiveSerials],
            (SELECT COUNT(*) FROM dbo.[Warranties] w WHERE w.[DealerId] = @d AND w.[Status] = 'Active' AND w.[EndDate] >= SYSUTCDATETIME() AND w.[EndDate] < DATEADD(day, 45, SYSUTCDATETIME())) AS [Ending45],
            (SELECT COUNT(*) FROM dbo.[Complaints] c WHERE c.[DealerId] = @d AND ${OPEN_CALL}) AS [OpenCalls],
            (SELECT COUNT(*) FROM dbo.[Complaints] c WHERE c.[DealerId] = @d) AS [TotalCalls]`, id),
        runQuery(`SELECT TOP 10 i.[InstallationId], i.[InstallNo], i.[InstallDate], i.[Village], i.[District], cu.[CustomerName], cu.[Mobile],
            (SELECT COUNT(*) FROM dbo.[Warranties] w WHERE w.[InstallationId] = i.[InstallationId] AND w.[Status] <> 'Replaced') AS [Serials]
          FROM dbo.[Installations] i LEFT JOIN dbo.[Customers] cu ON i.[CustomerId] = cu.[CustomerId]
          WHERE i.[DealerId] = @d ORDER BY i.[InstallDate] DESC, i.[InsertedOn] DESC`, id),
      ]);
      return NextResponse.json({ success: true, portal: "DEALER", linked: true, dealer: dealer[0] || null, kpis: kpi[0] || {}, installations: latest });
    }

    const id = { c: scope.customerId, m: scope.customerMobile };
    const [customer, installations, warranties, calls] = await Promise.all([
      runQuery(`SELECT cu.[CustomerId], cu.[CustomerName], cu.[Mobile], cu.[Village], cu.[District], s.[StateName] FROM dbo.[Customers] cu LEFT JOIN dbo.[States] s ON cu.[StateId] = s.[StateId] WHERE cu.[CustomerId] = @c`, id),
      runQuery(`SELECT i.[InstallationId], i.[InstallNo], i.[InstallDate], i.[Village], i.[District], i.[StateId], i.[SiteAddress], i.[Pincode], i.[DealerId], s.[StateName], d.[FirmName] AS [DealerName]
        FROM dbo.[Installations] i LEFT JOIN dbo.[States] s ON i.[StateId] = s.[StateId] LEFT JOIN dbo.[Dealers] d ON i.[DealerId] = d.[DealerId]
        WHERE i.[CustomerId] = @c ORDER BY i.[InstallDate] DESC`, id),
      runQuery(`SELECT w.[WarrantyId], w.[InstallationId], w.[SerialNo], w.[Category], w.[StartDate], w.[EndDate], w.[Status], p.[ModelName]
        FROM dbo.[Warranties] w LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId]
        WHERE w.[CustomerId] = @c AND w.[Status] <> 'Replaced'
        ORDER BY CASE w.[Category] WHEN 'PUMP' THEN 0 WHEN 'MOTOR' THEN 1 WHEN 'CONTROLLER' THEN 2 ELSE 3 END`, id),
      runQuery(`SELECT COUNT(*) AS [Open] FROM dbo.[Complaints] c WHERE (c.[CustomerId] = @c OR (c.[CustomerId] IS NULL AND c.[Mobile] = @m)) AND ${OPEN_CALL}`, id),
    ]);
    const products = installations.map((inst: any) => {
      const parts = warranties.filter((w: any) => String(w.InstallationId).toLowerCase() === String(inst.InstallationId).toLowerCase()).map((w: any) => ({ ...w, State: warrantyState(w) }));
      const pump = parts.find((w: any) => w.Category === "PUMP") || parts[0];
      return {
        ...inst,
        Title: pump?.ModelName || inst.InstallNo,
        Parts: parts,
        // A call raised on this set is a warranty call while any part is still covered.
        WarrantyStatus: parts.some((p: any) => p.State === "Active" || p.State === "Ending soon") ? "In Warranty" : "Out of Warranty",
      };
    });
    return NextResponse.json({ success: true, portal: "CUSTOMER", linked: true, customer: customer[0] || null, products, openCalls: Number(calls[0]?.Open || 0) });
  } catch (err) {
    return handleApiError(err, "Failed to load your dashboard");
  }
}
