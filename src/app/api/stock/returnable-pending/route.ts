import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { JOB_WORKER_COLS, JOB_WORKER_JOINS, challanScope } from "@/lib/services/challans";
import { RETURN_PENDING_QTY } from "@/lib/services/challanReturns";

/**
 * Pending returnable report: returnable delivery challans still out (status Dispatched) with their items,
 * days out and days past the expected-back date. Same visibility as the Delivery Challan list.
 * A challan whose material has all come back (fresh + defective on Defective / Fresh Receipt) is not listed.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const where = `d.[ChallanType] = 'Returnable' AND d.[Status] = 'Dispatched' AND ${RETURN_PENDING_QTY} > 0${scope ? ` AND ${scope}` : ""}`;
    const [challans, items] = await Promise.all([
      runQuery(`SELECT d.[DeliveryChallanId], d.[ChallanNo], d.[ChallanDate], d.[ExpectedBackBy], d.[Purpose], d.[PartyKind], d.[DispatchLocName], d.[TransporterName], d.[TransportMode], d.[VehicleNo], d.[LrNo], d.[TotalValue], d.[Remarks],
          d.[ServiceCenterId], d.[WarehouseId], COALESCE(d.[WarehouseId], d.[ServiceCenterId]) AS [JobWorkerId], sc.[ServiceCenterName], sc.[ServiceCenterCode], ${JOB_WORKER_COLS},
          CASE WHEN wh.[WarehouseId] IS NULL THEN sc.[ContactPerson] END AS [ContactPerson], COALESCE(wh.[ContactNumber], sc.[Mobile]) AS [Mobile], mr.[RequestNo],
          DATEDIFF(day, d.[ChallanDate], CAST(SYSDATETIME() AS date)) AS [DaysOut],
          CASE WHEN d.[ExpectedBackBy] IS NULL THEN NULL ELSE DATEDIFF(day, d.[ExpectedBackBy], CAST(SYSDATETIME() AS date)) END AS [DaysOverdue],
          (SELECT COUNT(*) FROM dbo.[DeliveryChallanItemLns] l WHERE l.[DeliveryChallanId] = d.[DeliveryChallanId]) AS [ItemCount],
          (SELECT COALESCE(SUM(l.[Qty]), 0) FROM dbo.[DeliveryChallanItemLns] l WHERE l.[DeliveryChallanId] = d.[DeliveryChallanId]) AS [TotalQty]
        FROM dbo.[DeliveryChallans] d ${JOB_WORKER_JOINS} LEFT JOIN dbo.[MaterialRequests] mr ON d.[MaterialRequestId] = mr.[MaterialRequestId]
        WHERE ${where} ORDER BY d.[ExpectedBackBy], d.[ChallanDate]`, values),
      runQuery(`SELECT l.[DeliveryChallanId], l.[LineNo], l.[ItemCode], l.[ItemName], l.[Uom], l.[Qty], l.[Rate], l.[Amount], l.[Remarks]
        FROM dbo.[DeliveryChallanItemLns] l JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = l.[DeliveryChallanId]
        WHERE ${where} ORDER BY l.[DeliveryChallanId], l.[LineNo]`, values),
    ]);
    return NextResponse.json({ success: true, challans, items });
  } catch (err) {
    return handleApiError(err, "Could not load pending returnable challans");
  }
}
