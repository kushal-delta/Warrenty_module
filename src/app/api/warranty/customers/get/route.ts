import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";
import { geoFilter, getScope, positionalParams } from "@/lib/auth/scope";

/** Lists customers with their installation, active-warranty and service-call counts. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { search, stateId, limit = 500 } = await request.json().catch(() => ({}));
    const where: string[] = [], params: unknown[] = [];
    const scopeFilter = geoFilter(await getScope(user), { state: "c.[StateId]", district: "c.[District]", customer: "c.[CustomerId]" }, positionalParams(params));
    if (scopeFilter) where.push(scopeFilter);
    if (stateId) { where.push(`c.[StateId] = @p${params.length}`); params.push(stateId); }
    if (search) { where.push(`(c.[CustomerName] LIKE @p${params.length} OR c.[Mobile] LIKE @p${params.length} OR c.[Village] LIKE @p${params.length} OR c.[District] LIKE @p${params.length} OR c.[Pincode] LIKE @p${params.length})`); params.push(`%${search}%`); }
    params.push(Number(limit) || 500);
    const customers = await query(
      `SELECT TOP (@p${params.length - 1}) c.*, s.[StateName],
        (SELECT COUNT(*) FROM dbo.[Installations] i WHERE i.[CustomerId] = c.[CustomerId]) AS [InstallationCount],
        (SELECT COUNT(*) FROM dbo.[Warranties] w WHERE w.[CustomerId] = c.[CustomerId] AND w.[Status] = 'Active' AND w.[EndDate] >= SYSUTCDATETIME()) AS [ActiveWarrantyCount],
        (SELECT COUNT(*) FROM dbo.[Complaints] cp WHERE cp.[CustomerId] = c.[CustomerId] OR (cp.[CustomerId] IS NULL AND cp.[Mobile] = c.[Mobile])) AS [ComplaintCount]
       FROM dbo.[Customers] c LEFT JOIN dbo.[States] s ON c.[StateId] = s.[StateId]${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
       ORDER BY c.[CustomerName] ASC`,
      params
    );
    return NextResponse.json({ success: true, customers });
  } catch (err) {
    return handleApiError(err, "Failed to fetch customers");
  }
}
