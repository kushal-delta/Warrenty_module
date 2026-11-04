import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { erpRun, ledgerInfo } from "@/lib/services/erpLedgers";

/** Service centres with engineer / open-call counts and their iERP ledger (code + group). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const [centers, ledgers] = await Promise.all([
      runQuery(`SELECT sc.*, s.[StateName],
          (SELECT COUNT(*) FROM dbo.[Users] u WHERE u.[Role] = 'ENGINEER' AND u.[ServiceCenterId] = sc.[ServiceCenterId]) AS [Engineers],
          (SELECT COUNT(*) FROM dbo.[Complaints] c WHERE c.[ServiceCenterId] = sc.[ServiceCenterId] AND c.[Status] NOT IN ('Closed','Resolved','Cancelled')) AS [OpenCalls]
        FROM dbo.[ServiceCenters] sc LEFT JOIN dbo.[States] s ON sc.[StateId] = s.[StateId] ORDER BY sc.[ServiceCenterName]`),
      ledgerInfo(runQuery, erpRun, "center"),
    ]);
    const rows = centers.map((c: any) => {
      const ledger = ledgers.get(String(c.ServiceCenterId).toLowerCase());
      return { ...c, LgrId: ledger?.LgrId || null, LedgerCode: ledger?.Code || null, LedgerGroup: ledger?.GroupName || null };
    });
    return NextResponse.json({ success: true, centers: rows });
  } catch (err) {
    return handleApiError(err, "Failed to load service centers");
  }
}
