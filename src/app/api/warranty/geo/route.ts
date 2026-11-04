import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { callFilter, geoFilter, getScope, namedParams } from "@/lib/auth/scope";

const ACTIVE = "w.[Status] = 'Active' AND w.[EndDate] >= SYSUTCDATETIME()";

/**
 * Geo-Graphical Report: registered pump sets by state (with component warranties, active warranties, customers,
 * dealers and service calls) and, when `stateId` is given, the district-wise split of that state.
 * Limited to the user's rights (state / district, dealer's own sales, customer's own pumps).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { stateId } = await request.json().catch(() => ({}));
    const scope = await getScope(user);
    const values: Record<string, unknown> = {};
    const add = namedParams(values);
    const instScope = geoFilter(scope, { state: "i.[StateId]", district: "i.[District]", dealer: "i.[DealerId]", customer: "i.[CustomerId]" }, add);
    const callScope = callFilter(scope, "c", add);
    const iw = instScope ? ` AND ${instScope}` : "", cw = callScope ? ` AND ${callScope}` : "";

    const states = await runQuery(
      `SELECT * FROM (
         SELECT s.[StateId], s.[StateCode], s.[StateName], s.[ShortName],
           (SELECT COUNT(*) FROM dbo.[Installations] i WHERE i.[StateId] = s.[StateId]${iw}) AS [Sets],
           (SELECT COUNT(*) FROM dbo.[Warranties] w JOIN dbo.[Installations] i ON w.[InstallationId] = i.[InstallationId] WHERE i.[StateId] = s.[StateId] AND w.[Status] <> 'Replaced'${iw}) AS [Warranties],
           (SELECT COUNT(*) FROM dbo.[Warranties] w JOIN dbo.[Installations] i ON w.[InstallationId] = i.[InstallationId] WHERE i.[StateId] = s.[StateId] AND ${ACTIVE}${iw}) AS [ActiveWarranties],
           (SELECT COUNT(DISTINCT i.[CustomerId]) FROM dbo.[Installations] i WHERE i.[StateId] = s.[StateId]${iw}) AS [Customers],
           (SELECT COUNT(DISTINCT i.[DealerId]) FROM dbo.[Installations] i WHERE i.[StateId] = s.[StateId]${iw}) AS [Dealers],
           (SELECT COUNT(*) FROM dbo.[Complaints] c WHERE c.[StateId] = s.[StateId]${cw}) AS [Calls]
         FROM dbo.[States] s) x
       WHERE x.[Sets] > 0 OR x.[Calls] > 0 ORDER BY x.[Sets] DESC, x.[StateName]`, values);

    let districts: any[] = [];
    if (stateId) {
      const dv: Record<string, unknown> = { state: stateId };
      const dadd = namedParams(dv, "dscope");
      const dInst = geoFilter(scope, { state: "i.[StateId]", district: "i.[District]", dealer: "i.[DealerId]", customer: "i.[CustomerId]" }, dadd);
      districts = await runQuery(
        `SELECT COALESCE(NULLIF(LTRIM(RTRIM(i.[District])), ''), '—') AS [District], COUNT(*) AS [Sets], COUNT(DISTINCT i.[CustomerId]) AS [Customers]
         FROM dbo.[Installations] i WHERE i.[StateId] = @state${dInst ? ` AND ${dInst}` : ""}
         GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(i.[District])), ''), '—') ORDER BY [Sets] DESC, [District]`, dv);
    }
    return NextResponse.json({ success: true, states, districts });
  } catch (err) {
    return handleApiError(err, "Failed to build the geo report");
  }
}
