import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, dateValue, endOfToday, fail, handleApiError, inTransaction, isHeadOffice, nextDocNo, numberValue, requireUser, text } from "@/lib/services/apiHelpers";
import { loadJobCard, submitJobCard } from "@/lib/services/jobCards";
import { OUT_OF_SCOPE, callVisible, getScope, jobCardVisible } from "@/lib/auth/scope";
import { insertAttachments, removeAttachmentFiles, removeSavedPhotos, savePhotos, syncVideos, type SavedPhoto } from "@/lib/services/attachments";
import { MAX_JOBCARD_PHOTOS, MAX_VIDEOS } from "@/lib/config/service";

const round2 = (n: number) => Math.round(n * 100) / 100;

interface LineIn { ItemType: "Spare" | "Labour"; SpareId: string | null; LabourMasterId: string | null; SerialNo: string | null; Qty: number; Rate: number; GstPct: number; IsWarranty: boolean; Remarks: string | null; Amount: number; GstAmount: number }

/** Lines from the new `lines` payload; older clients send `items` (spares only) + `LabourTotal`. */
function readLines(body: any): LineIn[] {
  const raw: any[] = Array.isArray(body.lines) ? body.lines : (Array.isArray(body.items) ? body.items.map((i: any) => ({ ...i, ItemType: "Spare" })) : []);
  return raw.map((l, index) => {
    const n = index + 1;
    const ItemType = l.ItemType === "Labour" ? "Labour" : "Spare";
    if (ItemType === "Spare" && !l.SpareId) throw new InputError(`Line ${n}: select a spare`);
    if (ItemType === "Labour" && !l.LabourMasterId) throw new InputError(`Line ${n}: select a labour / service charge`);
    const Qty = numberValue(l.Qty, `Line ${n} quantity`, { required: true, integer: true, min: 1 })!;
    const Rate = numberValue(l.Rate, `Line ${n} rate`, { required: true })!;
    const GstPct = numberValue(l.GstPct ?? 0, `Line ${n} GST %`) ?? 0;
    if (GstPct > 100) throw new InputError(`Line ${n}: GST % is invalid`);
    const Amount = round2(Qty * Rate);
    return {
      ItemType, SpareId: ItemType === "Spare" ? l.SpareId : null, LabourMasterId: ItemType === "Labour" ? l.LabourMasterId : null,
      SerialNo: text(l.SerialNo, 60)?.toUpperCase() || null, Qty, Rate, GstPct, IsWarranty: Boolean(l.IsWarranty), Remarks: text(l.Remarks, 250),
      Amount, GstAmount: round2((Amount * GstPct) / 100),
    };
  });
}

/**
 * Saves a job card (repair estimate), matching the prototype form:
 *  1 header  — ComplaintId*, JobCardDate, ServiceCenterId*, EngineerUserId, Remarks
 *  2 faults  — [{ FaultMasterId, Remarks (nature / diagnosis) }]
 *  3 lines   — [{ ItemType: Spare | Labour, SpareId | LabourMasterId, SerialNo, Qty, Rate, GstPct, IsWarranty, Remarks }]
 *  4 photos  — at least one photo is required (new [{ fileName, dataUrl }] + kept existing, minus removePhotoIds)
 *    videos  — optional: videoIds = every video to keep (existing + new ones uploaded via /api/attachments/upload)
 *  summary   — OtherCharges; totals, GST and the warranty / customer split are worked out here.
 * `submit: true` sends it for approval. Editing a card already in approval (HO only) restarts the chain on the new amount.
 */
