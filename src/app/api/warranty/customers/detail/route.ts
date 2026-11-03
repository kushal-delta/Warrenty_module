import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE, callFilter, customerVisible, geoFilter, getScope, positionalParams, warrantyFilter } from "@/lib/auth/scope";

/** Customer 360: profile, installations, warranties and service calls. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { CustomerId } = await request.json().catch(() => ({}));
    if (!CustomerId) return fail("CustomerId is required");
    const customer = (await query<any>(`SELECT c.*, s.[StateName] FROM dbo.[Customers] c LEFT JOIN dbo.[States] s ON c.[StateId] = s.[StateId] WHERE c.[CustomerId] = @p0`, [CustomerId]))[0];
    if (!customer) return fail("Customer not found", 404);
    const scope = await getScope(user);
    if (!(await customerVisible(scope, CustomerId))) return fail(OUT_OF_SCOPE, 403);
    const [installations, warranties, complaints] = await Promise.all([
      (() => {
        // A dealer sees only the pumps they installed for this customer.
        const params: unknown[] = [CustomerId];
        const own = geoFilter(scope, { state: "i.[StateId]", district: "i.[District]", dealer: "i.[DealerId]", customer: "i.[CustomerId]" }, positionalParams(params));
        return query(`SELECT i.*, d.[FirmName] AS [DealerName] FROM dbo.[Installations] i LEFT JOIN dbo.[Dealers] d ON i.[DealerId] = d.[DealerId] WHERE i.[CustomerId] = @p0${own && scope.portal ? ` AND ${own}` : ""} ORDER BY i.[InstallDate] DESC`, params);
      })(),
      (() => {
        const params: unknown[] = [CustomerId];
        const own = warrantyFilter(scope, "w", positionalParams(params));
        return query(`SELECT w.*, p.[ModelName], p.[ModelCode] FROM dbo.[Warranties] w LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId] WHERE w.[CustomerId] = @p0${own && scope.portal ? ` AND ${own}` : ""} ORDER BY w.[StartDate] DESC`, params);
      })(),
      (() => {
        const params: unknown[] = [CustomerId, customer.Mobile];
        const calls = callFilter(scope, "cp", positionalParams(params));
        return query(`SELECT cp.*, ct.[CallTypeName] FROM dbo.[Complaints] cp LEFT JOIN dbo.[CallTypes] ct ON cp.[CallTypeId] = ct.[CallTypeId] WHERE (cp.[CustomerId] = @p0 OR (cp.[CustomerId] IS NULL AND cp.[Mobile] = @p1))${calls ? ` AND ${calls}` : ""} ORDER BY cp.[CallDate] DESC`, params);
      })(),
    ]);
    return NextResponse.json({ success: true, customer, installations, warranties, complaints });
  } catch (err) {
    return handleApiError(err, "Failed to load customer details");
  }
}
