import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { challanCatalogue, erpLocs, erpTransporters, textLists } from "@/lib/services/challans";

/**
 * Everything the Delivery Challan form needs: text lists, iERP stores and transporters, the item catalogue and
 * approved material requests. With `MaterialRequestId` it returns just that request's lines (to prefill items).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { MaterialRequestId, DeliveryChallanId } = await request.json().catch(() => ({}));

    if (MaterialRequestId) {
      const [head] = await runQuery<any>(`SELECT [MaterialRequestId], [ServiceCenterId], [Status] FROM dbo.[MaterialRequests] WHERE [MaterialRequestId] = @id`, { id: MaterialRequestId });
      if (!head || head.Status !== "Approved") return fail("Only an approved material request can be dispatched", 400);
      const requestItems = await runQuery(`SELECT [ItemSource], [ErpItmId], [SpareId], [ItemCode], [ItemName], [Uom], [Qty], [Remarks] FROM dbo.[MaterialRequestItemLns] WHERE [MaterialRequestId] = @id ORDER BY [LineNo]`, { id: MaterialRequestId });
      return NextResponse.json({ success: true, request: head, requestItems });
    }

    const [lists, locs, transporters, items, requests] = await Promise.all([
      textLists(),
      erpLocs(),
      erpTransporters(),
      challanCatalogue(user),
      // Approved requests not yet on a challan (plus the one already on the challan being edited).
      runQuery(`SELECT r.[MaterialRequestId], r.[RequestNo], r.[RequestType], r.[RequestDate], r.[ServiceCenterId], sc.[ServiceCenterName]
        FROM dbo.[MaterialRequests] r LEFT JOIN dbo.[ServiceCenters] sc ON r.[ServiceCenterId] = sc.[ServiceCenterId]
        WHERE r.[Status] = 'Approved' AND NOT EXISTS (SELECT 1 FROM dbo.[DeliveryChallans] d WHERE d.[MaterialRequestId] = r.[MaterialRequestId] AND (@editing IS NULL OR d.[DeliveryChallanId] <> @editing))
        ORDER BY r.[RequestDate] DESC`, { editing: DeliveryChallanId || null }),
    ]);
    return NextResponse.json({ success: true, textLists: lists, locs, transporters, items, approvedRequests: requests });
  } catch (err) {
    return handleApiError(err, "Could not load the challan lists");
  }
}