export async function POST(request: NextRequest) {
  let photos: SavedPhoto[] = [];
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    if (!body.ComplaintId) throw new InputError("Service call is required");
    const jobCardDate = dateValue(body.JobCardDate, "Job card date", true)!;
    if (jobCardDate > endOfToday()) throw new InputError("Job card date cannot be in the future");
    const serviceCenterId = body.ServiceCenterId || null;
    const engineerUserId = user.Role === "ENGINEER" ? user.UserId : body.EngineerUserId || null;

    const lines = readLines(body);
    const legacyLabour = !Array.isArray(body.lines) ? numberValue(body.LabourTotal, "Labour charges") ?? 0 : 0;
    const otherCharges = numberValue(body.OtherCharges, "Other charges") ?? 0;
    const faults = (Array.isArray(body.faults) ? body.faults : []).filter((f: any) => f?.FaultMasterId);

    const sparesTotal = round2(lines.filter((l) => l.ItemType === "Spare").reduce((s, l) => s + l.Amount, 0));
    const labourTotal = round2(lines.filter((l) => l.ItemType === "Labour").reduce((s, l) => s + l.Amount, 0) + legacyLabour);
    const gstTotal = round2(lines.reduce((s, l) => s + l.GstAmount, 0));
    const totalEstimate = round2(sparesTotal + labourTotal + gstTotal + otherCharges);

    if (!(await callVisible(await getScope(user), body.ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    photos = await savePhotos(body.photos, MAX_JOBCARD_PHOTOS);
    const removePhotoIds: string[] = (Array.isArray(body.removePhotoIds) ? body.removePhotoIds : []).map(String);

    let removedVideos: string[] = [];
    const result = await inTransaction(async (run) => {
      const complaint = (await run<any>(`SELECT [ComplaintId], [ComplaintNo], [CallDate], [Status], [EngineerUserId], [ServiceCenterId] FROM dbo.[Complaints] WHERE [ComplaintId] = @id`, { id: body.ComplaintId }))[0];
      if (!complaint) throw new InputError("Selected service call was not found");
      if (["Closed", "Cancelled"].includes(complaint.Status)) throw new InputError(`Service call ${complaint.ComplaintNo} is ${complaint.Status.toLowerCase()}`);
      if (user.Role === "ENGINEER" && complaint.EngineerUserId?.toLowerCase() !== user.UserId.toLowerCase()) throw new InputError("You can only raise job cards for calls assigned to you");
      const callDay = new Date(complaint.CallDate); callDay.setHours(0, 0, 0, 0);
      if (jobCardDate < callDay) throw new InputError("Job card date cannot be before the call date");
      const centre = serviceCenterId || complaint.ServiceCenterId;
      if (!centre) throw new InputError("Select the service center");
      const engineer = engineerUserId || complaint.EngineerUserId || null;

      let jobCardId = body.JobCardId as string | undefined, wasInApproval = false, keptPhotos = 0;
      const header = { complaintId: complaint.ComplaintId, date: jobCardDate, spares: sparesTotal.toFixed(2), labour: labourTotal.toFixed(2), gst: gstTotal.toFixed(2), other: otherCharges.toFixed(2), total: totalEstimate.toFixed(2), remarks: text(body.Remarks), sc: centre, eng: engineer, userId: user.UserId };
      if (jobCardId) {
        const existing = (await run<any>(`SELECT [Status], [InsertedByUserId] FROM dbo.[JobCards] WITH (UPDLOCK) WHERE [JobCardId] = @id`, { id: jobCardId }))[0];
        if (!existing) throw new InputError("Job card not found");
        if (!jobCardVisible(user, existing)) throw new InputError(OUT_OF_SCOPE);
        wasInApproval = existing.Status === "In Approval";
        const editable = ["Draft", "Rejected"].includes(existing.Status) || (wasInApproval && isHeadOffice(user));
        if (!editable) throw new InputError(`A job card that is ${existing.Status.toLowerCase()} cannot be edited`);
        await run(`UPDATE dbo.[JobCards] SET [ComplaintId] = @complaintId, [JobCardDate] = @date, [SparesTotal] = @spares, [LabourTotal] = @labour, [GstTotal] = @gst, [OtherCharges] = @other, [TotalEstimate] = @total, [Remarks] = @remarks, [ServiceCenterId] = @sc, [EngineerUserId] = @eng, [Status] = CASE WHEN [Status] = 'Rejected' THEN 'Draft' ELSE [Status] END, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [JobCardId] = @id`, { ...header, id: jobCardId });
        await run(`DELETE FROM dbo.[JobCardItemLns] WHERE [JobCardId] = @id`, { id: jobCardId });
        await run(`DELETE FROM dbo.[JobCardFaultLns] WHERE [JobCardId] = @id`, { id: jobCardId });
        for (const photoId of removePhotoIds) await run(`DELETE FROM dbo.[Attachments] WHERE [AttachmentId] = @pid AND [ParentTable] = 'JobCards' AND [ParentId] = @id`, { pid: photoId, id: jobCardId });
        keptPhotos = Number((await run<any>(`SELECT COUNT(*) AS [n] FROM dbo.[Attachments] WHERE [ParentTable] = 'JobCards' AND [ParentId] = @id AND [FileType] LIKE 'image/%'`, { id: jobCardId }))[0].n);
      } else {
        jobCardId = randomUUID();
        const jobCardNo = await nextDocNo(run, "JOBCARD", "JC", user.UserId);
        await run(`INSERT INTO dbo.[JobCards] ([JobCardId],[JobCardNo],[ComplaintId],[JobCardDate],[Status],[CurrentLevel],[TotalEstimate],[SparesTotal],[LabourTotal],[GstTotal],[OtherCharges],[Remarks],[ServiceCenterId],[EngineerUserId],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (@id,@no,@complaintId,@date,'Draft',0,@total,@spares,@labour,@gst,@other,@remarks,@sc,@eng,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
          { ...header, id: jobCardId, no: jobCardNo });
      }

      // Photos are mandatory on a job card (multiple allowed).
      if (keptPhotos + photos.length < 1) throw new InputError("Attach at least one photo of the fault / site");
      if (keptPhotos + photos.length > MAX_JOBCARD_PHOTOS) throw new InputError(`A job card can have at most ${MAX_JOBCARD_PHOTOS} photos`);

      let lineNo = 0;
      for (const l of lines) {
        lineNo += 1;
        await run(`INSERT INTO dbo.[JobCardItemLns] ([JobCardItemLnId],[JobCardId],[LineNo],[ItemType],[SpareId],[LabourMasterId],[SerialNo],[Qty],[Rate],[Amount],[GstPct],[GstAmount],[IsWarranty],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (NEWID(),@jobCardId,@lineNo,@type,@spareId,@labourId,@serial,@qty,@rate,@amount,@gstPct,@gstAmount,@warranty,@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
          { jobCardId, lineNo, type: l.ItemType, spareId: l.SpareId, labourId: l.LabourMasterId, serial: l.SerialNo, qty: l.Qty, rate: l.Rate.toFixed(2), amount: l.Amount.toFixed(2), gstPct: l.GstPct.toFixed(2), gstAmount: l.GstAmount.toFixed(2), warranty: l.IsWarranty, remarks: l.Remarks, userId: user.UserId });
      }
      for (const fault of faults) {
        await run(`INSERT INTO dbo.[JobCardFaultLns] ([JobCardFaultLnId],[JobCardId],[FaultMasterId],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (NEWID(),@jobCardId,@faultId,@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
          { jobCardId, faultId: fault.FaultMasterId, remarks: text(fault.Remarks, 250), userId: user.UserId });
      }
      await insertAttachments(run, "JobCards", jobCardId, photos, user.UserId);
      removedVideos = await syncVideos(run, "JobCards", jobCardId!, body.videoIds, user.UserId, MAX_VIDEOS);

      const job = await loadJobCard(run, jobCardId);
      const status = body.submit || wasInApproval ? await submitJobCard(run, job, user.UserId) : job.Status;
      return { jobCard: { ...job, Status: status, CustomerPayable: Math.max(0, Number(job.TotalEstimate) - Math.min(Number(job.WarrantyAmount), Number(job.TotalEstimate))) }, restarted: wasInApproval };
    });

    // Photo files of removed attachments are deleted only after the save committed.
    await removeAttachmentFiles([...removePhotoIds, ...removedVideos]);
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: body.JobCardId ? "UPDATE" : "CREATE", tableName: "JobCards", recordId: result.jobCard.JobCardId, details: { JobCardNo: result.jobCard.JobCardNo, Total: totalEstimate, Lines: lines.length, Photos: photos.length, Status: result.jobCard.Status } });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    await removeSavedPhotos(photos);
    return handleApiError(err, "Failed to save job card");
  }
}
