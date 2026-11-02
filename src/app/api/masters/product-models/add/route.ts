import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { ProductModels } from "@/db/schema";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const {
      ModelCode,
      ModelName,
      Category,
      Hp,
      Kw,
      Technology,
      VoltageRange,
      HeadRange,
      Discharge,
      SizeInch,
      WarrantyMonths,
      Description,
      IsActive,
    } = body;

    if (!ModelCode || !ModelName || !Category) {
      return NextResponse.json(
        { error: "Model code, model name, and category are required" },
        { status: 400 }
      );
    }

    const inserted = await db
      .insert(ProductModels)
      .values({
        ModelCode: ModelCode.trim(),
        ModelName: ModelName.trim(),
        Category: Category.trim(),
        Hp: Hp ? String(Hp) : null,
        Kw: Kw ? String(Kw) : null,
        Technology: Technology?.trim() || null,
        VoltageRange: VoltageRange?.trim() || null,
        HeadRange: HeadRange?.trim() || null,
        Discharge: Discharge?.trim() || null,
        SizeInch: SizeInch?.trim() || null,
        WarrantyMonths: WarrantyMonths ? Number(WarrantyMonths) : 24,
        Description: Description?.trim() || null,
        IsActive: IsActive !== undefined ? Boolean(IsActive) : true,
        InsertedByUserId: sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056",
        LastUpdatedByUserId: sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056",
      })
      .returning();

    const newRecord = inserted[0];

    await saveAuditLog({
      userId: sessionUser?.UserId,
      userName: sessionUser?.Username,
      action: "CREATE",
      tableName: "ProductModels",
      recordId: newRecord.ProductModelId,
      details: { ModelCode: newRecord.ModelCode, ModelName: newRecord.ModelName },
    });

    return NextResponse.json({ success: true, productModel: newRecord });
  } catch (err: any) {
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "A product model with this model code already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create product model" }, { status: 500 });
  }
}
