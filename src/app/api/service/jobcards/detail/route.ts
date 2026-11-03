import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { activeRules, canActOnRule, loadJobCard, rulesFor } from "@/lib/services/jobCards";
import { OUT_OF_SCOPE, callVisible, getScope } from "@/lib/auth/scope";

/** One job card with its fault lines, spare lines, approval chain and decision trail. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { JobCardId } = await request.json().catch(() => ({}));
    if (!JobCardId) return fail("JobCardId is required");
    const job = await loadJobCard(runQuery, JobCardId);
    if (!job) return fail("Job card not found", 404);
    if (!(await callVisible(await getScope(user), job.ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    const [faults, items, approvals, rules] = await Promise.all([
      runQuery(`SELECT f.*, m.[FaultName], m.[Category] FROM dbo.[JobCardFaultLns] f JOIN dbo.[FaultMasters] m ON f.[FaultMasterId] = m.[FaultMasterId] WHERE f.[JobCardId] = @id ORDER BY m.[Category], m.[FaultName]`, { id: JobCardId }),
      runQuery(`SELECT i.*, s.[SpareCode], s.[SpareName], s.[Uom] FROM dbo.[JobCardItemLns] i JOIN dbo.[Spares] s ON i.[SpareId] = s.[SpareId] WHERE i.[JobCardId] = @id ORDER BY i.[InsertedOn]`, { id: JobCardId }),
      runQuery(`SELECT a.*, CONCAT(u.[FirstName], ' ', u.[LastName]) AS [ApproverName], u.[Role] AS [ApproverRole] FROM dbo.[JobCardApprovalLns] a LEFT JOIN dbo.[Users] u ON a.[ApproverUserId] = u.[UserId] WHERE a.[JobCardId] = @id ORDER BY a.[ActionDate]`, { id: JobCardId }),
      activeRules(runQuery),
    ]);
    const levels = rulesFor(rules, Number(job.TotalEstimate));
    const pendingRule = job.Status === "In Approval" ? levels.find((r) => r.LevelNo === job.CurrentLevel) : undefined;
    return NextResponse.json({
      success: true,
      jobCard: { ...job, CustomerPayable: Math.max(0, Number(job.TotalEstimate) - Number(job.WarrantyAmount)), PendingRole: pendingRule?.RoleName || null, CanAct: canActOnRule(pendingRule, user, job.ServiceCenterId) },
      faults, items, approvals, levels,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load job card");
  }
}
