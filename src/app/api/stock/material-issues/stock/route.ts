import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { issueWarehouses, warehouseBalances } from "@/lib/services/warehouseStock";

/**
 * Material Issue form lookups:
 *  - no body: the warehouses the user may issue from
 *  - `WarehouseId`: the items in stock at that warehouse (available quantity and rate)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { WarehouseId } = await request.json().catch(() => ({}));
    const warehouses = await issueWarehouses(user);
    if (!WarehouseId) return NextResponse.json({ success: true, warehouses });
    if (!warehouses.some((w: any) => String(w.WarehouseId).toLowerCase() === String(WarehouseId).toLowerCase())) return fail("You cannot issue from this warehouse", 403);
    return NextResponse.json({ success: true, items: await warehouseBalances(runQuery, WarehouseId) });
  } catch (err) {
    return handleApiError(err, "Could not load the warehouse stock");
  }
}
