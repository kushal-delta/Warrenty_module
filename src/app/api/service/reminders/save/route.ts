import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/sqlserver";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, dateValue, fail, handleApiError, requireUser, text } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE, callVisible, getScope } from "@/lib/auth/scope";

/** Creates or updates a call reminder. Sending only { ComplaintReminderId, Status: "Done" } marks it done. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const status = body.Status === "Done" ? "Done" : "Pending";

    if (body.ComplaintReminderId && body.ReminderText === undefined) {
      const reminder = (await query<any>(`UPDATE dbo.[ComplaintReminders] SET [Status] = @p0, [DoneOn] = CASE WHEN @p0 = 'Done' THEN COALESCE([DoneOn], SYSUTCDATETIME()) ELSE NULL END, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p1 OUTPUT INSERTED.* WHERE [ComplaintReminderId] = @p2`, [status, user.UserId, body.ComplaintReminderId]))[0];
      if (!reminder) return fail("Reminder not found", 404);
      return NextResponse.json({ success: true, reminder });
    }

    if (!body.ComplaintId) throw new InputError("Service call is required");
    const reminderDate = dateValue(body.ReminderDate, "Remind on date", true);
    const reminderText = text(body.ReminderText, 300);
    if (!reminderText) throw new InputError("Reminder note is required");
    if (!(await callVisible(await getScope(user), body.ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    const complaint = (await query<any>(`SELECT [ComplaintNo] FROM dbo.[Complaints] WHERE [ComplaintId] = @p0`, [body.ComplaintId]))[0];
    if (!complaint) throw new InputError("Selected service call was not found");

    let reminder: any;
    if (body.ComplaintReminderId) {
      reminder = (await query(`UPDATE dbo.[ComplaintReminders] SET [ComplaintId] = @p0, [ReminderDate] = @p1, [ReminderText] = @p2, [Status] = @p3, [DoneOn] = CASE WHEN @p3 = 'Done' THEN COALESCE([DoneOn], SYSUTCDATETIME()) ELSE NULL END, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p4 OUTPUT INSERTED.* WHERE [ComplaintReminderId] = @p5`, [body.ComplaintId, reminderDate, reminderText, status, user.UserId, body.ComplaintReminderId]))[0];
      if (!reminder) return fail("Reminder not found", 404);
    } else {
      reminder = (await query(`INSERT INTO dbo.[ComplaintReminders] ([ComplaintReminderId],[ComplaintId],[ReminderDate],[ReminderText],[Status],[DoneOn],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) OUTPUT INSERTED.* VALUES (@p0,@p1,@p2,@p3,@p4,CASE WHEN @p4 = 'Done' THEN SYSUTCDATETIME() ELSE NULL END,@p5,@p5,SYSUTCDATETIME(),SYSUTCDATETIME())`, [randomUUID(), body.ComplaintId, reminderDate, reminderText, status, user.UserId]))[0];
    }
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: body.ComplaintReminderId ? "UPDATE" : "CREATE", tableName: "ComplaintReminders", recordId: reminder.ComplaintReminderId, details: { ComplaintNo: complaint.ComplaintNo, Status: status } });
    return NextResponse.json({ success: true, reminder });
  } catch (err) {
    return handleApiError(err, "Failed to save reminder");
  }
}
