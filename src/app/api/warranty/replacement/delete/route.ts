import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, requireUser } from "@/lib/services/apiHelpers";
import { getScope } from "@/lib/auth/scope";
import { untransferWarranty } from "@/lib/services/replacements";

/** Undo a replacement: the warranty goes back to the old serial and the new sticker is freed. Blocked once the new serial has service calls. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const scope = await getScope(user);
    if (scope.portal === "CUSTOMER") return fail("You cannot undo replacements", 403);
    const { ReplacementId } = await request.json().catch(() => ({}));
    if (!ReplacementId) return fail("ReplacementId is required");
    const replNo = await inTransaction(async (run) => {
      const header = (await run<any>(`SELECT [ReplNo], [DealerId] FROM dbo.[Replacements] WITH (UPDLOCK) WHERE [ReplacementId] = @id AND [Source] = 'Dealer'`, { id: ReplacementId }))[0];
      if (!header) throw new InputError("Replacement not found");
      if (scope.portal === "DEALER" && String(header.DealerId || "").toLowerCase() !== String(scope.dealerId || "").toLowerCase()) throw new InputError("You can only undo your own replacements");
      const lines = await run<any>(`SELECT [OldSerialNo], [NewSerialNo] FROM dbo.[ReplacementItemLns] WHERE [ReplacementId] = @id`, { id: ReplacementId });
      for (const line of lines) await untransferWarranty(run, line.OldSerialNo, line.NewSerialNo, user.UserId);
      await run(`DELETE FROM dbo.[ReplacementItemLns] WHERE [ReplacementId] = @id`, { id: ReplacementId });
      await run(`DELETE FROM dbo.[Replacements] WHERE [ReplacementId] = @id`, { id: ReplacementId });
      return header.ReplNo;
    });
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "Replacements", recordId: ReplacementId, details: { ReplNo: replNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to undo the replacement");
  }
}
