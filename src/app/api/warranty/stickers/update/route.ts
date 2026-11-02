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
    const { StickerId, ...fields } = body;

    if (!StickerId) {
      return NextResponse.json({ error: "StickerId is required" }, { status: 400 });
    }

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    const updated = await db
      .update(Stickers)
      .set({
        ...fields,
        InvoiceDate: fields.InvoiceDate ? new Date(fields.InvoiceDate) : null,
        MfgDate: fields.MfgDate ? new Date(fields.MfgDate) : null,
        LastUpdatedOn: new Date(),
        LastUpdatedByUserId: currentUserId,
      })
      .where(eq(Stickers.StickerId, StickerId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Sticker record not found" }, { status: 404 });
    }

    // Re-enrich with ModelName
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
        LastUpdatedOn: Stickers.LastUpdatedOn,
      })
      .from(Stickers)
      .leftJoin(ProductModels, eq(Stickers.ProductModelId, ProductModels.ProductModelId))
      .where(eq(Stickers.StickerId, StickerId));

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "UPDATE",
      tableName: "Stickers",
      recordId: StickerId,
      details: fields,
    });

    return NextResponse.json({ success: true, sticker: enriched[0] || updated[0] });
  } catch (err: any) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Serial number already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update sticker" }, { status: 500 });
  }
}
