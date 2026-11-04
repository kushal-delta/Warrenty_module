import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, nextDocNo, requireUser, runQuery, text } from "@/lib/services/apiHelpers";
import { PRIORITIES, REQUEST_TYPES, fixedCenter, loadRequest, requestScope, resolveItems } from "@/lib/services/materialRequests";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Creates / updates a material request: header (type, centre, request date, required by, priority, remarks)
 * and its item lines. Items are re-checked against the iERP / Spares master and their code, name and unit copied
 * onto the line. Only a Pending request can be edited. Number: MR/26-27/0001.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const id = (body.MaterialRequestId as string | undefined) || null;
    const v = {
      RequestType: body.RequestType,
      ServiceCenterId: fixedCenter(user) || body.ServiceCenterId || null,
      RequestDate: String(body.RequestDate || ""),
      RequiredBy: body.RequiredBy ? String(body.RequiredBy) : null,
      Priority: body.Priority || "Normal",
      Remarks: text(body.Remarks, 500),
    };
    if (!REQUEST_TYPES.includes(v.RequestType)) throw new InputError("Select the request type");
    if (!v.ServiceCenterId) throw new InputError("Select the service center");
    if (!DATE.test(v.RequestDate)) throw new InputError("Request date is required");
    if (v.RequiredBy && !DATE.test(v.RequiredBy)) throw new InputError("Required by date is invalid");
    if (v.RequiredBy && v.RequiredBy < v.RequestDate) throw new InputError("Required by cannot be before the request date");
    if (!PRIORITIES.includes(v.Priority)) throw new InputError("Select the priority");

    const rawLines: any[] = Array.isArray(body.lines) ? body.lines : [];
    const filled = rawLines.filter((l) => l && l.ItemKey);
    if (!filled.length) throw new InputError("Add at least one item");
    const items = await resolveItems(user, v.RequestType, filled.map((l) => String(l.ItemKey)));
    const seen = new Set<string>();
    const lines = filled.map((l, index) => {
      const item = items.get(String(l.ItemKey).toLowerCase());
      if (!item) throw new InputError(`Line ${index + 1}: item is not available for ${v.RequestType === "Product" ? "product items" : "spare parts"}`);
      if (seen.has(item.key.toLowerCase())) throw new InputError(`Line ${index + 1}: ${item.name} is already on the request`);
      seen.add(item.key.toLowerCase());
      const qty = Number(l.Qty);
      if (!(qty > 0)) throw new InputError(`Line ${index + 1}: enter a quantity for ${item.name}`);
      return { item, qty: Math.round(qty * 1000) / 1000, remarks: text(l.Remarks, 250) };
    });

    const values: Record<string, unknown> = {};
    const scope = requestScope(user, "r", values);
    const saved = await inTransaction(async (run) => {
      if (!(await run(`SELECT TOP 1 1 AS [x] FROM dbo.[ServiceCenters] WHERE [ServiceCenterId] = @id`, { id: v.ServiceCenterId })).length) throw new InputError("Selected service center was not found");
      let requestId = id, requestNo: string;
      if (id) {
        const current = await loadRequest(run, id, true);
        if (!current) throw new InputError("Material request not found");
        if (scope && !(await run(`SELECT TOP 1 1 AS [ok] FROM dbo.[MaterialRequests] r WHERE r.[MaterialRequestId] = @id AND ${scope}`, { ...values, id })).length) throw new InputError(OUT_OF_SCOPE);
        if (current.Status !== "Pending") throw new InputError(`A request that is ${String(current.Status).toLowerCase()} cannot be edited`);
        requestNo = current.RequestNo;
        await run(`UPDATE dbo.[MaterialRequests] SET [RequestType] = @RequestType, [ServiceCenterId] = @ServiceCenterId, [RequestDate] = @RequestDate, [RequiredBy] = @RequiredBy, [Priority] = @Priority, [Remarks] = @Remarks,
          [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [MaterialRequestId] = @id`, { ...v, userId: user.UserId, id });
        await run(`DELETE FROM dbo.[MaterialRequestItemLns] WHERE [MaterialRequestId] = @id`, { id });
      } else {
        requestId = randomUUID();
        requestNo = await nextDocNo(run, "MATREQ", "MR", user.UserId);
        await run(`INSERT INTO dbo.[MaterialRequests] ([MaterialRequestId], [RequestNo], [RequestType], [ServiceCenterId], [RequestDate], [RequiredBy], [Priority], [Status], [Remarks], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          VALUES (@id, @no, @RequestType, @ServiceCenterId, @RequestDate, @RequiredBy, @Priority, 'Pending', @Remarks, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, { ...v, id: requestId, no: requestNo, userId: user.UserId });
      }
      for (let index = 0; index < lines.length; index++) {
        const l = lines[index];
        await run(`INSERT INTO dbo.[MaterialRequestItemLns] ([MaterialRequestItemLnId], [MaterialRequestId], [LineNo], [ItemSource], [ErpItmId], [SpareId], [ItemCode], [ItemName], [Uom], [Qty], [Remarks], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          VALUES (NEWID(), @requestId, @lineNo, @source, @erpId, @spareId, @code, @name, @uom, @qty, @remarks, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, {
          requestId, lineNo: index + 1, source: l.item.source, erpId: l.item.source === "ERP" ? l.item.id : null, spareId: l.item.source === "LOCAL" ? l.item.id : null,
          code: l.item.code?.slice(0, 60) || null, name: l.item.name.slice(0, 250), uom: l.item.uom, qty: l.qty, remarks: l.remarks, userId: user.UserId,
        });
      }
      return { requestId: requestId!, requestNo };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: id ? "UPDATE" : "CREATE", tableName: "MaterialRequests", recordId: saved.requestId, details: { RequestNo: saved.requestNo, Type: v.RequestType, ServiceCenterId: v.ServiceCenterId, Priority: v.Priority, Lines: lines.length } });
    return NextResponse.json({ success: true, request: await loadRequest(runQuery, saved.requestId) });
  } catch (err) {
    return handleApiError(err, "Failed to save material request");
  }
}
