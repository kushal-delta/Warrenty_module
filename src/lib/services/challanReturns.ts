import type { Run } from "@/lib/services/apiHelpers";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Defective / fresh receipt against a returnable delivery challan: per challan line, the quantity issued,
 * already received back as fresh and as defective, and still pending (issued - fresh - defective).
 */
export async function returnLines(run: Run, challanId: string) {
  const rows = await run<any>(`SELECT l.[DeliveryChallanItemLnId], l.[LineNo], l.[ItemCode], l.[ItemName], l.[Uom], l.[Qty] AS [Issued], l.[Rate],
      COALESCE((SELECT SUM(ri.[QtyFresh]) FROM dbo.[ChallanReturnItemLns] ri WHERE ri.[DeliveryChallanItemLnId] = l.[DeliveryChallanItemLnId]), 0) AS [Fresh],
      COALESCE((SELECT SUM(ri.[QtyDefective]) FROM dbo.[ChallanReturnItemLns] ri WHERE ri.[DeliveryChallanItemLnId] = l.[DeliveryChallanItemLnId]), 0) AS [Defective]
    FROM dbo.[DeliveryChallanItemLns] l WHERE l.[DeliveryChallanId] = @id ORDER BY l.[LineNo]`, { id: challanId });
  return rows.map((r) => {
    const issued = Number(r.Issued), fresh = Number(r.Fresh), defective = Number(r.Defective);
    return { ...r, Issued: issued, Fresh: fresh, Defective: defective, Rate: Number(r.Rate || 0), Pending: Math.max(0, round3(issued - fresh - defective)) };
  });
}

/** SQL for "quantity still to come back" on one challan line (alias l). */
export const RETURN_PENDING_QTY_LINE = `(l.[Qty] - COALESCE((SELECT SUM(pli.[QtyFresh] + pli.[QtyDefective]) FROM dbo.[ChallanReturnItemLns] pli WHERE pli.[DeliveryChallanItemLnId] = l.[DeliveryChallanItemLnId]), 0))`;

/** SQL for "quantity still to come back" on a challan (alias d). */
export const RETURN_PENDING_QTY = `(SELECT COALESCE(SUM(pl.[Qty]), 0) FROM dbo.[DeliveryChallanItemLns] pl WHERE pl.[DeliveryChallanId] = d.[DeliveryChallanId])
  - (SELECT COALESCE(SUM(pri.[QtyFresh] + pri.[QtyDefective]), 0) FROM dbo.[ChallanReturnItemLns] pri JOIN dbo.[ChallanReturns] pr ON pr.[ChallanReturnId] = pri.[ChallanReturnId] WHERE pr.[DeliveryChallanId] = d.[DeliveryChallanId])`;
