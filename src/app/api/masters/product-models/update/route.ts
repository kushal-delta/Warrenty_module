import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { ProductModels } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const { ProductModelId, ...fields } = body;

    if (!ProductModelId) {
      return NextResponse.json({ error: "ProductModelId is required" }, { status: 400 });
    }

    const updated = await db
      .update(ProductModels)
      .set({
        ...fields,
        Hp: fields.Hp ? String(fields.Hp) : null,
        Kw: fields.Kw ? String(fields.Kw) : null,
        WarrantyMonths: fields.WarrantyMonths ? Number(fields.WarrantyMonths) : 24,
        LastUpdatedOn: new Date(),
        LastUpdatedByUserId: sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056",
      })
      .where(eq(ProductModels.ProductModelId, ProductModelId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Product model not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: sessionUser?.UserId,
      userName: sessionUser?.Username,
      action: "UPDATE",
      tableName: "ProductModels",
      recordId: ProductModelId,
      details: fields,
    });

    return NextResponse.json({ success: true, productModel: updated[0] });
  } catch (err: any) {
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "A product model with this code already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to update product model" }, { status: 500 });
  }
}
