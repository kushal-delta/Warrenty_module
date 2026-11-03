import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";

export async function POST(request: NextRequest) {
  try {
    if (!await requireUser(request)) return fail("Unauthorized", 401);
    const { ReplacementId } = await request.json().catch(() => ({}));
    if (!ReplacementId) return fail("ReplacementId is required");
    const replacement = (await query(`SELECT r.*, d.[FirmName] AS [DealerName], c.[ComplaintNo], c.[CustomerName] FROM dbo.[Replacements] r LEFT JOIN dbo.[Dealers] d ON r.[DealerId] = d.[DealerId] LEFT JOIN dbo.[Complaints] c ON r.[ComplaintId] = c.[ComplaintId] WHERE r.[ReplacementId] = @p0`, [ReplacementId]))[0];
    if (!replacement) return fail("Replacement not found", 404);
    const lines = await query(`SELECT * FROM dbo.[ReplacementItemLns] WHERE [ReplacementId] = @p0 ORDER BY [LineNo]`, [ReplacementId]);
    return NextResponse.json({ success: true, replacement, lines });
  } catch (err) {
    return handleApiError(err, "Failed to load replacement");
  }
}
