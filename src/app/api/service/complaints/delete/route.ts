import { NextRequest, NextResponse } from "next/server";
import { fail, handleApiError, inTransaction } from "@/lib/services/apiHelpers";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { callVisible, getScope, OUT_OF_SCOPE } from "@/lib/auth/scope";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { removeAttachmentFiles } from "@/lib/services/attachments";

export async function POST(request: NextRequest) {
  try {
    const user = await sessionFromRequest(request);
    if (!user) return fail("Unauthorized", 401);
    const scope = await getScope(user);
    if (scope.portal) return fail("Only service staff can delete a call", 403);
    const { ComplaintId } = await request.json();
    if (!ComplaintId) return fail("Service call is required");
    if (!(await callVisible(scope, ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    let attachmentIds: string[] = [];
    const result = await inTransaction(async run => {
      const linked = (await run<any>(`SELECT (SELECT COUNT(*) FROM dbo.[VisitReports] WHERE [ComplaintId]=@id)+(SELECT COUNT(*) FROM dbo.[JobCards] WHERE [ComplaintId]=@id)+(SELECT COUNT(*) FROM dbo.[Replacements] WHERE [ComplaintId]=@id) AS [Count]`, { id: ComplaintId }))[0];
      if (linked.Count) return { linked: true };
      await run(`DELETE FROM dbo.[ComplaintItemLns] WHERE [ComplaintId]=@id`, { id: ComplaintId });
      await run(`DELETE FROM dbo.[ComplaintReminders] WHERE [ComplaintId]=@id`, { id: ComplaintId });
      attachmentIds = (await run<any>(`DELETE FROM dbo.[Attachments] OUTPUT DELETED.[AttachmentId] AS [id] WHERE [ParentTable]='Complaints' AND [ParentId]=@id`, { id: ComplaintId })).map((a) => String(a.id));
      const deleted = await run<any>(`DELETE FROM dbo.[Complaints] OUTPUT DELETED.[ComplaintNo] WHERE [ComplaintId]=@id`, { id: ComplaintId });
      return { deleted: deleted[0] };
    });
    if (result.linked) return fail("This call has visits, job cards, or replacements. Remove those records first.", 409);
    if (!result.deleted) return fail("Service call not found", 404);
    await removeAttachmentFiles(attachmentIds); // photo / video files go once the delete committed
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "Complaints", recordId: ComplaintId, details: result.deleted });
    return NextResponse.json({ success: true });
  } catch (error) { return handleApiError(error, "Failed to delete service call"); }
}
