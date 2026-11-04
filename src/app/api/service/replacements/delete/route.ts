import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, isHeadOffice, requireUser } from "@/lib/services/apiHelpers";
import { untransferWarranty } from "@/lib/services/replacements";
import { removeAttachmentFiles } from "@/lib/services/attachments";

/** Deletes a replacement and reverses every warranty transfer it made. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (!isHeadOffice(user) && user.Role !== "MANAGER") return fail("You cannot delete replacements", 403);
    const { ReplacementId } = await request.json().catch(() => ({}));
    if (!ReplacementId) return fail("ReplacementId is required");
    let documentIds: string[] = [];
    const replNo = await inTransaction(async (run) => {
      const header = (await run<any>(`SELECT [ReplNo] FROM dbo.[Replacements] WITH (UPDLOCK) WHERE [ReplacementId] = @id`, { id: ReplacementId }))[0];
      if (!header) throw new InputError("Replacement not found");
      const lines = await run<any>(`SELECT [OldSerialNo], [NewSerialNo] FROM dbo.[ReplacementItemLns] WHERE [ReplacementId] = @id`, { id: ReplacementId });
      for (const line of lines) await untransferWarranty(run, line.OldSerialNo, line.NewSerialNo, user.UserId);
      documentIds = (await run<any>(`DELETE FROM dbo.[Attachments] OUTPUT DELETED.[AttachmentId] AS [id] WHERE [ParentTable] = 'Replacements' AND [ParentId] = @id`, { id: ReplacementId })).map((d) => String(d.id));
      await run(`DELETE FROM dbo.[ReplacementItemLns] WHERE [ReplacementId] = @id`, { id: ReplacementId });
      await run(`DELETE FROM dbo.[Replacements] WHERE [ReplacementId] = @id`, { id: ReplacementId });
      return header.ReplNo;
    });
    await removeAttachmentFiles(documentIds);
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "Replacements", recordId: ReplacementId, details: { ReplNo: replNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete replacement");
  }
}
