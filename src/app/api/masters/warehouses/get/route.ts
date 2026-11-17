import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";

/**
 * Warehouses with their manager (Warehouses.LoginUserId → a role WAREHOUSE "Warehouse Manager" user) and state,
 * plus the Warehouse Manager users for the form's dropdown. Warehouses live in the warranty database only (no iERP ledger).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const [warehouses, managers] = await Promise.all([
      runQuery(`SELECT w.*, w.[LoginUserId] AS [ManagerUserId], u.[Username] AS [LoginUsername],
          LTRIM(RTRIM(ISNULL(u.[FirstName], '') + ' ' + ISNULL(u.[LastName], ''))) AS [ManagerName], u.[Phone] AS [ManagerPhone], s.[StateName]
        FROM dbo.[Warehouses] w
        LEFT JOIN dbo.[Users] u ON u.[UserId] = w.[LoginUserId]
        LEFT JOIN dbo.[States] s ON s.[StateId] = w.[StateId]
        ORDER BY w.[WarehouseName]`),
      runQuery(`SELECT [UserId], [Username], [FirstName], [LastName], [Phone], [IsActive]
        FROM dbo.[Users] WHERE [Role] = 'WAREHOUSE' ORDER BY [FirstName], [Username]`),
    ]);
    return NextResponse.json({ success: true, warehouses, managers });
  } catch (err) {
    return handleApiError(err, "Failed to load warehouses");
  }
}
