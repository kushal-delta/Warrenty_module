import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE, getScope, namedParams, warrantyFilter } from "@/lib/auth/scope";

/** Digital warranty card of one installation: customer, site, dealer and every component warranty (pump, motor, controller). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { InstallationId } = await request.json().catch(() => ({}));
    if (!InstallationId) return fail("InstallationId is required");
    const values: Record<string, unknown> = { id: InstallationId };
    const filter = warrantyFilter(await getScope(user), "w", namedParams(values));
    const warranties = await runQuery<any>(`SELECT w.[WarrantyId], w.[WarrantyNo], w.[SerialNo], w.[Category], w.[StartDate], w.[EndDate], w.[WarrantyMonths], w.[ExtendedMonths], w.[Status], p.[ModelName]
      FROM dbo.[Warranties] w LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId]
      WHERE w.[InstallationId] = @id${filter ? ` AND ${filter}` : ""} ORDER BY CASE w.[Category] WHEN 'PUMP' THEN 1 WHEN 'MOTOR' THEN 2 ELSE 3 END, w.[SerialNo]`, values);
    if (!warranties.length) return fail(OUT_OF_SCOPE, 404);
    const installation = (await runQuery<any>(`SELECT i.*, s.[StateName], c.[CustomerName], c.[Mobile] AS [CustomerMobile], d.[FirmName] AS [DealerName], d.[DealerCode]
      FROM dbo.[Installations] i LEFT JOIN dbo.[States] s ON i.[StateId] = s.[StateId] LEFT JOIN dbo.[Customers] c ON i.[CustomerId] = c.[CustomerId] LEFT JOIN dbo.[Dealers] d ON i.[DealerId] = d.[DealerId]
      WHERE i.[InstallationId] = @id`, { id: InstallationId }))[0];
    return NextResponse.json({ success: true, installation, warranties });
  } catch (err) {
    return handleApiError(err, "Failed to load the warranty card");
  }
}
