import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { customerVisible, getScope } from "@/lib/auth/scope";

/**
 * Register-warranty form: type the mobile → an existing customer's details fill in automatically.
 * Part of the Register Installation screen (its own right), so dealers can use it without the Customers screen.
 * `found: false` when no customer has the mobile, or the customer is outside the user's rights.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { mobile } = await request.json().catch(() => ({}));
    const value = String(mobile || "").trim();
    if (!/^[6-9]\d{9}$/.test(value)) return fail("Enter a valid 10-digit mobile number");
    const customer = (await runQuery<any>(`SELECT TOP 1 [CustomerId], [CustomerName], [Mobile], [Email], [Language], [Address], [Village], [District], [StateId], [Pincode] FROM dbo.[Customers] WHERE [Mobile] = @m`, { m: value }))[0];
    if (!customer || !(await customerVisible(await getScope(user), customer.CustomerId))) return NextResponse.json({ success: true, found: false });
    return NextResponse.json({ success: true, found: true, customer });
  } catch (err) {
    return handleApiError(err, "Customer lookup failed");
  }
}
