import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { customerVisible, getScope } from "@/lib/auth/scope";

/**
 * Service-call form: type the mobile → an existing customer loads automatically.
 * Returns the customer and their pump sets (with component serials) so the form can fill the site and components.
 * `found: false` when no customer has this mobile, or the customer is outside the user's rights.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { mobile } = await request.json().catch(() => ({}));
    const value = String(mobile || "").trim();
    if (!/^[6-9]\d{9}$/.test(value)) return fail("Enter a valid 10-digit mobile number");

    const customer = (await runQuery<any>(`SELECT TOP 1 c.*, s.[StateName] FROM dbo.[Customers] c LEFT JOIN dbo.[States] s ON c.[StateId] = s.[StateId] WHERE c.[Mobile] = @m OR c.[AltMobile] = @m ORDER BY CASE WHEN c.[Mobile] = @m THEN 0 ELSE 1 END`, { m: value }))[0];
    if (!customer || !(await customerVisible(await getScope(user), customer.CustomerId))) return NextResponse.json({ success: true, found: false });

    const [installations, serials] = await Promise.all([
      runQuery(`SELECT i.[InstallationId], i.[InstallNo], i.[InstallDate], i.[SiteAddress], i.[Village], i.[District], i.[StateId], i.[Pincode], i.[DealerId], i.[ProjectId], d.[FirmName] AS [DealerName]
        FROM dbo.[Installations] i LEFT JOIN dbo.[Dealers] d ON i.[DealerId] = d.[DealerId] WHERE i.[CustomerId] = @c ORDER BY i.[InstallDate] DESC`, { c: customer.CustomerId }),
      runQuery(`SELECT w.[InstallationId], w.[SerialNo], w.[Category], w.[EndDate], w.[Status], p.[ModelName] FROM dbo.[Warranties] w LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId]
        WHERE w.[CustomerId] = @c AND w.[Status] <> 'Replaced' ORDER BY CASE w.[Category] WHEN 'PUMP' THEN 0 WHEN 'MOTOR' THEN 1 WHEN 'CONTROLLER' THEN 2 ELSE 3 END`, { c: customer.CustomerId }),
    ]);
    const withSerials = installations.map((i: any) => ({ ...i, Serials: serials.filter((s: any) => String(s.InstallationId).toLowerCase() === String(i.InstallationId).toLowerCase()) }));
    return NextResponse.json({ success: true, found: true, customer, installations: withSerials });
  } catch (err) {
    return handleApiError(err, "Customer lookup failed");
  }
}
