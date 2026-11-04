import type { AuthSessionUser } from "@/lib/auth/jwt";
import { isHeadOffice, runQuery, type Run } from "@/lib/services/apiHelpers";

/**
 * Warehouse stock movements (same basis as the Warehouse Stock report):
 *   + goods received at the warehouse (GRN against a delivery challan)
 *   − material sent back on a defective / fresh receipt (returns against RDC)
 *   − material issued out of the warehouse (Material Issue)
 * `WarehouseId` is the column to filter on; values are the caller's parameters.
 */
export const WAREHOUSE_MOVEMENTS = `
  SELECT d.[WarehouseId], r.[ReceiptDate] AS [TxnDate], l.[ItemSource], COALESCE(l.[ErpItmId], l.[SpareId]) AS [ItemId], l.[ItemCode], l.[ItemName], l.[Uom], l.[Rate], ri.[QtyReceived] AS [QtyIn], CAST(0 AS decimal(18,3)) AS [QtyOut]
    FROM dbo.[ChallanReceiptItemLns] ri JOIN dbo.[ChallanReceipts] r ON r.[ChallanReceiptId] = ri.[ChallanReceiptId]
    JOIN dbo.[DeliveryChallanItemLns] l ON l.[DeliveryChallanItemLnId] = ri.[DeliveryChallanItemLnId] JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = r.[DeliveryChallanId]
    WHERE d.[WarehouseId] IS NOT NULL
  UNION ALL
  SELECT d.[WarehouseId], r.[ReturnDate], l.[ItemSource], COALESCE(l.[ErpItmId], l.[SpareId]), l.[ItemCode], l.[ItemName], l.[Uom], l.[Rate], 0, ri.[QtyFresh] + ri.[QtyDefective]
    FROM dbo.[ChallanReturnItemLns] ri JOIN dbo.[ChallanReturns] r ON r.[ChallanReturnId] = ri.[ChallanReturnId]
    JOIN dbo.[DeliveryChallanItemLns] l ON l.[DeliveryChallanItemLnId] = ri.[DeliveryChallanItemLnId] JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = r.[DeliveryChallanId]
    WHERE d.[WarehouseId] IS NOT NULL
  UNION ALL
  SELECT i.[WarehouseId], i.[IssueDate], il.[ItemSource], COALESCE(il.[ErpItmId], il.[SpareId]), il.[ItemCode], il.[ItemName], il.[Uom], il.[Rate], 0, il.[Qty]
    FROM dbo.[MaterialIssueItemLns] il JOIN dbo.[MaterialIssues] i ON i.[MaterialIssueId] = il.[MaterialIssueId]`;

export interface StockItem { key: string; ItemSource: "ERP" | "LOCAL"; ItemId: string; ItemCode: string | null; ItemName: string; Uom: string | null; Rate: number; Available: number }

/** Items currently in stock at one warehouse (balance > 0), with the available quantity and carried rate. */
export async function warehouseBalances(run: Run, warehouseId: string): Promise<StockItem[]> {
  const rows = await run<any>(`SELECT m.[ItemSource], m.[ItemId], MAX(m.[ItemCode]) AS [ItemCode], MAX(m.[ItemName]) AS [ItemName], MAX(m.[Uom]) AS [Uom], MAX(m.[Rate]) AS [Rate],
      SUM(m.[QtyIn] - m.[QtyOut]) AS [Balance]
    FROM (${WAREHOUSE_MOVEMENTS}) m WHERE m.[WarehouseId] = @wh
    GROUP BY m.[ItemSource], m.[ItemId] HAVING SUM(m.[QtyIn] - m.[QtyOut]) > 0 ORDER BY MAX(m.[ItemName])`, { wh: warehouseId });
  return rows.map((r) => ({
    key: `${r.ItemSource}|${r.ItemId}`.toUpperCase(), ItemSource: r.ItemSource, ItemId: String(r.ItemId), ItemCode: r.ItemCode || null, ItemName: r.ItemName,
    Uom: r.Uom || null, Rate: Number(r.Rate || 0), Available: Math.round(Number(r.Balance) * 1000) / 1000,
  }));
}

/** Warehouses a user may issue from: a warehouse login its own, head office every one, others none. */
export function issueWarehouses(user: AuthSessionUser) {
  if (isHeadOffice(user)) return runQuery<any>(`SELECT [WarehouseId], [WarehouseCode], [WarehouseName], [IsActive] FROM dbo.[Warehouses] ORDER BY [WarehouseName]`);
  if (user.Role === "WAREHOUSE") return runQuery<any>(`SELECT [WarehouseId], [WarehouseCode], [WarehouseName], [IsActive] FROM dbo.[Warehouses] WHERE [LoginUserId] = @u ORDER BY [WarehouseName]`, { u: user.UserId });
  return Promise.resolve([] as any[]);
}

/** Which issues a user sees: head office all; a warehouse login its own warehouse's; anyone else the ones they entered. */
export function issueScope(user: AuthSessionUser, alias: string, values: Record<string, unknown>) {
  if (isHeadOffice(user)) return "";
  values.scopeUser = user.UserId;
  if (user.Role === "WAREHOUSE") return `(${alias}.[InsertedByUserId] = @scopeUser OR ${alias}.[WarehouseId] IN (SELECT sw.[WarehouseId] FROM dbo.[Warehouses] sw WHERE sw.[LoginUserId] = @scopeUser))`;
  return `${alias}.[InsertedByUserId] = @scopeUser`;
}
