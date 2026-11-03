import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { category, status, productModelId, search, limit = 100 } = body;

    const where: string[] = [], params: unknown[] = [];
    if (category) { where.push(`s.[Category] = @p${params.length}`); params.push(category); } if (status) { where.push(`s.[Status] = @p${params.length}`); params.push(status); } if (productModelId) { where.push(`s.[ProductModelId] = @p${params.length}`); params.push(productModelId); } if (search) { where.push(`(s.[SerialNo] LIKE @p${params.length} OR s.[InvoiceNo] LIKE @p${params.length} OR p.[ModelName] LIKE @p${params.length})`); params.push(`%${search}%`); }
    params.push(Number(limit) || 100);
    const filtered = await query(`SELECT TOP (@p${params.length - 1}) s.*, p.[ModelCode], p.[ModelName], b.[BatchNo] FROM dbo.[Stickers] s LEFT JOIN dbo.[ProductModels] p ON s.[ProductModelId] = p.[ProductModelId] LEFT JOIN dbo.[StickerBatches] b ON s.[StickerBatchId] = b.[StickerBatchId]${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY s.[InsertedOn] DESC`, params);

    return NextResponse.json({ success: true, stickers: filtered });
  } catch (err: any) {
    console.error("Stickers get error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch stickers register" }, { status: 500 });
  }
}
