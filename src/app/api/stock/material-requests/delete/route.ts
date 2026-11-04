import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, requireUser } from "@/lib/services/apiHelpers";
import { loadRequest, requestScope } from "@/lib/services/materialRequests";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/** Deletes a Pending material request with its lines. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { MaterialRequestId } = await request.json().catch(() => ({}));
    if (!MaterialRequestId) return fail("MaterialRequestId is required");
    const values: Record<string, unknown> = {};
    const scope = requestScope(user, "r", values);
    const removed = await inTransaction(async (run) => {
      const current = await loadRequest(run, MaterialRequestId, true);
      if (!current) throw new InputError("Material request not found");
      if (scope && !(await run(`SELECT TOP 1 1 AS [ok] FROM dbo.[MaterialRequests] r WHERE r.[MaterialRequestId] = @id AND ${scope}`, { ...values, id: MaterialRequestId })).length) throw new InputError(OUT_OF_SCOPE);
      if (current.Status !== "Pending") throw new InputError(`A request that is ${String(current.Status).toLowerCase()} cannot be deleted`);
      await run(`DELETE FROM dbo.[MaterialRequestItemLns] WHERE [MaterialRequestId] = @id`, { id: MaterialRequestId });
      await run(`DELETE FROM dbo.[MaterialRequests] WHERE [MaterialRequestId] = @id`, { id: MaterialRequestId });
      return current;
    });
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "MaterialRequests", recordId: MaterialRequestId, details: { RequestNo: removed.RequestNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete material request");
  }
}
