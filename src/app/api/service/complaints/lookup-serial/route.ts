import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { getScope } from "@/lib/auth/scope";
import { serialWarranty } from "@/lib/services/complaints";

/**
 * Service-call form: a component serial → model and warranty (State: in | out | unreg | unk, Label, EndDate, DaysLeft).
 * Dealer / customer logins see owner details only for their own products.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { serialNo } = await request.json().catch(() => ({}));
    if (!String(serialNo || "").trim()) return fail("Serial number is required");
    const result = await serialWarranty(runQuery, serialNo);

    const scope = await getScope(user);
    const own = !scope.portal
      || (scope.portal === "DEALER" && result.DealerId && String(result.DealerId).toLowerCase() === String(scope.dealerId).toLowerCase())
      || (scope.portal === "CUSTOMER" && result.CustomerId && String(result.CustomerId).toLowerCase() === String(scope.customerId).toLowerCase());
    const serial = own ? result : { ...result, CustomerId: null, CustomerName: null, CustomerMobile: null, DealerId: null, DealerName: null, InstallationId: null };
    return NextResponse.json({ success: true, serial });
  } catch (err) {
    return handleApiError(err, "Serial lookup failed");
  }
}
