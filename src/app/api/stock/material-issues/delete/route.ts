import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, isHeadOffice, requireUser } from "@/lib/services/apiHelpers";
import { issueScope } from "@/lib/services/warehouseStock";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/** Deletes a material issue (its quantities go back into the warehouse stock). Head office or the user who entered it. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { MaterialIssueId } = await request.json().catch(() => ({}));
    if (!MaterialIssueId) return fail("MaterialIssueId is required");
    const values: Record<string, unknown> = {};
    const scope = issueScope(user, "i", values);
    const removed = await inTransaction(async (run) => {
      const r = (await run<any>(`SELECT i.[IssueNo], i.[InsertedByUserId] FROM dbo.[MaterialIssues] i WITH (UPDLOCK) WHERE i.[MaterialIssueId] = @id${scope ? ` AND ${scope}` : ""}`, { ...values, id: MaterialIssueId }))[0];
      if (!r) throw new InputError(OUT_OF_SCOPE);
      if (!isHeadOffice(user) && String(r.InsertedByUserId || "").toLowerCase() !== user.UserId.toLowerCase()) throw new InputError("Only head office or the user who entered it can delete this issue");
      await run(`DELETE FROM dbo.[MaterialIssueItemLns] WHERE [MaterialIssueId] = @id`, { id: MaterialIssueId });
      await run(`DELETE FROM dbo.[MaterialIssues] WHERE [MaterialIssueId] = @id`, { id: MaterialIssueId });
      return r;
    });
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "MaterialIssues", recordId: MaterialIssueId, details: { IssueNo: removed.IssueNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete the material issue");
  }
}
