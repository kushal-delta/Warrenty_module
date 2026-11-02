import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Stickers, ProductModels, StickerBatches } from "@/db/schema";
import { desc, eq, and, ilike } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { category, status, productModelId, search, limit = 100 } = body;

    const rows = await db
      .select({
        StickerId: Stickers.StickerId,
        SerialNo: Stickers.SerialNo,
        Category: Stickers.Category,
        ProductModelId: Stickers.ProductModelId,
        ModelCode: ProductModels.ModelCode,
        ModelName: ProductModels.ModelName,
        SupplierName: Stickers.SupplierName,
        ProductGroup: Stickers.ProductGroup,
        InvoiceNo: Stickers.InvoiceNo,
        InvoiceDate: Stickers.InvoiceDate,
        InvoiceLocation: Stickers.InvoiceLocation,
        MfgDate: Stickers.MfgDate,
        Status: Stickers.Status,
        PrintCount: Stickers.PrintCount,
        LastPrintedOn: Stickers.LastPrintedOn,
        StickerBatchId: Stickers.StickerBatchId,
        BatchNo: StickerBatches.BatchNo,
        InsertedOn: Stickers.InsertedOn,
        LastUpdatedOn: Stickers.LastUpdatedOn,
      })
      .from(Stickers)
      .leftJoin(ProductModels, eq(Stickers.ProductModelId, ProductModels.ProductModelId))
      .leftJoin(StickerBatches, eq(Stickers.StickerBatchId, StickerBatches.StickerBatchId))
      .orderBy(desc(Stickers.InsertedOn))
      .limit(limit);

    let filtered = rows;
    if (category) {
      filtered = filtered.filter((s) => s.Category === category);
    }
    if (status) {
      filtered = filtered.filter((s) => s.Status === status);
    }
    if (productModelId) {
      filtered = filtered.filter((s) => s.ProductModelId === productModelId);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.SerialNo.toLowerCase().includes(q) ||
          (s.InvoiceNo && s.InvoiceNo.toLowerCase().includes(q)) ||
          (s.ModelName && s.ModelName.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({ success: true, stickers: filtered });
  } catch (err: any) {
    console.error("Stickers get error:", err);
    return NextResponse.json({ error: "Failed to fetch stickers register" }, { status: 500 });
  }
}
