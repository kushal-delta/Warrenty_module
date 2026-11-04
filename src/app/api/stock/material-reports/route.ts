import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { REQUEST_FOR_COLS, REQUEST_FOR_JOINS, requestScope } from "@/lib/services/materialRequests";
import { JOB_WORKER_COLS, JOB_WORKER_JOINS, challanScope } from "@/lib/services/challans";

/**
 * Material & challan MIS in one request (same visibility as the Material Request and Delivery Challan screens):
 *  - material requests (header) and their item lines with the decision
 *  - delivery challan lines with goods received (GRN), fresh / defective returned and pending
 *  - fresh / defective returns
 * Optional fromDate / toDate on the document date and a job worker (warehouse) filter on challans.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { fromDate, toDate, warehouseId } = await request.json().catch(() => ({}));
    const values: Record<string, unknown> = { from: fromDate ? String(fromDate).slice(0, 10) : "2000-01-01", to: toDate ? String(toDate).slice(0, 10) : "2100-01-01" };
    const mrScope = requestScope(user, "r", values);
    const dcScope = challanScope(user, "d", values);
    if (warehouseId) values.fWarehouse = warehouseId;
    const dcWhere = `d.[ChallanDate] BETWEEN @from AND @to${dcScope ? ` AND ${dcScope}` : ""}${warehouseId ? " AND d.[WarehouseId] = @fWarehouse" : ""}`;

    const [requests, requestLines, challanLines, returns] = await Promise.all([
      runQuery(`SELECT r.[MaterialRequestId], r.[RequestNo], r.[RequestDate], r.[RequestType], r.[RequiredBy], r.[Priority], r.[Status], r.[Remarks], r.[DecisionOn], r.[DecisionRemarks],
          sc.[ServiceCenterName], ${REQUEST_FOR_COLS}, CONCAT(u.[FirstName], ' ', u.[LastName]) AS [RequestedBy], (SELECT CONCAT(du.[FirstName], ' ', du.[LastName]) FROM dbo.[Users] du WHERE du.[UserId] = r.[DecisionByUserId]) AS [DecisionBy],
          (SELECT COUNT(*) FROM dbo.[MaterialRequestItemLns] l WHERE l.[MaterialRequestId] = r.[MaterialRequestId]) AS [ItemCount],
          (SELECT COALESCE(SUM(l.[Qty]), 0) FROM dbo.[MaterialRequestItemLns] l WHERE l.[MaterialRequestId] = r.[MaterialRequestId]) AS [TotalQty],
          (SELECT TOP 1 dc.[ChallanNo] FROM dbo.[DeliveryChallans] dc WHERE dc.[MaterialRequestId] = r.[MaterialRequestId]) AS [ChallanNo]
        FROM dbo.[MaterialRequests] r ${REQUEST_FOR_JOINS} LEFT JOIN dbo.[Users] u ON u.[UserId] = r.[InsertedByUserId]
        WHERE r.[RequestDate] BETWEEN @from AND @to${mrScope ? ` AND ${mrScope}` : ""} ORDER BY r.[RequestDate] DESC, r.[RequestNo] DESC`, values),
      runQuery(`SELECT r.[RequestNo], r.[RequestDate], r.[RequestType], r.[Status], sc.[ServiceCenterName], ${REQUEST_FOR_COLS}, l.[ItemCode], l.[ItemName], l.[Uom], l.[Qty]
        FROM dbo.[MaterialRequestItemLns] l JOIN dbo.[MaterialRequests] r ON r.[MaterialRequestId] = l.[MaterialRequestId] ${REQUEST_FOR_JOINS}
        WHERE r.[RequestDate] BETWEEN @from AND @to${mrScope ? ` AND ${mrScope}` : ""}`, values),
      runQuery(`SELECT d.[DeliveryChallanId], d.[ChallanNo], d.[ChallanDate], d.[ChallanType], d.[Purpose], d.[DispatchLocName], d.[ExpectedBackBy], d.[TransporterName], d.[VehicleNo], d.[Status],
          COALESCE(d.[WarehouseId], d.[ServiceCenterId]) AS [JobWorkerId], ${JOB_WORKER_COLS}, mr.[RequestNo],
          l.[DeliveryChallanItemLnId], l.[LineNo], l.[ItemCode], l.[ItemName], l.[Uom], l.[Qty], l.[Rate], l.[Amount],
          COALESCE((SELECT SUM(gi.[QtyReceived]) FROM dbo.[ChallanReceiptItemLns] gi WHERE gi.[DeliveryChallanItemLnId] = l.[DeliveryChallanItemLnId]), 0) AS [Received],
          COALESCE((SELECT SUM(ri.[QtyFresh]) FROM dbo.[ChallanReturnItemLns] ri WHERE ri.[DeliveryChallanItemLnId] = l.[DeliveryChallanItemLnId]), 0) AS [Fresh],
          COALESCE((SELECT SUM(ri.[QtyDefective]) FROM dbo.[ChallanReturnItemLns] ri WHERE ri.[DeliveryChallanItemLnId] = l.[DeliveryChallanItemLnId]), 0) AS [Defective]
        FROM dbo.[DeliveryChallanItemLns] l JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = l.[DeliveryChallanId] ${JOB_WORKER_JOINS}
        LEFT JOIN dbo.[MaterialRequests] mr ON mr.[MaterialRequestId] = d.[MaterialRequestId]
        WHERE ${dcWhere} ORDER BY d.[ChallanDate] DESC, d.[ChallanNo] DESC, l.[LineNo]`, values),
      runQuery(`SELECT r.[ReturnNo], r.[ReturnDate], r.[ReceivedThrough], d.[ChallanNo], d.[ChallanDate], ${JOB_WORKER_COLS}, l.[ItemCode], l.[ItemName], l.[Uom], l.[Qty] AS [Issued], l.[Rate],
          ri.[QtyFresh], ri.[QtyDefective], ri.[DefectSerial], ri.[Remarks]
        FROM dbo.[ChallanReturnItemLns] ri JOIN dbo.[ChallanReturns] r ON r.[ChallanReturnId] = ri.[ChallanReturnId]
        JOIN dbo.[DeliveryChallanItemLns] l ON l.[DeliveryChallanItemLnId] = ri.[DeliveryChallanItemLnId]
        JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = r.[DeliveryChallanId] ${JOB_WORKER_JOINS}
        WHERE r.[ReturnDate] BETWEEN @from AND @to${dcScope ? ` AND ${dcScope}` : ""}${warehouseId ? " AND d.[WarehouseId] = @fWarehouse" : ""}
        ORDER BY r.[ReturnDate] DESC, r.[ReturnNo] DESC`, values),
    ]);
    return NextResponse.json({ success: true, requests, requestLines, challanLines, returns });
  } catch (err) {
    return handleApiError(err, "Failed to build material & challan reports");
  }
}
