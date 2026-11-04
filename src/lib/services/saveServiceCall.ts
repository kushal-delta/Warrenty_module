import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { OUT_OF_SCOPE, getScope, inGeoScope, callVisible } from "@/lib/auth/scope";
import { InputError, dateValue, endOfToday, fail, handleApiError, inTransaction, text } from "@/lib/services/apiHelpers";
import { nextComplaintNo, overallWarranty, serialWarranty, type SerialState } from "@/lib/services/complaints";
import { insertAttachments, removeAttachmentFiles, removeSavedPhotos, savePhotos, syncVideos, type SavedPhoto } from "@/lib/services/attachments";
import { MAX_VIDEOS } from "@/lib/config/service";
import { CALL_PRIORITIES, CALL_SOURCES, PRODUCT_CATEGORIES } from "@/lib/config/service";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Books a service call (same fields as the prototype "New service call" form):
 *  1 call details  — callDate, callTypeId, priority, source, projectId, dealerId
 *  2 customer/site — mobile, customerName, village, address, stateId, district, pincode (existing customer found by mobile)
 *  3 components    — [{ category, serialNo, fault }] (each serial is checked against the sticker register / warranty)
 *  4 complaint     — complaintText, photos [{ fileName, dataUrl }], videoIds (videos uploaded via /api/attachments/upload; on edit, every video to keep)
 *  5 assignment    — serviceCenterId, engineerUserId (staff only)
 * Due date = call date + the call type's valid days. Warranty status is worked out from the component serials.
 */

