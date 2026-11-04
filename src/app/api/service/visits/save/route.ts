import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, dateValue, endOfToday, fail, handleApiError, inTransaction, nextDocNo, numberValue, requireUser, text } from "@/lib/services/apiHelpers";
import { VISIT_OUTCOMES } from "@/lib/config/service";
import { OUT_OF_SCOPE, callVisible, getScope } from "@/lib/auth/scope";

/** Saves a visit report. A new visit moves its call to "Visited" and assigns the engineer when the call had none. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const engineerUserId = user.Role === "ENGINEER" ? user.UserId : body.EngineerUserId;
    if (!body.ComplaintId) throw new InputError("Service call is required");
    if (!engineerUserId) throw new InputError("Engineer is required");
    const visitDate = dateValue(body.VisitDate, "Visit date", true)!;
    if (visitDate > endOfToday()) throw new InputError("Visit date cannot be in the future");
    const status = text(body.Status) || "Job card required";
    if (!VISIT_OUTCOMES.includes(status)) throw new InputError("Visit outcome is invalid");
    // Time in / out, travel, expenses and rating (prototype visit form) — all optional.
    const time = (v: unknown, label: string) => { const t = text(v, 5); if (t && !/^([01]d|2[0-3]):[0-5]d$/.test(t)) throw new InputError(`${label} must be a time like 10:30`); return t; };
    const startTime = time(body.StartTime, "Start time"), endTime = time(body.EndTime, "End time");
    if (startTime && endTime && endTime < startTime) throw new InputError("End time cannot be before the start time");
    const rating = numberValue(body.CustomerRating, "Customer rating", { integer: true, min: 1 });
    if (rating != null && rating > 5) throw new InputError("Customer rating must be between 1 and 5");
    const values = {
      observations: text(body.Observations), actionTaken: text(body.ActionTaken), feedback: text(body.CustomerFeedback, 250),
      startTime, endTime, travelKm: numberValue(body.TravelKm, "Travel km", { integer: true }), travelExpense: numberValue(body.TravelExpense, "Travel expense"), otherExpense: numberValue(body.OtherExpense, "Other expense"),
      rating, fromLocation: text(body.FromLocation, 100), toLocation: text(body.ToLocation, 100),
    };

    if (!(await callVisible(await getScope(user), body.ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    const visit = await inTransaction(async (run) => {
      const complaint = (await run<any>(`SELECT [ComplaintId], [ComplaintNo], [CallDate], [Status], [EngineerUserId], [ServiceCenterId] FROM dbo.[Complaints] WITH (UPDLOCK) WHERE [ComplaintId] = @id`, { id: body.ComplaintId }))[0];
      if (!complaint) throw new InputError("Selected service call was not found");
      const callDay = new Date(complaint.CallDate); callDay.setHours(0, 0, 0, 0);
      if (visitDate < callDay) throw new InputError("Visit date cannot be before the call date");

      if (body.VisitReportId) {
        const updated = (await run(`UPDATE dbo.[VisitReports] SET [EngineerUserId] = @engineer, [VisitDate] = @visitDate, [Observations] = @observations, [ActionTaken] = @actionTaken, [CustomerFeedback] = @feedback, [Status] = @status, [StartTime] = @startTime, [EndTime] = @endTime, [TravelKm] = @travelKm, [TravelExpense] = @travelExpense, [OtherExpense] = @otherExpense, [CustomerRating] = @rating, [FromLocation] = @fromLocation, [ToLocation] = @toLocation, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId OUTPUT INSERTED.* WHERE [VisitReportId] = @id${user.Role === "ENGINEER" ? " AND [EngineerUserId] = @userId" : ""}`, { engineer: engineerUserId, visitDate, ...values, status, userId: user.UserId, id: body.VisitReportId }))[0];
        if (!updated) throw new InputError("Visit report not found");
        return updated;
      }

      const visitNo = await nextDocNo(run, "VISIT", "VR", user.UserId);
      const created = (await run(`INSERT INTO dbo.[VisitReports] ([VisitReportId],[VisitNo],[ComplaintId],[EngineerUserId],[VisitDate],[Observations],[ActionTaken],[CustomerFeedback],[Status],[StartTime],[EndTime],[TravelKm],[TravelExpense],[OtherExpense],[CustomerRating],[FromLocation],[ToLocation],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) OUTPUT INSERTED.* VALUES (@id,@visitNo,@complaintId,@engineer,@visitDate,@observations,@actionTaken,@feedback,@status,@startTime,@endTime,@travelKm,@travelExpense,@otherExpense,@rating,@fromLocation,@toLocation,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`, { id: randomUUID(), visitNo, complaintId: complaint.ComplaintId, engineer: engineerUserId, visitDate, ...values, status, userId: user.UserId }))[0];

      const nextStatus = ["New", "Assigned"].includes(complaint.Status) ? "Visited" : complaint.Status;
      await run(`UPDATE dbo.[Complaints] SET [Status] = @status, [EngineerUserId] = COALESCE([EngineerUserId], @engineer), [AssignedOn] = COALESCE([AssignedOn], @visitDate), [ServiceCenterId] = COALESCE([ServiceCenterId], (SELECT [ServiceCenterId] FROM dbo.[Users] WHERE [UserId] = @engineer)), [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [ComplaintId] = @id`, { status: nextStatus, engineer: engineerUserId, visitDate, userId: user.UserId, id: complaint.ComplaintId });
      return created;
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: body.VisitReportId ? "UPDATE" : "CREATE", tableName: "VisitReports", recordId: visit.VisitReportId, details: { VisitNo: visit.VisitNo, Outcome: visit.Status } });
    return NextResponse.json({ success: true, visit });
  } catch (err) {
    return handleApiError(err, "Failed to save visit report");
  }
}
