import { query } from "@/lib/sqlserver";
import type { AuthSessionUser } from "@/lib/auth/jwt";
import { parseList } from "@/lib/auth/forms";

/**
 * Which records a user may see.
 *  - unrestricted (IsAdmin / SUPER): everything
 *  - StateRights: comma-separated StateIds; blank = all states
 *  - DistrictRights: comma-separated district names; blank = all districts of the allowed states
 *  - MANAGER with a service centre: calls of that centre (and calls not yet given a centre)
 *  - ENGINEER: only calls assigned to them
 *  - DEALER: only their own installations, warranties, customers, calls and replacements
 *    (login is linked to the dealer whose DealerCode or Mobile equals the user name)
 *  - CUSTOMER: only their own pumps, warranties and calls (login linked by mobile number = user name)
 *  A dealer / customer login that matches no record sees nothing.
 * Rights are read from the database (cached briefly) so changes apply without signing in again.
 */
export interface DataScope {
  userId: string;
  role: string;
  unrestricted: boolean;
  states: string[];
  districts: string[];
  serviceCenterId: string | null;
  /** Dealer / customer portal logins: the record the login belongs to. */
  portal: "DEALER" | "CUSTOMER" | null;
  dealerId: string | null;
  customerId: string | null;
  customerMobile: string | null;
}

const CACHE_MS = 30_000;
const cache = (globalThis as any).__scopeCache as Map<string, { scope: DataScope; at: number }> || new Map();
(globalThis as any).__scopeCache = cache;

export function clearScopeCache(userId?: string) {
  if (userId) cache.delete(userId.toLowerCase()); else cache.clear();
}

export async function getScope(user: AuthSessionUser): Promise<DataScope> {
  const key = user.UserId.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.scope;
  const row = (await query<any>(`SELECT [Role], [IsAdmin], [Username], [Phone], [StateRights], [DistrictRights], [ServiceCenterId] FROM dbo.[Users] WHERE [UserId] = @p0`, [user.UserId]))[0] || {};
  const role = row.Role || user.Role;
  const unrestricted = Boolean(row.IsAdmin ?? user.IsAdmin) || role === "SUPER";
  const portal = !unrestricted && (role === "DEALER" || role === "CUSTOMER") ? role : null;
  const link = await linkedRecord(portal, row.Username || user.Username, row.Phone);
  const scope: DataScope = {
    userId: user.UserId,
    role,
    unrestricted,
    states: parseList(row.StateRights).map((s) => s.toLowerCase()),
    districts: parseList(row.DistrictRights),
    serviceCenterId: row.ServiceCenterId || user.ServiceCenterId || null,
    portal,
    ...link,
  };
  cache.set(key, { scope, at: Date.now() });
  return scope;
}

/** Finds the dealer / customer record a portal login belongs to (by user name, then phone). */
async function linkedRecord(portal: DataScope["portal"], username: string, phone?: string | null) {
  const none = { dealerId: null, customerId: null, customerMobile: null };
  if (portal === "DEALER") {
    const d = (await query<any>(`SELECT TOP 1 [DealerId] FROM dbo.[Dealers] WHERE [DealerCode] = @p0 OR [Mobile] = @p0 OR (@p1 IS NOT NULL AND [Mobile] = @p1) ORDER BY CASE WHEN [DealerCode] = @p0 THEN 0 ELSE 1 END`, [username, phone || null]))[0];
    return { ...none, dealerId: d?.DealerId || null };
  }
  if (portal === "CUSTOMER") {
    const c = (await query<any>(`SELECT TOP 1 [CustomerId], [Mobile] FROM dbo.[Customers] WHERE [Mobile] = @p0 OR (@p1 IS NOT NULL AND [Mobile] = @p1) ORDER BY CASE WHEN [Mobile] = @p0 THEN 0 ELSE 1 END`, [username, phone || null]))[0];
    return { ...none, customerId: c?.CustomerId || null, customerMobile: c?.Mobile || null };
  }
  return none;
}

/** Adds a parameter and returns its placeholder; lets one helper serve both @p0-style and named-style queries. */
export type AddParam = (value: unknown) => string;
export const positionalParams = (params: unknown[]): AddParam => (value) => { params.push(value); return `@p${params.length - 1}`; };
export const namedParams = (values: Record<string, unknown>, prefix = "scope"): AddParam => {
  let i = Object.keys(values).filter((k) => k.startsWith(prefix)).length;
  return (value) => { const k = `${prefix}${i++}`; values[k] = value; return `@${k}`; };
};

const list = (items: string[], add: AddParam) => items.map((v) => add(v)).join(",");

const NOTHING = "1 = 0";

/**
 * Row condition for a table with StateId / District columns. Empty string = no restriction.
 * Pass `dealer` / `customer` columns where the table has them so portal logins are limited to their own rows.
 */
export function geoFilter(scope: DataScope, cols: { state: string; district?: string; dealer?: string; customer?: string }, add: AddParam): string {
  if (scope.unrestricted) return "";
  if (scope.portal === "DEALER") {
    if (!scope.dealerId) return NOTHING;
    if (cols.dealer) return `${cols.dealer} = ${add(scope.dealerId)}`;
    if (cols.customer) return `${cols.customer} IN (SELECT pi.[CustomerId] FROM dbo.[Installations] pi WHERE pi.[DealerId] = ${add(scope.dealerId)})`;
    return NOTHING;
  }
  if (scope.portal === "CUSTOMER") {
    if (!scope.customerId) return NOTHING;
    if (cols.customer) return `${cols.customer} = ${add(scope.customerId)}`;
    if (cols.dealer) return `${cols.dealer} IN (SELECT pi.[DealerId] FROM dbo.[Installations] pi WHERE pi.[CustomerId] = ${add(scope.customerId)})`;
    return NOTHING;
  }
  const parts: string[] = [];
  if (scope.states.length) parts.push(`${cols.state} IN (${list(scope.states, add)})`);
  if (scope.districts.length && cols.district) parts.push(`${cols.district} IN (${list(scope.districts, add)})`);
  return parts.length ? `(${parts.join(" AND ")})` : "";
}

