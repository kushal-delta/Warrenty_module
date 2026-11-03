import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";
import { callFilter, getScope, positionalParams } from "@/lib/auth/scope";

/** Lists call reminders with their service call details. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { status, complaintId } = await request.json().catch(() => ({}));
    const where: string[] = [], params: unknown[] = [];
    if (status) { where.push(`r.[Status] = @p${params.length}`); params.push(status); }
    if (complaintId) { where.push(`r.[ComplaintId] = @p${params.length}`); params.push(complaintId); }
    const scopeFilter = callFilter(await getScope(user), "c", positionalParams(params));
    if (scopeFilter) where.push(scopeFilter);
    const reminders = await query(
      `SELECT r.*, c.[ComplaintNo], c.[CustomerName], c.[Mobile], c.[Status] AS [ComplaintStatus], u.[Username] AS [CreatedBy]
       FROM dbo.[ComplaintReminders] r JOIN dbo.[Complaints] c ON r.[ComplaintId] = c.[ComplaintId] LEFT JOIN dbo.[Users] u ON r.[InsertedByUserId] = u.[UserId]
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY CASE WHEN r.[Status] = 'Pending' THEN 0 ELSE 1 END, r.[ReminderDate] ASC`,
      params
    );
    return NextResponse.json({ success: true, reminders });
  } catch (err) {
    return handleApiError(err, "Failed to fetch reminders");
  }
}
