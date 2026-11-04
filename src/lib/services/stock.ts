import { randomUUID } from "crypto";
import { query } from "@/lib/sqlserver";
import type { Run } from "@/lib/services/apiHelpers";
import type { AuthSessionUser } from "@/lib/auth/jwt";

/** Location ids a user may see: HO everything (undefined), a manager their centre and its engineers, an engineer their own van. */
export async function visibleStockLocations(user: AuthSessionUser): Promise<string[] | undefined> {
  if (user.Role === "ENGINEER") return [user.UserId];
  if (user.Role === "MANAGER" && user.ServiceCenterId) {
    const engineers = await query<any>(`SELECT [UserId] FROM dbo.[Users] WHERE [Role] = 'ENGINEER' AND [ServiceCenterId] = @p0`, [user.ServiceCenterId]);
    return [user.ServiceCenterId, ...engineers.map((e) => e.UserId)];
  }
  return undefined;
}

/**
 * Stock is a ledger: every StockTxns row moves Qty from (FromLocType, FromLocId) to (ToLocType, ToLocId).
 * A location's balance = quantity moved in − quantity moved out. Locations outside the service
 * network (supplier, customer, written off) are recorded with a NULL type and add nothing.
 */
const MOVEMENTS = `
  SELECT [ToLocType] AS [LocType], [ToLocId] AS [LocId], [SpareId], [Qty] FROM dbo.[StockTxns] WHERE [ToLocType] IN ('SC','ENG','DAMAGED')
  UNION ALL
  SELECT [FromLocType], [FromLocId], [SpareId], -[Qty] FROM dbo.[StockTxns] WHERE [FromLocType] IN ('SC','ENG','DAMAGED')`;

export interface StockBalanceRow {
  LocType: string;
  LocId: string;
  SpareId: string;
  Balance: number;
}

export async function stockBalances(run: Run, filter: { locType?: string; locIds?: string[]; spareId?: string } = {}) {
  const where: string[] = [], values: Record<string, unknown> = {};
  if (filter.locType) { where.push("m.[LocType] = @locType"); values.locType = filter.locType; }
  if (filter.spareId) { where.push("m.[SpareId] = @spareId"); values.spareId = filter.spareId; }
  if (filter.locIds) {
    if (!filter.locIds.length) return [];
    where.push(`m.[LocId] IN (${filter.locIds.map((id, index) => { values[`loc${index}`] = id; return `@loc${index}`; }).join(",")})`);
  }
  return run<StockBalanceRow>(`SELECT m.[LocType], m.[LocId], m.[SpareId], SUM(m.[Qty]) AS [Balance] FROM (${MOVEMENTS}) m ${where.length ? `WHERE ${where.join(" AND ")}` : ""} GROUP BY m.[LocType], m.[LocId], m.[SpareId]`, values);
}

export async function balanceAt(run: Run, spareId: string, locType: string, locId: string) {
  const rows = await run<{ Balance: number }>(`SELECT COALESCE(SUM(m.[Qty]), 0) AS [Balance] FROM (${MOVEMENTS}) m WHERE m.[SpareId] = @spareId AND m.[LocType] = @locType AND m.[LocId] = @locId`, { spareId, locType, locId });
  return Number(rows[0]?.Balance || 0);
}

export interface StockTxnInput {
  TxnDate?: Date;
  TxnType: string;
  SpareId: string;
  Qty: number;
  Rate: number;
  FromLocType?: string | null;
  FromLocId?: string | null;
  ToLocType?: string | null;
  ToLocId?: string | null;
  JobCardItemLnId?: string | null;
  Remarks?: string | null;
}

