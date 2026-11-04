import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { fail, handleApiError, requireUser, runQuery, text } from "@/lib/services/apiHelpers";
import { TEXT_LIST_GROUPS } from "@/lib/services/challans";

/** Adds a value to a challan text list (purpose, party kind, transporter) — the "Add new …" option in the dropdown. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json().catch(() => ({}));
    const group = body.group as string;
    const value = text(body.value, 120);
    if (!TEXT_LIST_GROUPS.includes(group as any)) return fail("Unknown list");
    if (!value) return fail("Enter a value");
    // Same text in another case counts as the existing value.
    const existing = (await runQuery<any>(`SELECT TOP 1 [Value], [IsActive], [TextListId] FROM dbo.[TextLists] WHERE [ListGroup] = @group AND LOWER([Value]) = LOWER(@value)`, { group, value }))[0];
    if (existing) {
      if (!existing.IsActive) await runQuery(`UPDATE dbo.[TextLists] SET [IsActive] = 1, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [TextListId] = @id`, { id: existing.TextListId, userId: user.UserId });
      return NextResponse.json({ success: true, value: existing.Value });
    }
    const id = randomUUID();
    await runQuery(`INSERT INTO dbo.[TextLists] ([TextListId], [ListGroup], [Value], [SortOrder], [IsActive], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
      VALUES (@id, @group, @value, 100, 1, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, { id, group, value, userId: user.UserId });
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "CREATE", tableName: "TextLists", recordId: id, details: { ListGroup: group, Value: value } });
    return NextResponse.json({ success: true, value });
  } catch (err) {
    return handleApiError(err, "Could not add the value");
  }
}
