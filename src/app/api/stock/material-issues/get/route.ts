import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { issueScope } from "@/lib/services/warehouseStock";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/** Material issues in the user's scope, or one issue with its lines when `MaterialIssueId` is sent. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { MaterialIssueId } = await request.json().catch(() => ({}));
    const values: Record<string, unknown> = {};
    const scope = issueScope(user, "i", values);
    const base = `FROM dbo.[MaterialIssues] i JOIN dbo.[Warehouses] w ON w.[WarehouseId] = i.[WarehouseId] LEFT JOIN dbo.[Users] u ON u.[UserId] = i.[InsertedByUserId]`;

    if (MaterialIssueId) {
      const issue = (await runQuery<any>(`SELECT i.*, w.[WarehouseName], w.[WarehouseCode], CONCAT(u.[FirstName], ' ', u.[LastName]) AS [IssuedBy] ${base}
        WHERE i.[MaterialIssueId] = @id${scope ? ` AND ${scope}` : ""}`, { ...values, id: MaterialIssueId }))[0];
      if (!issue) return fail(OUT_OF_SCOPE, 404);
      const items = await runQuery(`SELECT * FROM dbo.[MaterialIssueItemLns] WHERE [MaterialIssueId] = @id ORDER BY [LineNo]`, { id: MaterialIssueId });
      return NextResponse.json({ success: true, issue, items });
    }

    const issues = await runQuery(`SELECT i.[MaterialIssueId], i.[IssueNo], i.[IssueDate], i.[WarehouseId], i.[Purpose], i.[Remarks], i.[InsertedByUserId], w.[WarehouseName], w.[WarehouseCode],
        CONCAT(u.[FirstName], ' ', u.[LastName]) AS [IssuedBy],
        (SELECT COUNT(*) FROM dbo.[MaterialIssueItemLns] l WHERE l.[MaterialIssueId] = i.[MaterialIssueId]) AS [ItemCount],
        (SELECT COALESCE(SUM(l.[Qty]), 0) FROM dbo.[MaterialIssueItemLns] l WHERE l.[MaterialIssueId] = i.[MaterialIssueId]) AS [TotalQty],
        (SELECT COALESCE(SUM(l.[Qty] * l.[Rate]), 0) FROM dbo.[MaterialIssueItemLns] l WHERE l.[MaterialIssueId] = i.[MaterialIssueId]) AS [TotalValue]
      ${base}${scope ? ` WHERE ${scope}` : ""} ORDER BY i.[IssueDate] DESC, i.[IssueNo] DESC`, values);
    return NextResponse.json({ success: true, issues });
  } catch (err) {
    return handleApiError(err, "Could not load material issues");
  }
}
