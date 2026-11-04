import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";
import { getScope, positionalParams, replacementFilter } from "@/lib/auth/scope";

/** Lists replacements with their serial swaps and net value. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { status, source } = await request.json().catch(() => ({}));
    const where: string[] = [], params: unknown[] = [];
    const scopeFilter = replacementFilter(await getScope(user), "r", positionalParams(params));
    if (scopeFilter) where.push(scopeFilter);
    if (status) { where.push(`r.[Status] = @p${params.length}`); params.push(status); }
    if (source) { where.push(`r.[Source] = @p${params.length}`); params.push(source); }
    const replacements = await query(
      `SELECT r.*, d.[FirmName] AS [DealerName], c.[ComplaintNo], c.[CustomerName],
        CASE WHEN r.[VoucherType] = 'Without Serial No' THEN 1 ELSE 0 END AS [OutOfWarranty],
        (SELECT COUNT(*) FROM dbo.[Attachments] a WHERE a.[ParentTable] = 'Replacements' AND a.[ParentId] = r.[ReplacementId]) AS [DocumentCount],
        COALESCE((SELECT SUM(i.[NetValue]) FROM dbo.[ReplacementItemLns] i WHERE i.[ReplacementId] = r.[ReplacementId]), 0) AS [NetValue],
        COALESCE((SELECT SUM(i.[Charges]) FROM dbo.[ReplacementItemLns] i WHERE i.[ReplacementId] = r.[ReplacementId]), 0) AS [Charges],
        STUFF((SELECT ', ' + CONCAT(COALESCE(i.[OldSerialNo], '—'), ' → ', COALESCE(i.[NewSerialNo], '—')) FROM dbo.[ReplacementItemLns] i WHERE i.[ReplacementId] = r.[ReplacementId] ORDER BY i.[LineNo] FOR XML PATH('')), 1, 2, '') AS [SerialSwaps]
       FROM dbo.[Replacements] r LEFT JOIN dbo.[Dealers] d ON r.[DealerId] = d.[DealerId] LEFT JOIN dbo.[Complaints] c ON r.[ComplaintId] = c.[ComplaintId]
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.[ReplDate] DESC, r.[InsertedOn] DESC`,
      params
    );
    return NextResponse.json({ success: true, replacements });
  } catch (err) {
    return handleApiError(err, "Failed to fetch replacements");
  }
}
