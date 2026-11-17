import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { canUseForm } from "@/lib/auth/forms";
import { requestScope } from "@/lib/services/materialRequests";
import { challanScope } from "@/lib/services/challans";
import { RETURN_PENDING_QTY } from "@/lib/services/challanReturns";

/**
 * Counts for the side-menu badges, keyed by menu path. Each count uses the same visibility as its screen,
 * and is only worked out when the user may open that screen.
 *   /stock/material-approvals  — material requests waiting for a decision (status Pending)
 *   /stock/returnable-pending  — returnable challans still out with quantity to come back (and how many are overdue)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const counts: Record<string, { count: number; overdue?: number }> = {};

    const jobs: Promise<void>[] = [];
    if (canUseForm(user, "stock.request-approvals")) {
      jobs.push((async () => {
        const values: Record<string, unknown> = {};
        const scope = requestScope(user, "r", values);
        const row = (await runQuery<any>(`SELECT COUNT(*) AS [n] FROM dbo.[MaterialRequests] r WHERE r.[Status] = 'Pending'${scope ? ` AND ${scope}` : ""}`, values))[0];
        counts["/stock/material-approvals"] = { count: Number(row?.n || 0) };
      })());
    }
    if (canUseForm(user, "stock.returnable")) {
      jobs.push((async () => {
        const values: Record<string, unknown> = {};
        const scope = challanScope(user, "d", values);
        const row = (await runQuery<any>(`SELECT COUNT(*) AS [n],
            SUM(CASE WHEN d.[ExpectedBackBy] IS NOT NULL AND d.[ExpectedBackBy] < CAST(SYSDATETIME() AS date) THEN 1 ELSE 0 END) AS [overdue]
          FROM dbo.[DeliveryChallans] d
          WHERE d.[ChallanType] = 'Returnable' AND d.[Status] = 'Dispatched' AND ${RETURN_PENDING_QTY} > 0${scope ? ` AND ${scope}` : ""}`, values))[0];
        counts["/stock/returnable-pending"] = { count: Number(row?.n || 0), overdue: Number(row?.overdue || 0) };
      })());
    }
    await Promise.all(jobs);
    return NextResponse.json({ success: true, counts });
  } catch (err) {
    return handleApiError(err, "Could not load menu counts");
  }
}
