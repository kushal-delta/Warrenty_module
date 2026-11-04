import type { AuthSessionUser } from "@/lib/auth/jwt";
import { isHeadOffice, runQuery, type Run } from "@/lib/services/apiHelpers";
import { erpRun } from "@/lib/services/erpLedgers";
import { stockBalances, visibleStockLocations } from "@/lib/services/stock";

/**
 * Material Request item catalogue.
 *  - Product items: iERP dbo.Itms in the "FINISH GOODS" sub-group (pump sets etc.)
 *  - Spare parts:   the local Spares master (with stock in hand) + iERP component items (sub-groups below)
 * iERP runs at compatibility level 100 — keep its SQL to plain LIKE / IN.
 */
export const REQUEST_TYPES = ["Product", "Spare"] as const;
export const PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
const ERP_PRODUCT_SUBGROUPS = ["FINISH GOODS"];
const ERP_SPARE_SUBGROUPS = ["SEMI FINISH", "RAW MATERIAL"];
const ERP_LIMIT = 2000;

export interface CatalogueItem {
  /** "ERP|<ItmId>" or "LOCAL|<SpareId>" */
  key: string;
  source: "ERP" | "LOCAL";
  id: string;
  code: string | null;
  name: string;
  uom: string | null;
  group: string;
  /** Stock in hand across the user's visible locations (local spares only). */
  stock: number | null;
  /** Carried cost per unit: Spares master current rate, or the iERP standard / purchase rate. */
  rate: number | null;
}

const ACTIVE_ERP = "(i.[InEffectiveOn] IS NULL OR i.[InEffectiveOn] > GETDATE())";

async function erpItems(subGroups: string[], search?: string, ids?: string[]): Promise<CatalogueItem[]> {
  const values: Record<string, unknown> = {};
  const groups = subGroups.map((g, n) => { values[`g${n}`] = g; return `@g${n}`; }).join(",");
  const where = [`s.[Name] IN (${groups})`, ACTIVE_ERP];
  if (search) { where.push("(i.[Name] LIKE @q OR i.[Alias] LIKE @q)"); values.q = `%${search}%`; }
  if (ids) {
    if (!ids.length) return [];
    where.push(`i.[ItmId] IN (${ids.map((id, n) => { values[`i${n}`] = id; return `@i${n}`; }).join(",")})`);
  }
  const rows = await erpRun<any>(`SELECT TOP ${ERP_LIMIT} i.[ItmId], i.[Name], i.[Alias], i.[StdRate], i.[PurPrice], s.[Name] AS [SubGrp]
    FROM dbo.[Itms] i JOIN dbo.[SubGrps] s ON s.[SubGrpId] = i.[SubGrpId]
    WHERE ${where.join(" AND ")} ORDER BY i.[Name]`, values);
  return rows.map((r) => ({ key: `ERP|${r.ItmId}`, source: "ERP", id: String(r.ItmId), code: r.Alias || null, name: r.Name, uom: null, group: `iERP · ${r.SubGrp}`, stock: null, rate: Number(r.StdRate) > 0 ? Number(r.StdRate) : Number(r.PurPrice) > 0 ? Number(r.PurPrice) : null }));
}

async function localSpares(user: AuthSessionUser, search?: string, ids?: string[]): Promise<CatalogueItem[]> {
  const values: Record<string, unknown> = {};
  const where = ["[IsActive] = 1"];
  if (search) { where.push("([SpareName] LIKE @q OR [SpareCode] LIKE @q)"); values.q = `%${search}%`; }
  if (ids) {
    if (!ids.length) return [];
    where.push(`[SpareId] IN (${ids.map((id, n) => { values[`i${n}`] = id; return `@i${n}`; }).join(",")})`);
  }
  const [spares, locIds] = await Promise.all([
    runQuery<any>(`SELECT [SpareId], [SpareCode], [SpareName], [Uom], [CurrentRate] FROM dbo.[Spares] WHERE ${where.join(" AND ")} ORDER BY [SpareName]`, values),
    visibleStockLocations(user),
  ]);
  const balances = await stockBalances(runQuery, { locIds });
  const totals = new Map<string, number>();
  balances.filter((b) => b.LocType !== "DAMAGED").forEach((b) => { const k = String(b.SpareId).toLowerCase(); totals.set(k, (totals.get(k) || 0) + Number(b.Balance || 0)); });
  return spares.map((s) => ({ key: `LOCAL|${s.SpareId}`, source: "LOCAL", id: String(s.SpareId), code: s.SpareCode, name: s.SpareName, uom: s.Uom, group: "Spares master", stock: totals.get(String(s.SpareId).toLowerCase()) || 0, rate: s.CurrentRate === null || s.CurrentRate === undefined ? null : Number(s.CurrentRate) }));
}

/** Items that can be requested for this request type. */
export async function catalogue(user: AuthSessionUser, type: string, search?: string): Promise<CatalogueItem[]> {
  if (type === "Product") return erpItems(ERP_PRODUCT_SUBGROUPS, search);
  if (type === "Spare") {
    const [local, erp] = await Promise.all([localSpares(user, search), erpItems(ERP_SPARE_SUBGROUPS, search)]);
    return [...local, ...erp];
  }
  return [];
}

/** Resolves the keys sent by the form against the catalogue of that type (unknown / wrong-type keys are dropped). */
export async function resolveItems(user: AuthSessionUser, type: string, keys: string[]) {
  const ids = (source: string) => keys.filter((k) => k.startsWith(`${source}|`)).map((k) => k.slice(source.length + 1));
  const found = type === "Product"
    ? await erpItems(ERP_PRODUCT_SUBGROUPS, undefined, ids("ERP"))
    : [...(await localSpares(user, undefined, ids("LOCAL"))), ...(await erpItems(ERP_SPARE_SUBGROUPS, undefined, ids("ERP")))];
  return new Map(found.map((i) => [i.key.toLowerCase(), i]));
}

/**
 * Which requests a user sees: head office all; a service centre login only the ones it entered;
 * managers / engineers those of their own centre.
 */
export function requestScope(user: AuthSessionUser, alias: string, values: Record<string, unknown>) {
  if (isHeadOffice(user)) return "";
  if (user.Role === "SERVICE_CENTER") { values.scopeUser = user.UserId; return `${alias}.[InsertedByUserId] = @scopeUser`; }
  if (user.ServiceCenterId) { values.scopeCenter = user.ServiceCenterId; return `${alias}.[ServiceCenterId] = @scopeCenter`; }
  return "";
}

/** The centre a non-head-office user may raise requests for (null = any). */
export const fixedCenter = (user: AuthSessionUser) => (isHeadOffice(user) ? null : user.ServiceCenterId || null);

export async function loadRequest(run: Run, id: string, lock = false) {
  return (await run<any>(`SELECT r.*, sc.[ServiceCenterName], sc.[ServiceCenterCode] FROM dbo.[MaterialRequests] r${lock ? " WITH (UPDLOCK)" : ""}
    LEFT JOIN dbo.[ServiceCenters] sc ON r.[ServiceCenterId] = sc.[ServiceCenterId] WHERE r.[MaterialRequestId] = @id`, { id }))[0] || null;
}
