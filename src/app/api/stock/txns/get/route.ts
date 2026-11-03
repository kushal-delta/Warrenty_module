import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";
import { visibleStockLocations } from "@/lib/services/stock";

const LOCATION_NAME = (side: "From" | "To") => `CASE t.[${side}LocType]
  WHEN 'SC' THEN (SELECT [ServiceCenterName] FROM dbo.[ServiceCenters] WHERE [ServiceCenterId] = t.[${side}LocId])
  WHEN 'DAMAGED' THEN CONCAT((SELECT [ServiceCenterName] FROM dbo.[ServiceCenters] WHERE [ServiceCenterId] = t.[${side}LocId]), ' (faulty)')
  WHEN 'ENG' THEN (SELECT CONCAT([FirstName], ' ', [LastName]) FROM dbo.[Users] WHERE [UserId] = t.[${side}LocId])
  ELSE NULL END`;

/** Stock ledger rows, newest first, limited to the locations the user may see. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { txnType, spareId, fromDate, toDate, limit = 1000 } = await request.json().catch(() => ({}));
    const where: string[] = [], params: unknown[] = [];
    if (txnType) { where.push(`t.[TxnType] = @p${params.length}`); params.push(txnType); }
    if (spareId) { where.push(`t.[SpareId] = @p${params.length}`); params.push(spareId); }
    if (fromDate) { where.push(`t.[TxnDate] >= @p${params.length}`); params.push(new Date(fromDate)); }
    if (toDate) { where.push(`t.[TxnDate] <= @p${params.length}`); params.push(new Date(toDate)); }
    const visible = await visibleStockLocations(user);
    if (visible) {
      const list = visible.map((id) => { params.push(id); return `@p${params.length - 1}`; }).join(",");
      where.push(`(t.[FromLocId] IN (${list}) OR t.[ToLocId] IN (${list}))`);
    }
    params.push(Number(limit) || 1000);
    const txns = await query(
      `SELECT TOP (@p${params.length - 1}) t.*, s.[SpareCode], s.[SpareName], s.[Uom], ${LOCATION_NAME("From")} AS [FromLocName], ${LOCATION_NAME("To")} AS [ToLocName],
        jc.[JobCardNo], u.[Username] AS [CreatedBy]
       FROM dbo.[StockTxns] t JOIN dbo.[Spares] s ON t.[SpareId] = s.[SpareId]
       LEFT JOIN dbo.[JobCardItemLns] ji ON t.[JobCardItemLnId] = ji.[JobCardItemLnId] LEFT JOIN dbo.[JobCards] jc ON ji.[JobCardId] = jc.[JobCardId]
       LEFT JOIN dbo.[Users] u ON t.[InsertedByUserId] = u.[UserId]
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY t.[TxnDate] DESC, t.[InsertedOn] DESC`,
      params
    );
    return NextResponse.json({ success: true, txns });
  } catch (err) {
    return handleApiError(err, "Failed to load stock ledger");
  }
}
