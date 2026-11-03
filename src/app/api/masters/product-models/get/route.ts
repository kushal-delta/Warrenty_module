import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { category, search, activeOnly } = body;

    const where: string[] = [], params: unknown[] = [];
    if (category) { where.push(`[Category] = @p${params.length}`); params.push(category); }
    if (activeOnly) where.push(`[IsActive] = 1`);
    if (search) { where.push(`[ModelName] LIKE @p${params.length}`); params.push(`%${search}%`); }
    const rows = await query(`SELECT * FROM dbo.[ProductModels]${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY [ModelCode]`, params);

    return NextResponse.json({ success: true, productModels: rows });
  } catch (err: any) {
    console.error("Product models get error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch product models" }, { status: 500 });
  }
}
