import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, nextDocNo, requireUser, text } from "@/lib/services/apiHelpers";
import { challanScope, loadChallan } from "@/lib/services/challans";
import { challanLines } from "@/lib/services/challanReceipts";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Saves a goods receipt (GRN/26-27/0001) against a delivery challan: received quantity and remarks per challan line.
 * A line cannot receive more than is still pending; at least one line must receive something.
 * The challan's own status is not changed — received / pending quantities are read from the receipts.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const challanId = body.DeliveryChallanId as string | undefined;
    const receiptDate = String(body.ReceiptDate || "");
    const remarks = text(body.Remarks, 500);
    if (!challanId) throw new InputError("Select the delivery challan");
    if (!DATE.test(receiptDate)) throw new InputError("GRN date is required");
    const today = new Date().toISOString().slice(0, 10);
    if (receiptDate > today) throw new InputError("GRN date cannot be in the future");
    const incoming = new Map<string, { qty: number; remarks: string | null }>();
    (Array.isArray(body.lines) ? body.lines : []).forEach((l: any) => {
      if (l?.DeliveryChallanItemLnId) incoming.set(String(l.DeliveryChallanItemLnId).toLowerCase(), { qty: Math.round(Number(l.QtyReceived || 0) * 1000) / 1000, remarks: text(l.Remarks, 250) });
    });

    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const saved = await inTransaction(async (run) => {
      const challan = await loadChallan(run, challanId, true);
      if (!challan) throw new InputError("Delivery challan not found");
      if (scope && !(await run(`SELECT TOP 1 1 AS [ok] FROM dbo.[DeliveryChallans] d WHERE d.[DeliveryChallanId] = @id AND ${scope}`, { ...values, id: challanId })).length) throw new InputError(OUT_OF_SCOPE);
      if (challan.Status === "Cancelled") throw new InputError("This challan is cancelled");
      if (receiptDate < String(challan.ChallanDate instanceof Date ? challan.ChallanDate.toISOString() : challan.ChallanDate).slice(0, 10)) throw new InputError("GRN date cannot be before the challan date");

      const lines = await challanLines(run, challanId);
      const toSave = lines.map((l) => {
        const got = incoming.get(String(l.DeliveryChallanItemLnId).toLowerCase()) || { qty: 0, remarks: null };
        if (!(got.qty >= 0)) throw new InputError(`${l.ItemName}: received quantity cannot be negative`);
        if (got.qty > l.Pending) throw new InputError(`${l.ItemName}: only ${l.Pending} is pending — cannot receive ${got.qty}`);
        return { line: l, ...got };
      }).filter((x) => x.qty > 0 || x.remarks);
      if (!toSave.some((x) => x.qty > 0)) throw new InputError("Enter the received quantity for at least one item");

      const receiptId = randomUUID();
      const receiptNo = await nextDocNo(run, "CHGRN", "GRN", user.UserId);
      await run(`INSERT INTO dbo.[ChallanReceipts] ([ChallanReceiptId], [ReceiptNo], [ReceiptDate], [DeliveryChallanId], [WarehouseId], [Remarks], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
        VALUES (@id, @no, @date, @challanId, @warehouseId, @remarks, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        { id: receiptId, no: receiptNo, date: receiptDate, challanId, warehouseId: challan.WarehouseId || null, remarks, userId: user.UserId });
      for (const x of toSave) {
        await run(`INSERT INTO dbo.[ChallanReceiptItemLns] ([ChallanReceiptItemLnId], [ChallanReceiptId], [DeliveryChallanItemLnId], [QtyReceived], [Remarks], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          VALUES (NEWID(), @receiptId, @lineId, @qty, @remarks, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`,
          { receiptId, lineId: x.line.DeliveryChallanItemLnId, qty: x.qty, remarks: x.remarks, userId: user.UserId });
      }
      return { receiptId, receiptNo, challanNo: challan.ChallanNo, qty: toSave.reduce((s, x) => s + x.qty, 0) };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "CREATE", tableName: "ChallanReceipts", recordId: saved.receiptId, details: { ReceiptNo: saved.receiptNo, ChallanNo: saved.challanNo, QtyReceived: saved.qty } });
    return NextResponse.json({ success: true, receipt: saved });
  } catch (err) {
    return handleApiError(err, "Failed to save goods receipt");
  }
}
