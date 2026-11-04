import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { runQuery } from "@/lib/services/apiHelpers";
import { hasUserLedger, inErpAndWarranty, releaseUserLedger } from "@/lib/services/erpLedgers";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser?.IsAdmin) {
      return NextResponse.json({ error: "Unauthorized. Admin access required." }, { status: 403 });
    }

    const body = await request.json();
    const { UserId } = body;

    if (!UserId) {
      return NextResponse.json({ error: "UserId is required" }, { status: 400 });
    }

    // Prevent self-deletion
    if (UserId === sessionUser.UserId) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
    }

    // An engineer's iERP ledger is disabled (not deleted — vouchers may use it) and unlinked with the user.
    const deleted = (await hasUserLedger(runQuery, UserId))
      ? await inErpAndWarranty(async (run, erp) => { await releaseUserLedger(run, erp, UserId); return run<any>(`DELETE FROM dbo.[Users] OUTPUT DELETED.[UserId], DELETED.[Username] WHERE [UserId] = @id`, { id: UserId }); })
      : await query<any>(`DELETE FROM dbo.[Users] OUTPUT DELETED.[UserId], DELETED.[Username] WHERE [UserId] = @p0`, [UserId]);

    if (deleted.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: sessionUser.UserId,
      userName: sessionUser.Username,
      action: "DELETE",
      tableName: "Users",
      recordId: UserId,
      details: { deletedUsername: deleted[0].Username },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete user" }, { status: 500 });
  }
}
