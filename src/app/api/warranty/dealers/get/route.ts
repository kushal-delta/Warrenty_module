import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { geoFilter, getScope, positionalParams } from "@/lib/auth/scope";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { status, stateId, search } = body;

    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const scope = await getScope(sessionUser);
    const where: string[] = [], params: unknown[] = [];
    const scopeFilter = geoFilter(scope, { state: "d.[StateId]", district: "d.[District]", dealer: "d.[DealerId]" }, positionalParams(params));
    if (scopeFilter) where.push(scopeFilter);
    if (status) { where.push(`d.[Status] = @p${params.length}`); params.push(status); }
    if (stateId) { where.push(`d.[StateId] = @p${params.length}`); params.push(stateId); }
    if (search) { where.push(`(d.[FirmName] LIKE @p${params.length} OR d.[Mobile] LIKE @p${params.length} OR d.[DealerCode] LIKE @p${params.length} OR d.[City] LIKE @p${params.length})`); params.push(`%${search}%`); }
    const filtered = await query(`SELECT d.*, s.[StateName] FROM dbo.[Dealers] d LEFT JOIN dbo.[States] s ON d.[StateId] = s.[StateId]${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY d.[FirmName]`, params);

    return NextResponse.json({ success: true, dealers: filtered });
  } catch (err: any) {
    console.error("Dealers get error:", err);
    return NextResponse.json({ error: "Failed to fetch dealers" }, { status: 500 });
  }
}
