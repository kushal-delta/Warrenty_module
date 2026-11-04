import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, requireUser, runQuery, text } from "@/lib/services/apiHelpers";
import { loadRequest, requestScope } from "@/lib/services/materialRequests";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";
import { isUnrestricted } from "@/lib/auth/forms";

/**
 * Approves or rejects a Pending material request (Material Approvals screen).
 * Rejection needs remarks. Nobody but an unrestricted admin decides on a request they raised themselves.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json().catch(() => ({}));
    const id = body.MaterialRequestId as string | undefined;
    const decision = body.Decision === "Approved" || body.Decision === "Rejected" ? body.Decision : null;
    const remarks = text(body.Remarks, 500);
    if (!id) return fail("MaterialRequestId is required");
    if (!decision) return fail("Choose approve or reject");
    if (decision === "Rejected" && !remarks) return fail("Enter the reason for rejecting");

    const values: Record<string, unknown> = {};
    const scope = requestScope(user, "r", values);
    const decided = await inTransaction(async (run) => {
      const current = await loadRequest(run, id, true);
      if (!current) throw new InputError("Material request not found");
      if (scope && !(await run(`SELECT TOP 1 1 AS [ok] FROM dbo.[MaterialRequests] r WHERE r.[MaterialRequestId] = @id AND ${scope}`, { ...values, id })).length) throw new InputError(OUT_OF_SCOPE);
      if (current.Status !== "Pending") throw new InputError(`This request is already ${String(current.Status).toLowerCase()}`);
      if (!isUnrestricted(user) && String(current.InsertedByUserId || "").toLowerCase() === user.UserId.toLowerCase()) throw new InputError("You cannot approve or reject a request you raised yourself");
      await run(`UPDATE dbo.[MaterialRequests] SET [Status] = @status, [DecisionByUserId] = @userId, [DecisionOn] = SYSUTCDATETIME(), [DecisionRemarks] = @remarks,
        [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [MaterialRequestId] = @id`, { status: decision, userId: user.UserId, remarks, id });
      return current;
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: decision === "Approved" ? "APPROVE" : "REJECT", tableName: "MaterialRequests", recordId: id, details: { RequestNo: decided.RequestNo, Remarks: remarks } });
    return NextResponse.json({ success: true, request: await loadRequest(runQuery, id) });
  } catch (err) {
    return handleApiError(err, "Failed to record the decision");
  }
}
