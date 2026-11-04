import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { erpRun, ledgerInfo } from "@/lib/services/erpLedgers";

/** Field engineers (users with role ENGINEER) with their centre, open calls and iERP ledger. Passwords are never returned. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const [engineers, ledgers] = await Promise.all([
      runQuery(`SELECT u.[UserId], u.[Username], u.[FirstName], u.[LastName], u.[Email], u.[Phone], u.[Address], u.[StateRights], u.[ServiceCenterId], u.[IsActive], u.[LastLogin], u.[InsertedOn],
          sc.[ServiceCenterName], sc.[ServiceCenterCode],
          (SELECT COUNT(*) FROM dbo.[Complaints] c WHERE c.[EngineerUserId] = u.[UserId] AND c.[Status] NOT IN ('Closed','Resolved','Cancelled')) AS [OpenCalls]
        FROM dbo.[Users] u LEFT JOIN dbo.[ServiceCenters] sc ON u.[ServiceCenterId] = sc.[ServiceCenterId]
        WHERE u.[Role] = 'ENGINEER' ORDER BY u.[FirstName], u.[LastName]`),
      ledgerInfo(runQuery, erpRun, "engineer"),
    ]);
    const rows = engineers.map((e: any) => {
      const ledger = ledgers.get(String(e.UserId).toLowerCase());
      return { ...e, LgrId: ledger?.LgrId || null, LedgerCode: ledger?.Code || null, LedgerGroup: ledger?.GroupName || null };
    });
    return NextResponse.json({ success: true, engineers: rows });
  } catch (err) {
    return handleApiError(err, "Failed to load service engineers");
  }
}
