import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, isHeadOffice, requireUser } from "@/lib/services/apiHelpers";
import { loadJobCard, revertCallStatus } from "@/lib/services/jobCards";
import { unpostJobCardStock } from "@/lib/services/stock";
import { removeAttachmentFiles } from "@/lib/services/attachments";

/** Deletes a job card with its lines and trail. Drafts / rejected cards by anyone; other states by head office only (stock postings are reversed). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { JobCardId } = await request.json().catch(() => ({}));
    if (!JobCardId) return fail("JobCardId is required");
    let photoIds: string[] = [];
    const job = await inTransaction(async (run) => {
      const row = await loadJobCard(run, JobCardId, true);
      if (!row) throw new InputError("Job card not found");
      if (!["Draft", "Rejected"].includes(row.Status) && !isHeadOffice(user)) throw new InputError(`Only head office can delete a job card that is ${row.Status.toLowerCase()}`);
      await unpostJobCardStock(run, JobCardId);
      await run(`DELETE FROM dbo.[JobCardApprovalLns] WHERE [JobCardId] = @id`, { id: JobCardId });
      await run(`DELETE FROM dbo.[JobCardFaultLns] WHERE [JobCardId] = @id`, { id: JobCardId });
      await run(`DELETE FROM dbo.[JobCardItemLns] WHERE [JobCardId] = @id`, { id: JobCardId });
      photoIds = (await run<any>(`DELETE FROM dbo.[Attachments] OUTPUT DELETED.[AttachmentId] WHERE [ParentTable] = 'JobCards' AND [ParentId] = @id`, { id: JobCardId })).map((r) => r.AttachmentId);
      await run(`DELETE FROM dbo.[JobCards] WHERE [JobCardId] = @id`, { id: JobCardId });
      await revertCallStatus(run, row, user.UserId);
      return row;
    });
    await removeAttachmentFiles(photoIds.map(String));
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "JobCards", recordId: JobCardId, details: { JobCardNo: job.JobCardNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete job card");
  }
}
