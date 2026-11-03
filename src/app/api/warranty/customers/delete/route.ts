import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { fail, handleApiError, isHeadOffice, requireUser } from "@/lib/services/apiHelpers";

/** Deletes a customer that has no installations, warranties or service calls. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (!isHeadOffice(user)) return fail("Only head office users can delete customers", 403);
    const { CustomerId } = await request.json().catch(() => ({}));
    if (!CustomerId) return fail("CustomerId is required");
    const links = (await query<any>(`SELECT (SELECT COUNT(*) FROM dbo.[Installations] WHERE [CustomerId] = @p0) AS [Installations], (SELECT COUNT(*) FROM dbo.[Warranties] WHERE [CustomerId] = @p0) AS [Warranties], (SELECT COUNT(*) FROM dbo.[Complaints] WHERE [CustomerId] = @p0) AS [Complaints]`, [CustomerId]))[0];
    const linked = Object.entries(links).filter(([, count]) => Number(count) > 0).map(([name, count]) => `${count} ${name.toLowerCase()}`);
    if (linked.length) return fail(`This customer has ${linked.join(", ")} and cannot be deleted`, 409);
    const deleted = await query<any>(`DELETE FROM dbo.[Customers] OUTPUT DELETED.[CustomerName] WHERE [CustomerId] = @p0`, [CustomerId]);
    if (!deleted.length) return fail("Customer not found", 404);
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "Customers", recordId: CustomerId, details: { CustomerName: deleted[0].CustomerName } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete customer");
  }
}
