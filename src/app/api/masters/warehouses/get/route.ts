import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";

/** Warehouses with their login user name. Warehouses live in the warranty database only (no iERP ledger). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const warehouses = await runQuery(`SELECT w.*, u.[Username] AS [LoginUsername]
      FROM dbo.[Warehouses] w LEFT JOIN dbo.[Users] u ON u.[UserId] = w.[LoginUserId]
      ORDER BY w.[WarehouseName]`);
    return NextResponse.json({ success: true, warehouses });
  } catch (err) {
    return handleApiError(err, "Failed to load warehouses");
  }
}
