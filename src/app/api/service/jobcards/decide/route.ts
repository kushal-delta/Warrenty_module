import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, requireUser, runQuery, text } from "@/lib/services/apiHelpers";
import { activeRules, canActOnRule, finalizeJobCard, loadJobCard, revertCallStatus, rulesFor, submitJobCard } from "@/lib/services/jobCards";
import { OUT_OF_SCOPE, callVisible, getScope } from "@/lib/auth/scope";

/**
 * Approval actions on a job card:
 *  - "Submit"   send a Draft / Rejected card for approval
 *  - "Approved" approve the current level (the last level posts stock and approves the call)
 *  - "Rejected" send the card back to the engineer (remarks required)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { JobCardId, action, remarks } = await request.json().catch(() => ({}));
    if (!JobCardId) return fail("JobCardId is required");
    if (!["Submit", "Approved", "Rejected"].includes(action)) return fail("Action is invalid");
    if (action === "Rejected" && !text(remarks)) throw new InputError("Enter the reason for rejection");

    const target = (await runQuery<any>(`SELECT [ComplaintId] FROM dbo.[JobCards] WHERE [JobCardId] = @id`, { id: JobCardId }))[0];
    if (target && !(await callVisible(await getScope(user), target.ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    const outcome = await inTransaction(async (run) => {
      const job = await loadJobCard(run, JobCardId, true);
      if (!job) throw new InputError("Job card not found");

      if (action === "Submit") {
        if (!["Draft", "Rejected"].includes(job.Status)) throw new InputError(`A job card that is ${job.Status.toLowerCase()} cannot be submitted`);
        return { job, status: await submitJobCard(run, job, user.UserId), message: "" };
      }

      if (job.Status !== "In Approval") throw new InputError("This job card is not waiting for approval");
      const levels = rulesFor(await activeRules(run), Number(job.TotalEstimate));
      const rule = levels.find((r) => r.LevelNo === job.CurrentLevel);
      if (!canActOnRule(rule, user, job.ServiceCenterId)) throw new InputError("This job card is not waiting for your approval");

      await run(`INSERT INTO dbo.[JobCardApprovalLns] ([JobCardApprovalLnId],[JobCardId],[LevelNo],[ApproverUserId],[Action],[ActionDate],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (NEWID(),@id,@level,@userId,@action,SYSUTCDATETIME(),@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
        { id: JobCardId, level: job.CurrentLevel, userId: user.UserId, action, remarks: text(remarks, 250) });

      if (action === "Rejected") {
        await run(`UPDATE dbo.[JobCards] SET [Status] = 'Rejected', [CurrentLevel] = 0, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [JobCardId] = @id`, { userId: user.UserId, id: JobCardId });
        await revertCallStatus(run, job, user.UserId);
        return { job, status: "Rejected", message: "Job card rejected — returned to the engineer" };
      }

      const next = levels.find((r) => r.LevelNo > job.CurrentLevel);
      if (next) {
        await run(`UPDATE dbo.[JobCards] SET [CurrentLevel] = @level, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [JobCardId] = @id`, { level: next.LevelNo, userId: user.UserId, id: JobCardId });
        return { job, status: "In Approval", message: `Level ${job.CurrentLevel} approved — moved to level ${next.LevelNo} (${next.RoleName})` };
      }
      await finalizeJobCard(run, job, user.UserId);
      return { job, status: "Approved", message: "Job card approved — stock posted and customer informed" };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: action === "Submit" ? "SUBMIT" : action.toUpperCase(), tableName: "JobCards", recordId: JobCardId, details: { JobCardNo: outcome.job.JobCardNo, Status: outcome.status, Remarks: remarks || null } });
    const message = outcome.message || (outcome.status === "Approved" ? `Job card ${outcome.job.JobCardNo} approved (no approval level applies to this amount)` : `Job card ${outcome.job.JobCardNo} sent for approval`);
    return NextResponse.json({ success: true, status: outcome.status, message });
  } catch (err) {
    return handleApiError(err, "Failed to update job card approval");
  }
}
