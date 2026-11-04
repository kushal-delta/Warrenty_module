import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { getScope, namedParams, warrantyFilter } from "@/lib/auth/scope";

/**
 * Serial suggestions for the Replacement Flow form.
 *  kind "old": serials in warranty that the user may replace (dealers: own sales only)
 *  kind "new": free stickers (Generated / Printed), optionally of one component category
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { kind = "old", q = "", category } = await request.json().catch(() => ({}));
    const term = String(q).trim().slice(0, 40);
    const values: Record<string, unknown> = { like: `%${term.replace(/[\[%_]/g, (c) => `[${c}]`)}%`, category: category || null };
    if (kind === "new") {
      const rows = await runQuery(
        `SELECT TOP 30 s.[SerialNo], s.[Category], p.[ModelName] FROM dbo.[Stickers] s LEFT JOIN dbo.[ProductModels] p ON s.[ProductModelId] = p.[ProductModelId]
         WHERE s.[Status] IN ('Generated','Printed') AND (@category IS NULL OR s.[Category] = @category) AND (@like = '%%' OR s.[SerialNo] LIKE @like) ORDER BY s.[SerialNo]`, values);
      return NextResponse.json({ success: true, serials: rows });
    }
    const scope = await getScope(user);
    const filter = warrantyFilter(scope, "w", namedParams(values));
    const rows = await runQuery(
      `SELECT TOP 30 w.[SerialNo], w.[Category], p.[ModelName], cu.[CustomerName], w.[EndDate]
       FROM dbo.[Warranties] w LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId] LEFT JOIN dbo.[Customers] cu ON w.[CustomerId] = cu.[CustomerId]
       WHERE w.[Status] = 'Active' AND w.[EndDate] >= SYSUTCDATETIME() AND (@like = '%%' OR w.[SerialNo] LIKE @like OR cu.[CustomerName] LIKE @like)${filter ? ` AND ${filter}` : ""}
       ORDER BY w.[SerialNo]`, values);
    return NextResponse.json({ success: true, serials: rows });
  } catch (err) {
    return handleApiError(err, "Could not load serial suggestions");
  }
}
