import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Stickers, ProductModels } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const {
      SerialNo,
      ProductModelId,
      Category,
      SupplierName,
      ProductGroup,
      InvoiceNo,
      InvoiceDate,
      InvoiceLocation,
      MfgDate,
      Status,
      StickerBatchId,
    } = body;

    if (!SerialNo || !ProductModelId || !Category) {
      return NextResponse.json(
        { error: "Serial number, product model, and category are required" },
        { status: 400 }
      );
    }

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    // Insert into Stickers
    const inserted = await db
      .insert(Stickers)
      .values({
        SerialNo: SerialNo.trim().toUpperCase(),
        ProductModelId,
        Category: Category.trim().toUpperCase(),
        SupplierName: SupplierName?.trim() || "Solartive Techno Industries",
        ProductGroup: ProductGroup?.trim() || "Solar Submersible Pump Set",
        InvoiceNo: InvoiceNo?.trim() || null,
        InvoiceDate: InvoiceDate ? new Date(InvoiceDate) : null,
        InvoiceLocation: InvoiceLocation?.trim() || "Greater Noida HO",
        MfgDate: MfgDate ? new Date(MfgDate) : null,
        Status: Status || "Generated",
        PrintCount: 0,
        StickerBatchId: StickerBatchId || null,
        InsertedByUserId: currentUserId,
        LastUpdatedByUserId: currentUserId,
      })
      .returning();

    const newSticker = inserted[0];

    // Fetch enriched details with ModelName
    const enriched = await db
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
        InsertedOn: Stickers.InsertedOn,
      })
      .from(Stickers)
      .leftJoin(ProductModels, eq(Stickers.ProductModelId, ProductModels.ProductModelId))
      .where(eq(Stickers.StickerId, newSticker.StickerId));

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "CREATE",
      tableName: "Stickers",
      recordId: newSticker.StickerId,
      details: { SerialNo: newSticker.SerialNo, Category: newSticker.Category },
    });

    return NextResponse.json({
      success: true,
      sticker: enriched[0] || newSticker,
    });
  } catch (err: any) {
    if (err.code === "23505") {
      return NextResponse.json(
        { error: `Serial number already exists in register.` },
        { status: 409 }
      );
    }
    console.error("Sticker add error:", err);
    return NextResponse.json({ error: "Failed to register serial number" }, { status: 500 });
  }
}