/** Condition for service calls (Complaints alias): geography + manager's centre + engineer's own calls. */
export function callFilter(scope: DataScope, alias: string, add: AddParam): string {
  if (scope.unrestricted) return "";
  if (scope.portal === "DEALER") return scope.dealerId ? `${alias}.[DealerId] = ${add(scope.dealerId)}` : NOTHING;
  if (scope.portal === "CUSTOMER") {
    if (!scope.customerId) return NOTHING;
    return `(${alias}.[CustomerId] = ${add(scope.customerId)} OR (${alias}.[CustomerId] IS NULL AND ${alias}.[Mobile] = ${add(scope.customerMobile)}))`;
  }
  const parts: string[] = [];
  const geo = geoFilter(scope, { state: `${alias}.[StateId]`, district: `${alias}.[District]` }, add);
  if (geo) parts.push(geo);
  if (scope.role === "ENGINEER") parts.push(`${alias}.[EngineerUserId] = ${add(scope.userId)}`);
  else if (scope.role === "MANAGER" && scope.serviceCenterId) parts.push(`(${alias}.[ServiceCenterId] = ${add(scope.serviceCenterId)} OR ${alias}.[ServiceCenterId] IS NULL)`);
  return parts.length ? `(${parts.join(" AND ")})` : "";
}

/** Condition for warranties (alias): visible when their installation is in the user's states / districts. */
export function warrantyFilter(scope: DataScope, alias: string, add: AddParam): string {
  if (scope.portal === "DEALER") return scope.dealerId ? `${alias}.[DealerId] = ${add(scope.dealerId)}` : NOTHING;
  if (scope.portal === "CUSTOMER") return scope.customerId ? `${alias}.[CustomerId] = ${add(scope.customerId)}` : NOTHING;
  const geo = geoFilter(scope, { state: "si.[StateId]", district: "si.[District]" }, add);
  return geo ? `${alias}.[InstallationId] IN (SELECT si.[InstallationId] FROM dbo.[Installations] si WHERE ${geo})` : "";
}

/**
 * Condition for replacements (alias r): staff follow the linked call's scope, or the dealer's state when there is no call;
 * a dealer sees their own replacements, a customer those raised on their calls.
 */
export function replacementFilter(scope: DataScope, alias: string, add: AddParam): string {
  if (scope.unrestricted) return "";
  if (scope.portal === "DEALER") return scope.dealerId ? `${alias}.[DealerId] = ${add(scope.dealerId)}` : NOTHING;
  if (scope.portal === "CUSTOMER") {
    const calls = callFilter(scope, "rc", add);
    return `${alias}.[ComplaintId] IN (SELECT rc.[ComplaintId] FROM dbo.[Complaints] rc WHERE ${calls})`;
  }
  const calls = callFilter(scope, "rc", add), dealers = geoFilter(scope, { state: "rd.[StateId]", district: "rd.[District]" }, add);
  if (!calls && !dealers) return "";
  return `((${alias}.[ComplaintId] IS NOT NULL AND ${alias}.[ComplaintId] IN (SELECT rc.[ComplaintId] FROM dbo.[Complaints] rc WHERE ${calls || "1 = 1"}))` +
    ` OR (${alias}.[ComplaintId] IS NULL AND (${alias}.[DealerId] IS NULL OR ${alias}.[DealerId] IN (SELECT rd.[DealerId] FROM dbo.[Dealers] rd WHERE ${dealers || "1 = 1"}))))`;
}

/** Joins non-empty conditions: `and(" WHERE ", a, b)` → " WHERE a AND b" or "". */
export function and(prefix: string, ...conditions: string[]) {
  const parts = conditions.filter(Boolean);
  return parts.length ? `${prefix}${parts.join(" AND ")}` : "";
}

/** Whether a record at this state / district may be created or changed by the user. */
export function inGeoScope(scope: DataScope, stateId?: string | null, district?: string | null) {
  if (scope.unrestricted || scope.portal) return true; // portal writes are pinned to the login's own dealer / customer instead
  if (scope.states.length && !(stateId && scope.states.includes(String(stateId).toLowerCase()))) return false;
  if (scope.districts.length && !(district && scope.districts.some((d) => d.toLowerCase() === String(district).toLowerCase()))) return false;
  return true;
}

/** True when the service call exists and is inside the user's scope. */
export async function callVisible(scope: DataScope, complaintId: string) {
  const params: unknown[] = [complaintId];
  const filter = callFilter(scope, "c", positionalParams(params));
  const rows = await query(`SELECT TOP 1 1 AS [ok] FROM dbo.[Complaints] c WHERE c.[ComplaintId] = @p0${filter ? ` AND ${filter}` : ""}`, params);
  return rows.length > 0;
}

/** True when the customer is inside the user's scope (state / district for staff, own customers for dealers, self for customers). */
export async function customerVisible(scope: DataScope, customerId: string) {
  const params: unknown[] = [customerId];
  const filter = geoFilter(scope, { state: "c.[StateId]", district: "c.[District]", customer: "c.[CustomerId]" }, positionalParams(params));
  const rows = await query(`SELECT TOP 1 1 AS [ok] FROM dbo.[Customers] c WHERE c.[CustomerId] = @p0${filter ? ` AND ${filter}` : ""}`, params);
  return rows.length > 0;
}

export const OUT_OF_SCOPE = "This record is outside your access rights";
