import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, requireUser, runQuery, text } from "@/lib/services/apiHelpers";
import { TEXT_LIST_GROUPS } from "@/lib/services/challans";

/**
 * Adds / updates a text list value (Configuration → Text Lists): value, sort order, active.
 * Renaming does not touch challans already saved — they keep the text they were saved with.
 * Values are never deleted; switching one off hides it from the dropdowns.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json().catch(() => ({}));
    const id = (body.TextListId as string | undefined) || null;
    const group = String(body.ListGroup || "");
    const value = text(body.Value, 120);
    const sortOrder = body.SortOrder === undefined || body.SortOrder === null || body.SortOrder === "" ? 100 : Math.trunc(Number(body.SortOrder));
    const isActive = body.IsActive === undefined ? true : Boolean(body.IsActive);
    if (!TEXT_LIST_GROUPS.includes(group as any)) throw new InputError("Select the list");
    if (!value) throw new InputError("Value is required");
    if (!Number.isFinite(sortOrder) || sortOrder < 0 || sortOrder > 9999) throw new InputError("Sort order must be between 0 and 9999");

    const duplicate = await runQuery(`SELECT TOP 1 1 AS [x] FROM dbo.[TextLists] WHERE [ListGroup] = @group AND LOWER([Value]) = LOWER(@value)${id ? " AND [TextListId] <> @id" : ""}`, { group, value, id });
    if (duplicate.length) throw new InputError(`"${value}" is already in this list`);

    let saved: any;
    if (id) {
      saved = (await runQuery(`UPDATE dbo.[TextLists] SET [Value] = @value, [SortOrder] = @sortOrder, [IsActive] = @isActive, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId
        OUTPUT INSERTED.* WHERE [TextListId] = @id AND [ListGroup] = @group`, { value, sortOrder, isActive, userId: user.UserId, id, group }))[0];
      if (!saved) throw new InputError("Value not found");
    } else {
      saved = (await runQuery(`INSERT INTO dbo.[TextLists] ([TextListId], [ListGroup], [Value], [SortOrder], [IsActive], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
        OUTPUT INSERTED.* VALUES (@id, @group, @value, @sortOrder, @isActive, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, { id: randomUUID(), group, value, sortOrder, isActive, userId: user.UserId }))[0];
    }

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: id ? "UPDATE" : "CREATE", tableName: "TextLists", recordId: saved.TextListId, details: { ListGroup: group, Value: value, SortOrder: sortOrder, Active: isActive } });
    return NextResponse.json({ success: true, value: saved });
  } catch (err) {
    return handleApiError(err, "Could not save the value");
  }
}
