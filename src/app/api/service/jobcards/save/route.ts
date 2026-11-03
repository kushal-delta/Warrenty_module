import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, dateValue, endOfToday, fail, handleApiError, inTransaction, isHeadOffice, nextDocNo, numberValue, requireUser, text } from "@/lib/services/apiHelpers";
import { loadJobCard, submitJobCard } from "@/lib/services/jobCards";
import { OUT_OF_SCOPE, callVisible, getScope } from "@/lib/auth/scope";

/**
 * Saves a job card (repair estimate) with its fault and spare lines.
 * `submit: true` sends it for approval. Editing a card that is already in approval (HO only) restarts the chain on the new amount.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    if (!body.ComplaintId) throw new InputError("Service call is required");
    const jobCardDate = dateValue(body.JobCardDate, "Job card date", true)!;
    if (jobCardDate > endOfToday()) throw new InputError("Job card date cannot be in the future");
    const labourTotal = numberValue(body.LabourTotal, "Labour charges") ?? 0;
    const items = (Array.isArray(body.items) ? body.items : []).map((item: any, index: number) => {
      if (!item.SpareId) throw new InputError(`Line ${index + 1}: select a spare`);
      const qty = numberValue(item.Qty, `Line ${index + 1} quantity`, { required: true, integer: true, min: 1 })!;
      const rate = numberValue(item.Rate, `Line ${index + 1} rate`, { required: true })!;
      return { SpareId: item.SpareId, Qty: qty, Rate: rate, Amount: Number((qty * rate).toFixed(2)), IsWarranty: Boolean(item.IsWarranty) };
    });
    const faults = (Array.isArray(body.faults) ? body.faults : []).filter((f: any) => f?.FaultMasterId);
    if (!items.length && labourTotal <= 0) throw new InputError("Add at least one spare line or labour charges");
    const sparesTotal = Number(items.reduce((sum: number, item: any) => sum + item.Amount, 0).toFixed(2));
    const totalEstimate = Number((sparesTotal + labourTotal).toFixed(2));

    if (!(await callVisible(await getScope(user), body.ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    const result = await inTransaction(async (run) => {
      const complaint = (await run<any>(`SELECT [ComplaintId], [ComplaintNo], [CallDate], [Status], [EngineerUserId] FROM dbo.[Complaints] WHERE [ComplaintId] = @id`, { id: body.ComplaintId }))[0];
      if (!complaint) throw new InputError("Selected service call was not found");
      if (["Closed", "Cancelled"].includes(complaint.Status)) throw new InputError(`Service call ${complaint.ComplaintNo} is ${complaint.Status.toLowerCase()}`);
      if (user.Role === "ENGINEER" && complaint.EngineerUserId?.toLowerCase() !== user.UserId.toLowerCase()) throw new InputError("You can only raise job cards for calls assigned to you");
      const callDay = new Date(complaint.CallDate); callDay.setHours(0, 0, 0, 0);
      if (jobCardDate < callDay) throw new InputError("Job card date cannot be before the call date");

      let jobCardId = body.JobCardId as string | undefined, wasInApproval = false;
      if (jobCardId) {
        const existing = (await run<any>(`SELECT [Status] FROM dbo.[JobCards] WITH (UPDLOCK) WHERE [JobCardId] = @id`, { id: jobCardId }))[0];
        if (!existing) throw new InputError("Job card not found");
        wasInApproval = existing.Status === "In Approval";
        const editable = ["Draft", "Rejected"].includes(existing.Status) || (wasInApproval && isHeadOffice(user));
        if (!editable) throw new InputError(`A job card that is ${existing.Status.toLowerCase()} cannot be edited`);
        await run(`UPDATE dbo.[JobCards] SET [ComplaintId] = @complaintId, [JobCardDate] = @date, [SparesTotal] = @spares, [LabourTotal] = @labour, [TotalEstimate] = @total, [Remarks] = @remarks, [Status] = CASE WHEN [Status] = 'Rejected' THEN 'Draft' ELSE [Status] END, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [JobCardId] = @id`,
          { complaintId: complaint.ComplaintId, date: jobCardDate, spares: sparesTotal.toFixed(2), labour: labourTotal.toFixed(2), total: totalEstimate.toFixed(2), remarks: text(body.Remarks), userId: user.UserId, id: jobCardId });
        await run(`DELETE FROM dbo.[JobCardItemLns] WHERE [JobCardId] = @id`, { id: jobCardId });
        await run(`DELETE FROM dbo.[JobCardFaultLns] WHERE [JobCardId] = @id`, { id: jobCardId });
      } else {
        jobCardId = randomUUID();
        const jobCardNo = await nextDocNo(run, "JOBCARD", "JC", user.UserId);
        await run(`INSERT INTO dbo.[JobCards] ([JobCardId],[JobCardNo],[ComplaintId],[JobCardDate],[Status],[CurrentLevel],[TotalEstimate],[SparesTotal],[LabourTotal],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (@id,@no,@complaintId,@date,'Draft',0,@total,@spares,@labour,@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
          { id: jobCardId, no: jobCardNo, complaintId: complaint.ComplaintId, date: jobCardDate, total: totalEstimate.toFixed(2), spares: sparesTotal.toFixed(2), labour: labourTotal.toFixed(2), remarks: text(body.Remarks), userId: user.UserId });
      }

      for (const item of items) {
        await run(`INSERT INTO dbo.[JobCardItemLns] ([JobCardItemLnId],[JobCardId],[SpareId],[Qty],[Rate],[Amount],[IsWarranty],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (NEWID(),@jobCardId,@spareId,@qty,@rate,@amount,@warranty,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
          { jobCardId, spareId: item.SpareId, qty: item.Qty, rate: item.Rate.toFixed(2), amount: item.Amount.toFixed(2), warranty: item.IsWarranty, userId: user.UserId });
      }
      for (const fault of faults) {
        await run(`INSERT INTO dbo.[JobCardFaultLns] ([JobCardFaultLnId],[JobCardId],[FaultMasterId],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (NEWID(),@jobCardId,@faultId,@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
          { jobCardId, faultId: fault.FaultMasterId, remarks: text(fault.Remarks, 250), userId: user.UserId });
      }

      const job = await loadJobCard(run, jobCardId);
      const status = body.submit || wasInApproval ? await submitJobCard(run, job, user.UserId) : job.Status;
      return { jobCard: { ...job, Status: status }, restarted: wasInApproval };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: body.JobCardId ? "UPDATE" : "CREATE", tableName: "JobCards", recordId: result.jobCard.JobCardId, details: { JobCardNo: result.jobCard.JobCardNo, Total: totalEstimate, Status: result.jobCard.Status } });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return handleApiError(err, "Failed to save job card");
  }
}
