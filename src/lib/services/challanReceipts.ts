import type { Run } from "@/lib/services/apiHelpers";

/**
 * Goods receipt (GRN) against a delivery challan: per challan line, the quantity dispatched,
 * already received on earlier receipts and still pending.
 */
export async function challanLines(run: Run, challanId: string) {
  const rows = await run<any>(`SELECT l.[DeliveryChallanItemLnId], l.[LineNo], l.[ItemCode], l.[ItemName], l.[Uom], l.[Qty] AS [Dispatched],
      COALESCE((SELECT SUM(ri.[QtyReceived]) FROM dbo.[ChallanReceiptItemLns] ri WHERE ri.[DeliveryChallanItemLnId] = l.[DeliveryChallanItemLnId]), 0) AS [Received]
    FROM dbo.[DeliveryChallanItemLns] l WHERE l.[DeliveryChallanId] = @id ORDER BY l.[LineNo]`, { id: challanId });
  return rows.map((r) => ({ ...r, Dispatched: Number(r.Dispatched), Received: Number(r.Received), Pending: Math.max(0, Math.round((Number(r.Dispatched) - Number(r.Received)) * 1000) / 1000) }));
}

/** SQL for "quantity still to receive" on a challan (alias d). */
export const PENDING_QTY = `(SELECT COALESCE(SUM(pl.[Qty]), 0) FROM dbo.[DeliveryChallanItemLns] pl WHERE pl.[DeliveryChallanId] = d.[DeliveryChallanId])
  - (SELECT COALESCE(SUM(pri.[QtyReceived]), 0) FROM dbo.[ChallanReceiptItemLns] pri JOIN dbo.[ChallanReceipts] pr ON pr.[ChallanReceiptId] = pri.[ChallanReceiptId] WHERE pr.[DeliveryChallanId] = d.[DeliveryChallanId])`;
