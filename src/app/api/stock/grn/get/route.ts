import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { JOB_WORKER_COLS, JOB_WORKER_JOINS, challanScope } from "@/lib/services/challans";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/** Goods receipts against delivery challans (same visibility as the challans), or one receipt with its lines. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { ChallanReceiptId } = await request.json().catch(() => ({}));
    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const base = `FROM dbo.[ChallanReceipts] r JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = r.[DeliveryChallanId] ${JOB_WORKER_JOINS}
      LEFT JOIN dbo.[Users] u ON u.[UserId] = r.[InsertedByUserId]`;

    if (ChallanReceiptId) {
      const head = (await runQuery<any>(`SELECT r.*, d.[ChallanNo], d.[ChallanDate], d.[ChallanType], ${JOB_WORKER_COLS}, CONCAT(u.[FirstName], ' ', u.[LastName]) AS [ReceivedBy]
        ${base} WHERE r.[ChallanReceiptId] = @id${scope ? ` AND ${scope}` : ""}`, { ...values, id: ChallanReceiptId }))[0];
      if (!head) return fail(OUT_OF_SCOPE, 404);
      const items = await runQuery(`SELECT ri.*, l.[LineNo], l.[ItemCode], l.[ItemName], l.[Uom], l.[Qty] AS [Dispatched]
        FROM dbo.[ChallanReceiptItemLns] ri JOIN dbo.[DeliveryChallanItemLns] l ON l.[DeliveryChallanItemLnId] = ri.[DeliveryChallanItemLnId]
        WHERE ri.[ChallanReceiptId] = @id ORDER BY l.[LineNo]`, { id: ChallanReceiptId });
      return NextResponse.json({ success: true, receipt: head, items });
    }

    const receipts = await runQuery(`SELECT r.[ChallanReceiptId], r.[ReceiptNo], r.[ReceiptDate], r.[Remarks], r.[InsertedByUserId], r.[InsertedOn], d.[DeliveryChallanId], d.[ChallanNo], d.[ChallanDate], d.[ChallanType], ${JOB_WORKER_COLS},
        CONCAT(u.[FirstName], ' ', u.[LastName]) AS [ReceivedBy],
        (SELECT COUNT(*) FROM dbo.[ChallanReceiptItemLns] ri WHERE ri.[ChallanReceiptId] = r.[ChallanReceiptId] AND ri.[QtyReceived] > 0) AS [ItemCount],
        (SELECT COALESCE(SUM(ri.[QtyReceived]), 0) FROM dbo.[ChallanReceiptItemLns] ri WHERE ri.[ChallanReceiptId] = r.[ChallanReceiptId]) AS [QtyReceived]
      ${base}${scope ? ` WHERE ${scope}` : ""} ORDER BY r.[ReceiptDate] DESC, r.[InsertedOn] DESC`, values);
    return NextResponse.json({ success: true, receipts });
  } catch (err) {
    return handleApiError(err, "Could not load goods receipts");
  }
}
