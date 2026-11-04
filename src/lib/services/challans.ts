import type { AuthSessionUser } from "@/lib/auth/jwt";
import { isHeadOffice, runQuery, type Run } from "@/lib/services/apiHelpers";
import { erpRun } from "@/lib/services/erpLedgers";
import { catalogue, resolveItems, type CatalogueItem } from "@/lib/services/materialRequests";
import { ownEntriesOnly } from "@/lib/auth/scope";

/**
 * Delivery Challan helpers.
 *  - Dropdown text lists live in dbo.TextLists (one ListGroup each) and can be extended from the form.
 *  - Dispatch stores are iERP dbo.Locs; transporters are iERP ledgers of the "Transporter" group plus TextLists names.
 *  - Items are the Material Request catalogue (product items + spare parts) with their carried rate.
 */
export const TEXT_LIST_GROUPS = ["ChallanPurpose", "PartyKind", "Transporter"] as const;
export const CHALLAN_TYPES = ["Returnable", "Non-returnable"] as const;
export const TRANSPORT_MODES = ["Road", "Rail", "Air", "Ship", "Courier"] as const;

export async function textLists() {
  const rows = await runQuery<any>(`SELECT [TextListId], [ListGroup], [Value] FROM dbo.[TextLists] WHERE [IsActive] = 1 AND [ListGroup] IN ('ChallanPurpose', 'PartyKind', 'Transporter') ORDER BY [ListGroup], [SortOrder], [Value]`);
  const lists: Record<string, string[]> = Object.fromEntries(TEXT_LIST_GROUPS.map((g) => [g, [] as string[]]));
  rows.forEach((r) => lists[r.ListGroup]?.push(r.Value));
  return lists;
}

/** iERP stores (dbo.Locs). */
export const erpLocs = () => erpRun<any>(`SELECT [LocId], [Name] FROM dbo.[Locs] ORDER BY [Name]`);

/** iERP transporter ledgers that are not disabled. */
export const erpTransporters = () => erpRun<any>(`SELECT l.[LgrId], l.[Name], l.[Code] FROM dbo.[Lgrs] l JOIN dbo.[LgrGrps] g ON g.[LgrGrpId] = l.[LgrGrpId]
  WHERE g.[Name] = 'Transporter' AND (l.[DisableStatus] IS NULL OR CAST(l.[DisableStatus] AS varchar(10)) IN ('0', '', 'No', 'False')) ORDER BY l.[Name]`);

/** Product items and spare parts together (an item key is unique across both). */
export async function challanCatalogue(user: AuthSessionUser): Promise<CatalogueItem[]> {
  const [products, spares] = await Promise.all([catalogue(user, "Product"), catalogue(user, "Spare")]);
  return [...products, ...spares];
}

export async function resolveChallanItems(user: AuthSessionUser, keys: string[]) {
  const [products, spares] = await Promise.all([resolveItems(user, "Product", keys), resolveItems(user, "Spare", keys)]);
  return new Map([...Array.from(products.entries()), ...Array.from(spares.entries())]);
}

/**
 * Head office sees every challan; a warehouse login the challans it entered and those sent to its own warehouse
 * (so it can receive them); anyone tied to a service centre sees the challans sent to that centre.
 */
export function challanScope(user: AuthSessionUser, alias: string, values: Record<string, unknown>) {
  if (isHeadOffice(user)) return "";
  if (ownEntriesOnly(user.Role) && user.Role !== "SERVICE_CENTER") {
    values.scopeUser = user.UserId;
    return `(${alias}.[InsertedByUserId] = @scopeUser OR ${alias}.[WarehouseId] IN (SELECT sw.[WarehouseId] FROM dbo.[Warehouses] sw WHERE sw.[LoginUserId] = @scopeUser))`;
  }
  if (!user.ServiceCenterId) return "";
  values.scopeCenter = user.ServiceCenterId;
  return `${alias}.[ServiceCenterId] = @scopeCenter`;
}

/**
 * Job worker columns for a challan query (aliases d, sc = ServiceCenters, wh = Warehouses): the warehouse the
 * material went to, or — for challans raised before warehouses — the service centre.
 */
export const JOB_WORKER_COLS = `COALESCE(wh.[WarehouseName], sc.[ServiceCenterName]) AS [JobWorkerName], COALESCE(wh.[WarehouseCode], sc.[ServiceCenterCode]) AS [JobWorkerCode],
  wh.[WarehouseName], wh.[WarehouseCode], wh.[ContactNumber] AS [WarehouseContact]`;
export const JOB_WORKER_JOINS = `LEFT JOIN dbo.[ServiceCenters] sc ON d.[ServiceCenterId] = sc.[ServiceCenterId] LEFT JOIN dbo.[Warehouses] wh ON d.[WarehouseId] = wh.[WarehouseId]`;

export async function loadChallan(run: Run, id: string, lock = false) {
  return (await run<any>(`SELECT d.*, sc.[ServiceCenterName], sc.[ServiceCenterCode], ${JOB_WORKER_COLS}, mr.[RequestNo] FROM dbo.[DeliveryChallans] d${lock ? " WITH (UPDLOCK)" : ""}
    ${JOB_WORKER_JOINS} LEFT JOIN dbo.[MaterialRequests] mr ON d.[MaterialRequestId] = mr.[MaterialRequestId]
    WHERE d.[DeliveryChallanId] = @id`, { id }))[0] || null;
}

/** Whether goods have already been received (GRN) or returned (defective / fresh receipt) against the challan — it can then no longer be edited or deleted. */
export async function challanHasReceipts(run: Run, id: string) {
  return (await run(`SELECT TOP 1 1 AS [x] FROM dbo.[ChallanReceipts] WHERE [DeliveryChallanId] = @id
    UNION ALL SELECT TOP 1 1 FROM dbo.[ChallanReturns] WHERE [DeliveryChallanId] = @id`, { id })).length > 0;
}

/** Active warehouses for the Job worker dropdown. */
export const activeWarehouses = () => runQuery<any>(`SELECT [WarehouseId], [WarehouseCode], [WarehouseName], [Location], [IsActive] FROM dbo.[Warehouses] ORDER BY [WarehouseName]`);
