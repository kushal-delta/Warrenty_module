import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { getScope, namedParams, replacementFilter } from "@/lib/auth/scope";

/** Replacements done through the in-warranty flow (dealer source), newest first, limited to the user's rights. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const values: Record<string, unknown> = {};
    const filter = replacementFilter(await getScope(user), "r", namedParams(values));
    const replacements = await runQuery(
      `SELECT TOP 500 r.[ReplacementId], r.[ReplNo], r.[ReplDate], r.[Reason], r.[Status], d.[FirmName] AS [DealerName],
        i.[Category], i.[OldSerialNo], i.[NewSerialNo], i.[WarrantyDaysLeft], ow.[CustomerName]
       FROM dbo.[Replacements] r
       CROSS APPLY (SELECT TOP 1 * FROM dbo.[ReplacementItemLns] x WHERE x.[ReplacementId] = r.[ReplacementId] ORDER BY x.[LineNo]) i
       LEFT JOIN dbo.[Dealers] d ON r.[DealerId] = d.[DealerId]
       OUTER APPLY (SELECT TOP 1 cu.[CustomerName] FROM dbo.[Warranties] w JOIN dbo.[Customers] cu ON w.[CustomerId] = cu.[CustomerId] WHERE w.[SerialNo] = i.[OldSerialNo] ORDER BY w.[StartDate] DESC) ow
       WHERE r.[Source] = 'Dealer'${filter ? ` AND ${filter}` : ""} ORDER BY r.[ReplDate] DESC, r.[InsertedOn] DESC`, values);
    return NextResponse.json({ success: true, replacements });
  } catch (err) {
    return handleApiError(err, "Failed to fetch replacements");
  }
}
