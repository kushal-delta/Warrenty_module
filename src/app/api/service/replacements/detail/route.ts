import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE, getScope, positionalParams, replacementFilter } from "@/lib/auth/scope";

/** One replacement with its lines and attached PDF documents. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { ReplacementId } = await request.json().catch(() => ({}));
    if (!ReplacementId) return fail("ReplacementId is required");
    const params: unknown[] = [ReplacementId];
    const scopeFilter = replacementFilter(await getScope(user), "r", positionalParams(params));
    const replacement = (await query(`SELECT r.*, d.[FirmName] AS [DealerName], c.[ComplaintNo], c.[CustomerName], CASE WHEN r.[VoucherType] = 'Without Serial No' THEN 1 ELSE 0 END AS [OutOfWarranty] FROM dbo.[Replacements] r LEFT JOIN dbo.[Dealers] d ON r.[DealerId] = d.[DealerId] LEFT JOIN dbo.[Complaints] c ON r.[ComplaintId] = c.[ComplaintId] WHERE r.[ReplacementId] = @p0${scopeFilter ? ` AND ${scopeFilter}` : ""}`, params))[0];
    if (!replacement) return fail(scopeFilter ? OUT_OF_SCOPE : "Replacement not found", scopeFilter ? 403 : 404);
    const [lines, documents] = await Promise.all([
      query(`SELECT * FROM dbo.[ReplacementItemLns] WHERE [ReplacementId] = @p0 ORDER BY [LineNo]`, [ReplacementId]),
      query(`SELECT [AttachmentId], [FileUrl], [FileName], [FileType], [FileSize], [InsertedOn] FROM dbo.[Attachments] WHERE [ParentTable] = 'Replacements' AND [ParentId] = @p0 ORDER BY [InsertedOn]`, [ReplacementId]),
    ]);
    return NextResponse.json({ success: true, replacement, lines, documents });
  } catch (err) {
    return handleApiError(err, "Failed to load replacement");
  }
}
