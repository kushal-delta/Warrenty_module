import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";
import { callFilter, getScope, positionalParams } from "@/lib/auth/scope";

/** Lists engineer visit reports. Engineers only see their own visits. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { complaintId, engineerUserId, status } = await request.json().catch(() => ({}));
    const where: string[] = [], params: unknown[] = [];
    if (complaintId) { where.push(`v.[ComplaintId] = @p${params.length}`); params.push(complaintId); }
    if (status) { where.push(`v.[Status] = @p${params.length}`); params.push(status); }
    const engineer = user.Role === "ENGINEER" ? user.UserId : engineerUserId;
    if (engineer) { where.push(`v.[EngineerUserId] = @p${params.length}`); params.push(engineer); }
    // Engineers see their own visits (filtered above) even on calls later reassigned; everyone else follows the call's scope.
    const scopeFilter = user.Role === "ENGINEER" ? "" : callFilter(await getScope(user), "c", positionalParams(params));
    if (scopeFilter) where.push(scopeFilter);
    const visits = await query(
      `SELECT v.*, c.[ComplaintNo], c.[CustomerName], c.[Mobile], c.[Village], c.[District], c.[CallDate], CONCAT(u.[FirstName], ' ', u.[LastName]) AS [EngineerName]
       FROM dbo.[VisitReports] v JOIN dbo.[Complaints] c ON v.[ComplaintId] = c.[ComplaintId] LEFT JOIN dbo.[Users] u ON v.[EngineerUserId] = u.[UserId]
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY v.[VisitDate] DESC, v.[InsertedOn] DESC`,
      params
    );
    return NextResponse.json({ success: true, visits });
  } catch (err) {
    return handleApiError(err, "Failed to fetch visit reports");
  }
}
