import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, dateValue, endOfToday, fail, handleApiError, inTransaction, numberValue, requireUser, text } from "@/lib/services/apiHelpers";
import { balanceAt, insertStockTxn, visibleStockLocations } from "@/lib/services/stock";
import { STOCK_TXN_TYPES } from "@/lib/config/service";

/** Records a manual stock movement (opening, receipt, transfer, issue, faulty return, adjustment). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (user.Role === "ENGINEER") return fail("Engineers cannot post stock entries", 403);
    const body = await request.json();
    const rule = STOCK_TXN_TYPES[body.TxnType];
    if (!rule) throw new InputError("Transaction type is invalid");
    if (!body.SpareId) throw new InputError("Spare is required");
    const qty = numberValue(body.Qty, "Quantity", { required: true, integer: true, min: 1 })!;
    const txnDate = dateValue(body.TxnDate, "Transaction date", true)!;
    if (txnDate > endOfToday()) throw new InputError("Transaction date cannot be in the future");

    const from = rule.from ? { type: body.FromLocType, id: body.FromLocId } : null;
    let to = rule.to ? { type: body.ToLocType, id: body.ToLocId } : null;
    if (body.TxnType === "Return-Damaged" && to) to = { type: "DAMAGED", id: body.ToLocId };
    for (const [side, loc] of [["Source", from], ["Destination", to]] as const) {
      if (loc && (!["SC", "ENG", "DAMAGED"].includes(loc.type) || !loc.id)) throw new InputError(`${side} location is required`);
    }
    if (from && to && from.type === to.type && from.id === to.id) throw new InputError("Source and destination must be different");

    const visible = await visibleStockLocations(user);
    if (visible && [from?.id, to?.id].some((id) => id && !visible.includes(id))) return fail("You can only post stock for your own service centre and its engineers", 403);

    const txn = await inTransaction(async (run) => {
      const spare = (await run<any>(`SELECT [SpareName], [CurrentRate] FROM dbo.[Spares] WHERE [SpareId] = @id`, { id: body.SpareId }))[0];
      if (!spare) throw new InputError("Selected spare was not found");
      const rate = numberValue(body.Rate, "Rate") ?? Number(spare.CurrentRate || 0);
      if (from) {
        const available = await balanceAt(run, body.SpareId, from.type, from.id);
        if (available < qty) throw new InputError(`Only ${available} ${spare.SpareName} available at the source location`);
      }
      return insertStockTxn(run, { TxnDate: txnDate, TxnType: body.TxnType, SpareId: body.SpareId, Qty: qty, Rate: rate, FromLocType: from?.type, FromLocId: from?.id, ToLocType: to?.type, ToLocId: to?.id, Remarks: text(body.Remarks, 300) }, user.UserId);
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "CREATE", tableName: "StockTxns", recordId: txn.StockTxnId, details: { TxnType: txn.TxnType, Qty: txn.Qty } });
    return NextResponse.json({ success: true, txn });
  } catch (err) {
    return handleApiError(err, "Failed to save stock entry");
  }
}
