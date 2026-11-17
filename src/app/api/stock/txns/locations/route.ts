import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { visibleStockLocations } from "@/lib/services/stock";

/** Warehouses for the stock-entry location pickers (head office all active ones; a Warehouse Manager their own). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const visible = await visibleStockLocations(user);
    const values: Record<string, unknown> = {};
    const scope = visible ? (visible.length ? `AND [WarehouseId] IN (${visible.map((id, i) => { values[`v${i}`] = id; return `@v${i}`; }).join(",")})` : "AND 1 = 0") : "";
    const warehouses = await runQuery(`SELECT [WarehouseId], [WarehouseCode], [WarehouseName] FROM dbo.[Warehouses] WHERE [IsActive] = 1 ${scope} ORDER BY [WarehouseName]`, values);
    return NextResponse.json({ success: true, warehouses });
  } catch (err) {
    return handleApiError(err, "Could not load warehouses");
  }
}
