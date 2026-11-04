import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { JOB_WORKER_COLS, JOB_WORKER_JOINS, challanScope } from "@/lib/services/challans";
import { RETURN_PENDING_QTY_LINE } from "@/lib/services/challanReturns";

/**
 * Defective / fresh receipts, one row per receipt line (as in the prototype grid): receipt, challan, job worker,
 * item, issued, fresh, defective, pending on the challan line, defect serial and how it was received.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const [lines, pendingChallans] = await Promise.all([
      runQuery(`SELECT r.[ChallanReturnId], r.[ReturnNo], r.[ReturnDate], r.[ReceivedThrough], r.[Remarks] AS [ReturnRemarks], r.[InsertedByUserId], CONCAT(u.[FirstName], ' ', u.[LastName]) AS [ReceivedBy],
          d.[DeliveryChallanId], d.[ChallanNo], d.[ChallanDate], COALESCE(d.[WarehouseId], d.[ServiceCenterId]) AS [JobWorkerId], ${JOB_WORKER_COLS},
          ri.[ChallanReturnItemLnId], ri.[QtyFresh], ri.[QtyDefective], ri.[DefectSerial], ri.[Remarks],
          l.[DeliveryChallanItemLnId], l.[ItemCode], l.[ItemName], l.[Uom], l.[Qty] AS [Issued], l.[Rate], ${RETURN_PENDING_QTY_LINE} AS [PendingOnLine]
        FROM dbo.[ChallanReturnItemLns] ri
        JOIN dbo.[ChallanReturns] r ON r.[ChallanReturnId] = ri.[ChallanReturnId]
        JOIN dbo.[DeliveryChallanItemLns] l ON l.[DeliveryChallanItemLnId] = ri.[DeliveryChallanItemLnId]
        JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = r.[DeliveryChallanId] ${JOB_WORKER_JOINS}
        LEFT JOIN dbo.[Users] u ON u.[UserId] = r.[InsertedByUserId]
        ${scope ? `WHERE ${scope}` : ""} ORDER BY r.[ReturnDate] DESC, r.[ReturnNo] DESC, l.[LineNo]`, values),
      // Returnable challans with quantity still to come back (KPI tiles).
      runQuery<any>(`SELECT COUNT(*) AS [Challans], COALESCE(SUM(x.[Pending]), 0) AS [Qty] FROM (
          SELECT (SELECT COALESCE(SUM(pl.[Qty]), 0) FROM dbo.[DeliveryChallanItemLns] pl WHERE pl.[DeliveryChallanId] = d.[DeliveryChallanId])
            - (SELECT COALESCE(SUM(pri.[QtyFresh] + pri.[QtyDefective]), 0) FROM dbo.[ChallanReturnItemLns] pri JOIN dbo.[ChallanReturns] pr ON pr.[ChallanReturnId] = pri.[ChallanReturnId] WHERE pr.[DeliveryChallanId] = d.[DeliveryChallanId]) AS [Pending]
          FROM dbo.[DeliveryChallans] d WHERE d.[ChallanType] = 'Returnable' AND d.[Status] <> 'Cancelled'${scope ? ` AND ${scope}` : ""}
        ) x WHERE x.[Pending] > 0`, values),
    ]);
    return NextResponse.json({ success: true, lines, pending: pendingChallans[0] || { Challans: 0, Qty: 0 } });
  } catch (err) {
    return handleApiError(err, "Could not load defective / fresh receipts");
  }
}
