import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { loadRequest, requestScope } from "@/lib/services/materialRequests";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/** Lists material requests in the user's scope, or one request with its lines when `MaterialRequestId` is sent. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { MaterialRequestId } = await request.json().catch(() => ({}));
    const values: Record<string, unknown> = {};
    const scope = requestScope(user, "r", values);

    if (MaterialRequestId) {
      const head = await loadRequest(runQuery, MaterialRequestId);
      if (!head) return fail("Material request not found", 404);
      const visible = !scope || (await runQuery(`SELECT TOP 1 1 AS [ok] FROM dbo.[MaterialRequests] r WHERE r.[MaterialRequestId] = @id AND ${scope}`, { ...values, id: MaterialRequestId })).length;
      if (!visible) return fail(OUT_OF_SCOPE, 403);
      const items = await runQuery(`SELECT * FROM dbo.[MaterialRequestItemLns] WHERE [MaterialRequestId] = @id ORDER BY [LineNo]`, { id: MaterialRequestId });
      return NextResponse.json({ success: true, request: head, items });
    }

    const requests = await runQuery(`SELECT r.*, sc.[ServiceCenterName], sc.[ServiceCenterCode], CONCAT(u.[FirstName], ' ', u.[LastName]) AS [RequestedBy],
        (SELECT CONCAT(du.[FirstName], ' ', du.[LastName]) FROM dbo.[Users] du WHERE du.[UserId] = r.[DecisionByUserId]) AS [DecisionBy],
        (SELECT COUNT(*) FROM dbo.[MaterialRequestItemLns] l WHERE l.[MaterialRequestId] = r.[MaterialRequestId]) AS [ItemCount],
        (SELECT COALESCE(SUM(l.[Qty]), 0) FROM dbo.[MaterialRequestItemLns] l WHERE l.[MaterialRequestId] = r.[MaterialRequestId]) AS [TotalQty]
      FROM dbo.[MaterialRequests] r LEFT JOIN dbo.[ServiceCenters] sc ON r.[ServiceCenterId] = sc.[ServiceCenterId] LEFT JOIN dbo.[Users] u ON r.[InsertedByUserId] = u.[UserId]
      ${scope ? `WHERE ${scope}` : ""} ORDER BY r.[RequestDate] DESC, r.[InsertedOn] DESC`, values);
    return NextResponse.json({ success: true, requests });
  } catch (err) {
    return handleApiError(err, "Could not load material requests");
  }
}
