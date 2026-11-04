import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, isHeadOffice, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { challanScope } from "@/lib/services/challans";
import { erpRun } from "@/lib/services/erpLedgers";

/**
 * Warehouse stock report: per warehouse and item —
 *   Opening  = received − sent back before the period
 *   Inward   = received at the warehouse on goods receipts (GRN) in the period
 *   Outward  = sent back from the warehouse as fresh / defective (returns against RDC) or issued (Material Issue) in the period
 *   Closing  = Opening + Inward − Outward
 * Value uses the challan rate. Status uses the item's stock levels (Spares master minimum, or iERP min / max).
 * A warehouse login sees only its own warehouse.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { fromDate, toDate, warehouseId } = await request.json().catch(() => ({}));
    const values: Record<string, unknown> = { from: fromDate ? String(fromDate).slice(0, 10) : "1900-01-01", to: toDate ? String(toDate).slice(0, 10) : "2100-01-01" };
    const scope = challanScope(user, "d", values);
    const where: string[] = ["d.[WarehouseId] IS NOT NULL"];
    if (scope) where.push(scope);
    // A warehouse login only ever sees its own warehouse's stock.
    if (user.Role === "WAREHOUSE" && !isHeadOffice(user)) { values.myUser = user.UserId; where.push("d.[WarehouseId] IN (SELECT ow.[WarehouseId] FROM dbo.[Warehouses] ow WHERE ow.[LoginUserId] = @myUser)"); }
    if (warehouseId) { values.fWarehouse = warehouseId; where.push("d.[WarehouseId] = @fWarehouse"); }
    // Material issued out of the warehouse is outward too (same warehouse filters).
    const issueWhere = `${user.Role === "WAREHOUSE" && !isHeadOffice(user) ? " AND mi.[WarehouseId] IN (SELECT ow.[WarehouseId] FROM dbo.[Warehouses] ow WHERE ow.[LoginUserId] = @myUser)" : ""}${warehouseId ? " AND mi.[WarehouseId] = @fWarehouse" : ""}`;

    const movements = `
      SELECT d.[WarehouseId], r.[ReceiptDate] AS [TxnDate], l.[ItemSource], COALESCE(l.[ErpItmId], l.[SpareId]) AS [ItemId], l.[ItemCode], l.[ItemName], l.[Uom], l.[Rate], ri.[QtyReceived] AS [QtyIn], CAST(0 AS decimal(18,3)) AS [QtyOut]
        FROM dbo.[ChallanReceiptItemLns] ri JOIN dbo.[ChallanReceipts] r ON r.[ChallanReceiptId] = ri.[ChallanReceiptId]
        JOIN dbo.[DeliveryChallanItemLns] l ON l.[DeliveryChallanItemLnId] = ri.[DeliveryChallanItemLnId] JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = r.[DeliveryChallanId]
        WHERE ${where.join(" AND ")}
      UNION ALL
      SELECT d.[WarehouseId], r.[ReturnDate], l.[ItemSource], COALESCE(l.[ErpItmId], l.[SpareId]), l.[ItemCode], l.[ItemName], l.[Uom], l.[Rate], 0, ri.[QtyFresh] + ri.[QtyDefective]
        FROM dbo.[ChallanReturnItemLns] ri JOIN dbo.[ChallanReturns] r ON r.[ChallanReturnId] = ri.[ChallanReturnId]
        JOIN dbo.[DeliveryChallanItemLns] l ON l.[DeliveryChallanItemLnId] = ri.[DeliveryChallanItemLnId] JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = r.[DeliveryChallanId]
        WHERE ${where.join(" AND ")}
      UNION ALL
      SELECT mi.[WarehouseId], mi.[IssueDate], il.[ItemSource], COALESCE(il.[ErpItmId], il.[SpareId]), il.[ItemCode], il.[ItemName], il.[Uom], il.[Rate], 0, il.[Qty]
        FROM dbo.[MaterialIssueItemLns] il JOIN dbo.[MaterialIssues] mi ON mi.[MaterialIssueId] = il.[MaterialIssueId]
        WHERE 1 = 1${issueWhere}`;

    const [rows, warehouses] = await Promise.all([
      runQuery<any>(`SELECT m.[WarehouseId], w.[WarehouseName], w.[WarehouseCode], m.[ItemSource], m.[ItemId], MAX(m.[ItemCode]) AS [ItemCode], MAX(m.[ItemName]) AS [ItemName], MAX(m.[Uom]) AS [Uom], MAX(m.[Rate]) AS [Rate],
          SUM(CASE WHEN m.[TxnDate] < @from THEN m.[QtyIn] - m.[QtyOut] ELSE 0 END) AS [Opening],
          SUM(CASE WHEN m.[TxnDate] BETWEEN @from AND @to THEN m.[QtyIn] ELSE 0 END) AS [Inward],
          SUM(CASE WHEN m.[TxnDate] BETWEEN @from AND @to THEN m.[QtyOut] ELSE 0 END) AS [Outward],
          MAX(s.[MinStock]) AS [MinStock], MAX(s.[Category]) AS [Category]
        FROM (${movements}) m JOIN dbo.[Warehouses] w ON w.[WarehouseId] = m.[WarehouseId]
        LEFT JOIN dbo.[Spares] s ON m.[ItemSource] = 'LOCAL' AND s.[SpareId] = m.[ItemId]
        WHERE m.[TxnDate] <= @to
        GROUP BY m.[WarehouseId], w.[WarehouseName], w.[WarehouseCode], m.[ItemSource], m.[ItemId]
        ORDER BY MAX(m.[ItemName])`, values),
      user.Role === "WAREHOUSE" && !isHeadOffice(user)
        ? runQuery(`SELECT [WarehouseId], [WarehouseCode], [WarehouseName] FROM dbo.[Warehouses] WHERE [LoginUserId] = @u ORDER BY [WarehouseName]`, { u: user.UserId })
        : runQuery(`SELECT [WarehouseId], [WarehouseCode], [WarehouseName] FROM dbo.[Warehouses] ORDER BY [WarehouseName]`),
    ]);

    // iERP items carry their own min / max stock levels (Itms.MinStkLvlPriUM / MaxStkLvlPriUM).
    const erpIds = Array.from(new Set(rows.filter((r) => r.ItemSource === "ERP").map((r) => String(r.ItemId))));
    const erpLevels = new Map<string, { min: number | null; max: number | null; group: string | null }>();
    if (erpIds.length) {
      const p: Record<string, unknown> = {};
      const list = erpIds.map((id, i) => { p[`i${i}`] = id; return `@i${i}`; }).join(",");
      const lv = await erpRun<any>(`SELECT i.[ItmId], i.[MinStkLvlPriUM], i.[MaxStkLvlPriUM], s.[Name] AS [SubGrp] FROM dbo.[Itms] i LEFT JOIN dbo.[SubGrps] s ON s.[SubGrpId] = i.[SubGrpId] WHERE i.[ItmId] IN (${list})`, p).catch(() => []);
      lv.forEach((r) => erpLevels.set(String(r.ItmId).toLowerCase(), { min: Number(r.MinStkLvlPriUM) > 0 ? Number(r.MinStkLvlPriUM) : null, max: Number(r.MaxStkLvlPriUM) > 0 ? Number(r.MaxStkLvlPriUM) : null, group: r.SubGrp || null }));
    }

    const items = rows.map((r) => {
      const opening = Number(r.Opening || 0), inward = Number(r.Inward || 0), outward = Number(r.Outward || 0);
      const closing = Math.round((opening + inward - outward) * 1000) / 1000;
      const erp = r.ItemSource === "ERP" ? erpLevels.get(String(r.ItemId).toLowerCase()) : undefined;
      const min = r.ItemSource === "LOCAL" ? (Number(r.MinStock) > 0 ? Number(r.MinStock) : null) : erp?.min ?? null;
      const max = erp?.max ?? null;
      const status = closing <= 0 ? "Out of stock" : min != null && closing < min ? "Below minimum" : max != null && closing > max ? "Over maximum" : min == null && max == null ? "No levels set" : "OK";
      return { ...r, Group: r.ItemSource === "LOCAL" ? (r.Category || "Spares master") : (erp?.group || "iERP"), Opening: opening, Inward: inward, Outward: outward, Closing: closing, Rate: Number(r.Rate || 0), Min: min, Max: max, Status: status };
    });
    return NextResponse.json({ success: true, items, warehouses });
  } catch (err) {
    return handleApiError(err, "Failed to build the warehouse stock report");
  }
}
