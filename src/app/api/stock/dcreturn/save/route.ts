import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, nextDocNo, requireUser, text } from "@/lib/services/apiHelpers";
import { challanScope, loadChallan } from "@/lib/services/challans";
import { returnLines } from "@/lib/services/challanReturns";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Saves a defective / fresh receipt (DRN/26-27/0001) against a returnable delivery challan:
 * per challan line the quantity back as fresh and as defective (with the defective part's serial).
 * Fresh + defective cannot exceed what is still pending on the line; at least one unit must come back.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const challanId = body.DeliveryChallanId as string | undefined;
    const returnDate = String(body.ReturnDate || "");
    const receivedThrough = text(body.ReceivedThrough, 80);
    const remarks = text(body.Remarks, 500);
    if (!challanId) throw new InputError("Select the returnable delivery challan");
    if (!DATE.test(returnDate)) throw new InputError("Receipt date is required");
    if (returnDate > new Date().toISOString().slice(0, 10)) throw new InputError("Receipt date cannot be in the future");
    const incoming = new Map<string, { fresh: number; defective: number; serial: string | null; remarks: string | null }>();
    (Array.isArray(body.lines) ? body.lines : []).forEach((l: any) => {
      if (l?.DeliveryChallanItemLnId) incoming.set(String(l.DeliveryChallanItemLnId).toLowerCase(), {
        fresh: round3(Number(l.QtyFresh || 0)), defective: round3(Number(l.QtyDefective || 0)), serial: text(l.DefectSerial, 60), remarks: text(l.Remarks, 250),
      });
    });

    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const saved = await inTransaction(async (run) => {
      const challan = await loadChallan(run, challanId, true);
      if (!challan) throw new InputError("Delivery challan not found");
      if (scope && !(await run(`SELECT TOP 1 1 AS [ok] FROM dbo.[DeliveryChallans] d WHERE d.[DeliveryChallanId] = @id AND ${scope}`, { ...values, id: challanId })).length) throw new InputError(OUT_OF_SCOPE);
      if (challan.ChallanType !== "Returnable") throw new InputError("Only a returnable delivery challan can be received back");
      if (challan.Status === "Cancelled") throw new InputError("This challan is cancelled");
      const challanDate = String(challan.ChallanDate instanceof Date ? challan.ChallanDate.toISOString() : challan.ChallanDate).slice(0, 10);
      if (returnDate < challanDate) throw new InputError("Receipt date cannot be before the challan date");

      const toSave = (await returnLines(run, challanId)).map((l) => {
        const got = incoming.get(String(l.DeliveryChallanItemLnId).toLowerCase()) || { fresh: 0, defective: 0, serial: null, remarks: null };
        if (got.fresh < 0 || got.defective < 0) throw new InputError(`${l.ItemName}: quantities cannot be negative`);
        if (round3(got.fresh + got.defective) > l.Pending) throw new InputError(`${l.ItemName}: only ${l.Pending} is pending — fresh + defective cannot be ${round3(got.fresh + got.defective)}`);
        if (got.serial && !got.defective) throw new InputError(`${l.ItemName}: a defect serial needs a defective quantity`);
        return { line: l, ...got };
      }).filter((x) => x.fresh > 0 || x.defective > 0);
      if (!toSave.length) throw new InputError("Enter a fresh or defective quantity for at least one item");

      const returnId = randomUUID();
      const returnNo = await nextDocNo(run, "DCRETURN", "DRN", user.UserId);
      await run(`INSERT INTO dbo.[ChallanReturns] ([ChallanReturnId], [ReturnNo], [ReturnDate], [DeliveryChallanId], [ReceivedThrough], [Remarks], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
        VALUES (@id, @no, @date, @challanId, @through, @remarks, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        { id: returnId, no: returnNo, date: returnDate, challanId, through: receivedThrough, remarks, userId: user.UserId });
      for (const x of toSave) {
        await run(`INSERT INTO dbo.[ChallanReturnItemLns] ([ChallanReturnItemLnId], [ChallanReturnId], [DeliveryChallanItemLnId], [QtyFresh], [QtyDefective], [DefectSerial], [Remarks], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          VALUES (NEWID(), @returnId, @lineId, @fresh, @defective, @serial, @remarks, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`,
          { returnId, lineId: x.line.DeliveryChallanItemLnId, fresh: x.fresh, defective: x.defective, serial: x.serial, remarks: x.remarks, userId: user.UserId });
      }
      return { returnId, returnNo, challanNo: challan.ChallanNo, fresh: toSave.reduce((s, x) => s + x.fresh, 0), defective: toSave.reduce((s, x) => s + x.defective, 0) };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "CREATE", tableName: "ChallanReturns", recordId: saved.returnId, details: { ReturnNo: saved.returnNo, ChallanNo: saved.challanNo, Fresh: saved.fresh, Defective: saved.defective } });
    return NextResponse.json({ success: true, receipt: saved });
  } catch (err) {
    return handleApiError(err, "Failed to save the defective / fresh receipt");
  }
}
