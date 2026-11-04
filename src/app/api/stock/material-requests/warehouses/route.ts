import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";
import { requestWarehouses } from "@/lib/services/materialRequests";

/** Warehouses for the Material Request "Warehouse" dropdown (a warehouse login gets only its own). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    return NextResponse.json({ success: true, warehouses: await requestWarehouses(user) });
  } catch (err) {
    return handleApiError(err, "Could not load warehouses");
  }
}
