import type { AuthSessionUser } from "@/lib/auth/jwt";
import { isHeadOffice, runQuery, type Run } from "@/lib/services/apiHelpers";
import { erpRun } from "@/lib/services/erpLedgers";
import { catalogue, resolveItems, type CatalogueItem } from "@/lib/services/materialRequests";

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

/** Head office sees every challan; anyone tied to a service centre sees the challans sent to that centre. */
export function challanScope(user: AuthSessionUser, alias: string, values: Record<string, unknown>) {
  if (isHeadOffice(user) || !user.ServiceCenterId) return "";
  values.scopeCenter = user.ServiceCenterId;
  return `${alias}.[ServiceCenterId] = @scopeCenter`;
}

export async function loadChallan(run: Run, id: string, lock = false) {
  return (await run<any>(`SELECT d.*, sc.[ServiceCenterName], sc.[ServiceCenterCode], mr.[RequestNo] FROM dbo.[DeliveryChallans] d${lock ? " WITH (UPDLOCK)" : ""}
    LEFT JOIN dbo.[ServiceCenters] sc ON d.[ServiceCenterId] = sc.[ServiceCenterId] LEFT JOIN dbo.[MaterialRequests] mr ON d.[MaterialRequestId] = mr.[MaterialRequestId]
    WHERE d.[DeliveryChallanId] = @id`, { id }))[0] || null;
}
