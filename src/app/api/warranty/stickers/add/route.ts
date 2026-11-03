import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { randomUUID } from "crypto";
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

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentUserId = sessionUser.UserId;

    // Insert into Stickers
    const newSticker = (await query<any>(`INSERT INTO dbo.[Stickers] ([StickerId],[SerialNo],[ProductModelId],[Category],[SupplierName],[ProductGroup],[InvoiceNo],[InvoiceDate],[InvoiceLocation],[MfgDate],[Status],[PrintCount],[StickerBatchId],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) OUTPUT INSERTED.* VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,0,@p11,@p12,@p12,SYSUTCDATETIME(),SYSUTCDATETIME())`, [randomUUID(), SerialNo.trim().toUpperCase(), ProductModelId, Category.trim().toUpperCase(), SupplierName?.trim() || "Solartive Techno Industries", ProductGroup?.trim() || "Solar Submersible Pump Set", InvoiceNo?.trim() || null, InvoiceDate ? new Date(InvoiceDate) : null, InvoiceLocation?.trim() || "Greater Noida HO", MfgDate ? new Date(MfgDate) : null, Status || "Generated", StickerBatchId || null, currentUserId]))[0];

    // Fetch enriched details with ModelName
    const enriched = await query<any>(`SELECT s.*, p.[ModelCode], p.[ModelName] FROM dbo.[Stickers] s LEFT JOIN dbo.[ProductModels] p ON s.[ProductModelId] = p.[ProductModelId] WHERE s.[StickerId] = @p0`, [newSticker.StickerId]);

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
    if (String(err.number) === "2627" || String(err.number) === "2601") {
      return NextResponse.json(
        { error: `Serial number already exists in register.` },
        { status: 409 }
      );
    }
    console.error("Sticker add error:", err);
    return NextResponse.json({ error: "Failed to register serial number" }, { status: 500 });
  }
}
