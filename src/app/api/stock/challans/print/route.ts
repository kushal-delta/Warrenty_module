import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { challanScope, loadChallan } from "@/lib/services/challans";
import { challanLines } from "@/lib/services/challanReceipts";
import { getErpCompany } from "@/lib/services/erpCompany";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/**
 * Everything the delivery challan print needs: company letterhead, challan header with the job worker's
 * address, item lines with value and (returnable) received / pending quantities, and the goods receipts so far.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { DeliveryChallanId } = await request.json().catch(() => ({}));
    if (!DeliveryChallanId) return fail("DeliveryChallanId is required");
    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const challan = await loadChallan(runQuery, DeliveryChallanId);
    if (!challan) return fail("Delivery challan not found", 404);
    if (scope && !(await runQuery(`SELECT TOP 1 1 AS [ok] FROM dbo.[DeliveryChallans] d WHERE d.[DeliveryChallanId] = @id AND ${scope}`, { ...values, id: DeliveryChallanId })).length) return fail(OUT_OF_SCOPE, 403);

    const [items, received, receipts, party, createdBy, company] = await Promise.all([
      runQuery(`SELECT [DeliveryChallanItemLnId], [LineNo], [ItemCode], [ItemName], [Uom], [Qty], [Rate], [Amount], [Remarks] FROM dbo.[DeliveryChallanItemLns] WHERE [DeliveryChallanId] = @id ORDER BY [LineNo]`, { id: DeliveryChallanId }),
      challanLines(runQuery, DeliveryChallanId),
      runQuery(`SELECT r.[ReceiptNo], r.[ReceiptDate], r.[Remarks], CONCAT(u.[FirstName], ' ', u.[LastName]) AS [ReceivedBy],
          (SELECT COALESCE(SUM(ri.[QtyReceived]), 0) FROM dbo.[ChallanReceiptItemLns] ri WHERE ri.[ChallanReceiptId] = r.[ChallanReceiptId]) AS [Qty]
        FROM dbo.[ChallanReceipts] r LEFT JOIN dbo.[Users] u ON u.[UserId] = r.[InsertedByUserId] WHERE r.[DeliveryChallanId] = @id ORDER BY r.[ReceiptDate], r.[ReceiptNo]`, { id: DeliveryChallanId }),
      // Job worker address block: the warehouse, or the service centre on challans raised before warehouses.
      challan.WarehouseId
        ? runQuery<any>(`SELECT [WarehouseName] AS [Name], [WarehouseCode] AS [Code], [Location] AS [Address], [ContactNumber] AS [Phone], [Email], NULL AS [ContactPerson] FROM dbo.[Warehouses] WHERE [WarehouseId] = @id`, { id: challan.WarehouseId })
        : runQuery<any>(`SELECT sc.[ServiceCenterName] AS [Name], sc.[ServiceCenterCode] AS [Code], CONCAT_WS(', ', NULLIF(sc.[Address], ''), NULLIF(sc.[City], ''), NULLIF(sc.[District], ''), s.[StateName], NULLIF(sc.[Pincode], '')) AS [Address], sc.[Mobile] AS [Phone], sc.[Email], sc.[ContactPerson]
            FROM dbo.[ServiceCenters] sc LEFT JOIN dbo.[States] s ON s.[StateId] = sc.[StateId] WHERE sc.[ServiceCenterId] = @id`, { id: challan.ServiceCenterId }),
      runQuery<any>(`SELECT CONCAT(u.[FirstName], ' ', u.[LastName]) AS [Name] FROM dbo.[Users] u WHERE u.[UserId] = @id`, { id: challan.InsertedByUserId }),
      getErpCompany().catch(() => null),
    ]);
    const receivedByLine = new Map(received.map((l) => [String(l.DeliveryChallanItemLnId).toLowerCase(), l]));
    const lines = items.map((i: any) => {
      const r = receivedByLine.get(String(i.DeliveryChallanItemLnId).toLowerCase());
      return { ...i, Received: r?.Received ?? 0, Pending: r?.Pending ?? Number(i.Qty) };
    });
    return NextResponse.json({ success: true, challan, lines, receipts, party: party[0] || null, createdBy: createdBy[0]?.Name?.trim() || null, company });
  } catch (err) {
    return handleApiError(err, "Could not prepare the challan print");
  }
}