export async function insertStockTxn(run: Run, txn: StockTxnInput, userId: string) {
  return (await run(
    `INSERT INTO dbo.[StockTxns] ([StockTxnId],[TxnDate],[TxnType],[SpareId],[Qty],[Rate],[Amount],[FromLocType],[FromLocId],[ToLocType],[ToLocId],[JobCardItemLnId],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn])
     OUTPUT INSERTED.* VALUES (@id,@txnDate,@txnType,@spareId,@qty,@rate,@amount,@fromType,@fromId,@toType,@toId,@jobCardItemLnId,@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
    {
      id: randomUUID(), txnDate: txn.TxnDate || new Date(), txnType: txn.TxnType, spareId: txn.SpareId, qty: txn.Qty, rate: txn.Rate.toFixed(2), amount: (txn.Qty * txn.Rate).toFixed(2),
      fromType: txn.FromLocType || null, fromId: txn.FromLocId || null, toType: txn.ToLocType || null, toId: txn.ToLocId || null,
      jobCardItemLnId: txn.JobCardItemLnId || null, remarks: txn.Remarks || null, userId,
    }
  ))[0];
}

interface JobCardStockContext { JobCardId: string; JobCardNo: string; EngineerUserId?: string | null; ServiceCenterId?: string | null; CustomerId?: string | null }

/** Spares a job card needs that the engineer van + service-centre store cannot cover. Empty string when stock is enough. */
export async function jobCardShortage(run: Run, job: JobCardStockContext) {
  const needs = await run<any>(`SELECT i.[SpareId], s.[SpareName], SUM(i.[Qty]) AS [Qty] FROM dbo.[JobCardItemLns] i JOIN dbo.[Spares] s ON i.[SpareId] = s.[SpareId] WHERE i.[JobCardId] = @id GROUP BY i.[SpareId], s.[SpareName]`, { id: job.JobCardId });
  const short: string[] = [];
  for (const need of needs) {
    const van = job.EngineerUserId ? Math.max(0, await balanceAt(run, need.SpareId, "ENG", job.EngineerUserId)) : 0;
    const store = job.ServiceCenterId ? Math.max(0, await balanceAt(run, need.SpareId, "SC", job.ServiceCenterId)) : 0;
    if (van + store < need.Qty) short.push(`${need.SpareName} — needs ${need.Qty}, available ${van + store}`);
  }
  return short.length ? `Not enough stock: ${short.join("; ")}. Receive or transfer stock first (Stock → Stock Ledger & Entry).` : "";
}

/** Posts consumption for an approved job card: engineer van first, the rest from the service-centre store. Warranty parts are held as faulty stock. */
export async function postJobCardStock(run: Run, job: JobCardStockContext, userId: string) {
  const items = await run<any>(`SELECT [JobCardItemLnId], [SpareId], [Qty], [Rate], [IsWarranty] FROM dbo.[JobCardItemLns] WHERE [JobCardId] = @id AND [SpareId] IS NOT NULL`, { id: job.JobCardId }); // labour lines move no stock
  for (const item of items) {
    const fromVan = job.EngineerUserId ? Math.min(item.Qty, Math.max(0, await balanceAt(run, item.SpareId, "ENG", job.EngineerUserId))) : 0;
    const fromStore = item.Qty - fromVan;
    const consume = (locType: string, locId: string, qty: number) => insertStockTxn(run, { TxnType: "Consume", SpareId: item.SpareId, Qty: qty, Rate: Number(item.Rate), FromLocType: locType, FromLocId: locId, ToLocType: null, ToLocId: job.CustomerId || null, JobCardItemLnId: item.JobCardItemLnId, Remarks: `Consumed on ${job.JobCardNo}` }, userId);
    if (fromVan > 0) await consume("ENG", job.EngineerUserId!, fromVan);
    if (fromStore > 0) await consume("SC", job.ServiceCenterId!, fromStore);
    if (item.IsWarranty && job.ServiceCenterId) {
      await insertStockTxn(run, { TxnType: "Return-Damaged", SpareId: item.SpareId, Qty: item.Qty, Rate: Number(item.Rate), ToLocType: "DAMAGED", ToLocId: job.ServiceCenterId, JobCardItemLnId: item.JobCardItemLnId, Remarks: `Faulty part from ${job.JobCardNo} held for warranty claim` }, userId);
    }
  }
}

export async function unpostJobCardStock(run: Run, jobCardId: string) {
  await run(`DELETE FROM dbo.[StockTxns] WHERE [JobCardItemLnId] IN (SELECT [JobCardItemLnId] FROM dbo.[JobCardItemLns] WHERE [JobCardId] = @id)`, { id: jobCardId });
}
