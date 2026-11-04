import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { JOBCARD_SELECT, activeRules, canActOnRule, rulesFor } from "@/lib/services/jobCards";
import { callFilter, getScope, namedParams, ownEntriesOnly } from "@/lib/auth/scope";

/** Lists job cards with approval progress. `pendingForMe: true` returns only cards waiting on the signed-in approver. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { status, complaintId, pendingForMe } = await request.json().catch(() => ({}));
    const where: string[] = [], values: Record<string, unknown> = {};
    if (status) { where.push("j.[Status] = @status"); values.status = status; }
    if (pendingForMe) where.push("j.[Status] = 'In Approval'");
    if (complaintId) { where.push("j.[ComplaintId] = @complaintId"); values.complaintId = complaintId; }
    const scopeFilter = callFilter(await getScope(user), "c", namedParams(values));
    if (scopeFilter) where.push(scopeFilter);
    if (ownEntriesOnly(user.Role)) { where.push("j.[InsertedByUserId] = @ownerId"); values.ownerId = user.UserId; }
    const [rows, rules] = await Promise.all([
      runQuery<any>(`${JOBCARD_SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY j.[JobCardDate] DESC, j.[InsertedOn] DESC`, values),
      activeRules(runQuery),
    ]);
    const jobCards = rows.map((j) => {
      const levels = rulesFor(rules, Number(j.TotalEstimate));
      const pendingRule = j.Status === "In Approval" ? levels.find((r) => r.LevelNo === j.CurrentLevel) : undefined;
      return {
        ...j,
        CustomerPayable: Math.max(0, Number(j.TotalEstimate) - Number(j.WarrantyAmount)),
        LevelsRequired: levels.length,
        LevelPosition: pendingRule ? levels.indexOf(pendingRule) + 1 : 0,
        PendingRole: pendingRule?.RoleName || null,
        CanAct: canActOnRule(pendingRule, user, j.ServiceCenterId),
      };
    });
    return NextResponse.json({ success: true, jobCards: pendingForMe ? jobCards.filter((j) => j.CanAct) : jobCards });
  } catch (err) {
    return handleApiError(err, "Failed to fetch job cards");
  }
}
