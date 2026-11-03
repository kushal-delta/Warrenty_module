import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, requireUser } from "@/lib/services/apiHelpers";
import { balanceAt } from "@/lib/services/stock";

/** Deletes a manual stock entry unless that would leave its destination with negative stock. Job-card postings cannot be deleted here. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (user.Role === "ENGINEER") return fail("Engineers cannot delete stock entries", 403);
    const { StockTxnId } = await request.json().catch(() => ({}));
    if (!StockTxnId) return fail("StockTxnId is required");
    const txn = await inTransaction(async (run) => {
      const row = (await run<any>(`SELECT * FROM dbo.[StockTxns] WITH (UPDLOCK) WHERE [StockTxnId] = @id`, { id: StockTxnId }))[0];
      if (!row) throw new InputError("Stock entry not found");
      if (row.JobCardItemLnId) throw new InputError("This entry was posted by a job card approval and cannot be deleted here");
      if (row.ToLocType && row.ToLocId) {
        const after = (await balanceAt(run, row.SpareId, row.ToLocType, row.ToLocId)) - row.Qty;
        if (after < 0) throw new InputError("Deleting this entry would make the destination stock negative (stock already used or moved). Reverse the later movements first.");
      }
      await run(`DELETE FROM dbo.[StockTxns] WHERE [StockTxnId] = @id`, { id: StockTxnId });
      return row;
    });
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "StockTxns", recordId: StockTxnId, details: { TxnType: txn.TxnType, Qty: txn.Qty } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete stock entry");
  }
}
