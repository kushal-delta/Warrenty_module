import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { callFilter, getScope, namedParams } from "@/lib/auth/scope";

/**
 * Parts Consumption: spares consumed on approved job cards, with the engineer / store they came from,
 * the component serial and the warranty vs chargeable split. Optional fromDate / toDate; follows the user's rights.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { fromDate, toDate } = await request.json().catch(() => ({}));
    const values: Record<string, unknown> = { from: fromDate ? new Date(fromDate) : new Date("2000-01-01"), to: toDate ? new Date(toDate) : new Date("2100-01-01") };
    const calls = callFilter(await getScope(user), "c", namedParams(values));
    const consumption = await runQuery(
      `SELECT TOP 2000 t.[StockTxnId], t.[TxnDate], t.[Qty], t.[Rate], t.[Amount], t.[FromLocType],
         CASE t.[FromLocType] WHEN 'ENG' THEN (SELECT CONCAT([FirstName], ' ', [LastName]) FROM dbo.[Users] WHERE [UserId] = t.[FromLocId])
                              ELSE (SELECT [ServiceCenterName] FROM dbo.[ServiceCenters] WHERE [ServiceCenterId] = t.[FromLocId]) END AS [FromLocName],
         s.[SpareCode], s.[SpareName], s.[Category], s.[Uom],
         j.[JobCardId], j.[JobCardNo], c.[ComplaintNo], c.[CustomerName],
         i.[SerialNo], i.[IsWarranty],
         sc.[ServiceCenterName], CONCAT(u.[FirstName], ' ', u.[LastName]) AS [EngineerName]
       FROM dbo.[StockTxns] t
       JOIN dbo.[Spares] s ON t.[SpareId] = s.[SpareId]
       JOIN dbo.[JobCardItemLns] i ON t.[JobCardItemLnId] = i.[JobCardItemLnId]
       JOIN dbo.[JobCards] j ON i.[JobCardId] = j.[JobCardId]
       JOIN dbo.[Complaints] c ON j.[ComplaintId] = c.[ComplaintId]
       LEFT JOIN dbo.[ServiceCenters] sc ON COALESCE(j.[ServiceCenterId], c.[ServiceCenterId]) = sc.[ServiceCenterId]
       LEFT JOIN dbo.[Users] u ON COALESCE(j.[EngineerUserId], c.[EngineerUserId]) = u.[UserId]
       WHERE t.[TxnType] = 'Consume' AND t.[TxnDate] BETWEEN @from AND @to${calls ? ` AND ${calls}` : ""}
       ORDER BY t.[TxnDate] DESC, j.[JobCardNo]`, values);
    return NextResponse.json({ success: true, consumption });
  } catch (err) {
    return handleApiError(err, "Failed to load parts consumption");
  }
}