export async function saveServiceCall(request: NextRequest, editing: boolean) {
  let photos: SavedPhoto[] = [];
  try {
    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser) return fail("Unauthorized", 401);
    const body = await request.json();
    const scope = await getScope(sessionUser);
    if (editing && (scope.portal || !body.ComplaintId || !await callVisible(scope, body.ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    if (scope.portal && !(scope.dealerId || scope.customerId)) return fail("Your login is not linked to a dealer / customer record. Ask the administrator to link it in User Management.", 403);

    // ---- 1 · call details
    const callDate = dateValue(body.callDate, "Call date") || new Date();
    if (callDate > endOfToday()) throw new InputError("Call date cannot be in the future");
    if (!body.callTypeId) throw new InputError("Select the call type");
    const priority = text(body.priority) || "Medium";
    if (!CALL_PRIORITIES.includes(priority)) throw new InputError("Priority is invalid");
    const source = text(body.source, 30) || (scope.portal === "DEALER" ? "Dealer" : scope.portal === "CUSTOMER" ? "Customer" : "Toll Free");
    if (!scope.portal && !CALL_SOURCES.includes(source) && source !== "Customer Portal") throw new InputError("Call source is invalid");

    // ---- 2 · customer & site
    const mobile = String((scope.portal === "CUSTOMER" ? scope.customerMobile : body.mobile) || "").trim();
    if (!/^[6-9]\d{9}$/.test(mobile)) throw new InputError("Enter a valid 10-digit mobile number");
    const customerName = text(body.customerName, 120);
    if (!customerName) throw new InputError("Customer name is required");
    if (!body.stateId) throw new InputError("Select the state");
    const pincode = text(body.pincode, 12);
    if (pincode && !/^\d{6}$/.test(pincode)) throw new InputError("Pincode must be 6 digits");
    const district = text(body.district, 80);
    if (!inGeoScope(scope, body.stateId, district)) return fail(`${OUT_OF_SCOPE}. Choose a state and district you have rights to.`, 403);

    // ---- 4 · complaint
    const complaintText = text(body.complaintText);
    if (!complaintText || complaintText.length < 3) throw new InputError("Describe the problem reported");

    // ---- 3 · components (old clients may send none — then the call is booked without component lines)
    const rawLines = (Array.isArray(body.components) ? body.components : [])
      .map((l: any) => ({ category: String(l?.category || "PUMP").toUpperCase(), serialNo: String(l?.serialNo || "").trim().toUpperCase(), fault: text(l?.fault, 250) }))
      .filter((l: any) => l.serialNo || l.fault);
    if (Array.isArray(body.components) && body.components.length && !rawLines.length) throw new InputError("Add at least one faulty component (serial no or fault)");

    photos = await savePhotos(body.photos);

    let removedVideos: string[] = [];
    const complaint = await inTransaction(async (run) => {
      const previous = editing ? (await run<any>(`SELECT * FROM dbo.Complaints WITH (UPDLOCK) WHERE ComplaintId=@id`, { id: body.ComplaintId }))[0] : null;
      if (editing && !previous) throw new InputError("Service call not found");
      const callType = (await run<any>(`SELECT [CallTypeId], [ValidDays] FROM dbo.[CallTypes] WHERE [CallTypeId] = @id`, { id: body.callTypeId }))[0];
      if (!callType) throw new InputError("Selected call type was not found");

      const lines: { category: string; serialNo: string | null; fault: string | null; productModelId: string | null; state: SerialState | null; w: any }[] = [];
      for (let i = 0; i < rawLines.length; i++) {
        const l = rawLines[i];
        if (!PRODUCT_CATEGORIES.includes(l.category)) throw new InputError(`Component ${i + 1}: choose Pump, Motor or Controller`);
        if (!l.serialNo) { lines.push({ category: l.category, serialNo: null, fault: l.fault, productModelId: null, state: null, w: null }); continue; }
        const w = await serialWarranty(run, l.serialNo);
        if (w.State === "unk") throw new InputError(`Serial ${l.serialNo} is not in the sticker register — correct it or clear it`);
        lines.push({ category: w.Category || l.category, serialNo: w.SerialNo, fault: l.fault, productModelId: w.ProductModelId, state: w.State, w });
      }
      const firstRegistered = lines.find((l) => l.w?.WarrantyId)?.w;

      // Portal logins book only on their own products.
      if (scope.portal && firstRegistered) {
        const mine = scope.portal === "DEALER" ? String(firstRegistered.DealerId || "").toLowerCase() === String(scope.dealerId).toLowerCase()
          : String(firstRegistered.CustomerId || "").toLowerCase() === String(scope.customerId).toLowerCase();
        if (!mine) throw new InputError(`Serial ${firstRegistered.SerialNo} is not one of your products`);
      }
      const installationId = body.installationId || firstRegistered?.InstallationId || null;
      if (scope.portal && body.installationId) {
        const own = await run(`SELECT TOP 1 1 AS [ok] FROM dbo.[Installations] WHERE [InstallationId] = @id AND ([DealerId] = @d OR [CustomerId] = @c)`, { id: body.installationId, d: scope.dealerId, c: scope.customerId });
        if (!own.length) throw new InputError(OUT_OF_SCOPE);
      }

      const existingCustomer = (await run<any>(`SELECT TOP 1 [CustomerId] FROM dbo.[Customers] WHERE [Mobile] = @m`, { m: mobile }))[0];
      const customerId = scope.portal === "CUSTOMER" ? scope.customerId : body.customerId || existingCustomer?.CustomerId || firstRegistered?.CustomerId || null;
      const dealerId = scope.portal === "DEALER" ? scope.dealerId : body.dealerId || firstRegistered?.DealerId || null;
      const engineerUserId = scope.portal ? null : body.engineerUserId || null;
      const serviceCenterId = body.serviceCenterId || (engineerUserId ? (await run<any>(`SELECT [ServiceCenterId] FROM dbo.[Users] WHERE [UserId] = @id`, { id: engineerUserId }))[0]?.ServiceCenterId : null) || null;
      const states = lines.filter((l) => l.state).map((l) => l.state as SerialState);
      const warrantyStatus = states.length ? overallWarranty(states) : text(body.warrantyStatus, 30) || "Not Registered";
      const dueDate = body.dueDate ? dateValue(body.dueDate, "Due date") : new Date(callDate.getTime() + Number(callType.ValidDays || 3) * DAY);
      const complaintNo = previous?.ComplaintNo || await nextComplaintNo(run, sessionUser.UserId);
      const editFields = ["CallDate", "CallTypeId", "ProjectId", "Priority", "Source", "Status", "InstallationId", "CustomerId", "CustomerName", "Mobile", "Address", "Village", "District", "StateId", "Pincode", "DealerId", "WarrantyStatus", "ComplaintText", "ServiceCenterId", "EngineerUserId", "AssignedOn", "DueDate"];

      const row = (await run<any>(
        editing ? `UPDATE dbo.Complaints SET ${editFields.map(f => `[${f}]=@${f[0].toLowerCase()+f.slice(1)}`).join(",")}, LastUpdatedOn=SYSUTCDATETIME(), LastUpdatedByUserId=@userId OUTPUT INSERTED.* WHERE ComplaintId=@id` : `INSERT INTO dbo.[Complaints] ([ComplaintId],[ComplaintNo],[CallDate],[CallTypeId],[ProjectId],[Priority],[Source],[Status],[InstallationId],[CustomerId],[CustomerName],[Mobile],[Address],[Village],[District],[StateId],[Pincode],[DealerId],[WarrantyStatus],[ComplaintText],[ServiceCenterId],[EngineerUserId],[AssignedOn],[DueDate],[CreatedBy],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn])
         OUTPUT INSERTED.* VALUES (@id,@no,@callDate,@callTypeId,@projectId,@priority,@source,@status,@installationId,@customerId,@customerName,@mobile,@address,@village,@district,@stateId,@pincode,@dealerId,@warrantyStatus,@complaintText,@serviceCenterId,@engineerUserId,@assignedOn,@dueDate,@createdBy,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
        {
          id: previous?.ComplaintId || randomUUID(), no: complaintNo, callDate, callTypeId: callType.CallTypeId, projectId: body.projectId || null, priority, source,
          status: previous && !["New", "Assigned"].includes(previous.Status) ? previous.Status : engineerUserId ? "Assigned" : "New", installationId, customerId, customerName, mobile,
          address: text(body.address, 300), village: text(body.village, 100), district, stateId: body.stateId, pincode,
          dealerId, warrantyStatus, complaintText, serviceCenterId, engineerUserId, assignedOn: engineerUserId ? new Date() : null, dueDate,
          createdBy: sessionUser.Username, userId: sessionUser.UserId,
        }
      ))[0];

      if (editing) {
        await run(`DELETE FROM dbo.ComplaintItemLns WHERE ComplaintId=@id`, { id: row.ComplaintId });
        const retained = Array.isArray(body.retainedPhotoIds) ? body.retainedPhotoIds : [];
        const existing = await run<any>(`SELECT AttachmentId FROM dbo.Attachments WHERE ParentTable='Complaints' AND ParentId=@id AND FileType NOT LIKE 'video/%'`, { id: row.ComplaintId });
        if (existing.filter(p => retained.includes(p.AttachmentId)).length + photos.length > 5) throw new InputError("Attach at most 5 photos");
        for (const p of existing) if (!retained.includes(p.AttachmentId)) await run(`DELETE FROM dbo.Attachments WHERE AttachmentId=@id AND ParentId=@parent`, { id: p.AttachmentId, parent: row.ComplaintId });
      }
      for (const l of lines) {
        await run(`INSERT INTO dbo.[ComplaintItemLns] ([ComplaintItemLnId],[ComplaintId],[Category],[SerialNo],[ProductModelId],[ReportedFault],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (NEWID(),@complaintId,@category,@serialNo,@modelId,@fault,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
          { complaintId: row.ComplaintId, category: l.category, serialNo: l.serialNo, modelId: l.productModelId, fault: l.fault, userId: sessionUser.UserId });
      }
      await insertAttachments(run, "Complaints", row.ComplaintId, photos, sessionUser.UserId);
      removedVideos = await syncVideos(run, "Complaints", row.ComplaintId, body.videoIds, sessionUser.UserId, MAX_VIDEOS);
      return { ...row, Components: lines.map((l) => ({ Category: l.category, SerialNo: l.serialNo, ReportedFault: l.fault, Warranty: l.w?.Label || null })), PhotoCount: photos.length };
    });

    await removeAttachmentFiles(removedVideos);
    await saveAuditLog({ userId: sessionUser.UserId, userName: sessionUser.Username, action: editing ? "UPDATE" : "CREATE", tableName: "Complaints", recordId: complaint.ComplaintId, details: { ComplaintNo: complaint.ComplaintNo, Customer: complaint.CustomerName, Status: complaint.Status, Components: complaint.Components.length, Photos: complaint.PhotoCount } });
    return NextResponse.json({ success: true, complaint });
  } catch (err) {
    await removeSavedPhotos(photos);
    return handleApiError(err, "Failed to register complaint");
  }
}
