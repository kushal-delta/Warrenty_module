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

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const newRecord = (await query<any>(`INSERT INTO dbo.[ProductModels] ([ProductModelId], [ModelCode], [ModelName], [Category], [Hp], [Kw], [Technology], [VoltageRange], [HeadRange], [Discharge], [SizeInch], [WarrantyMonths], [Description], [IsActive], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn]) OUTPUT INSERTED.* VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,@p11,@p12,@p13,@p14,@p14,SYSUTCDATETIME(),SYSUTCDATETIME())`, [randomUUID(), ModelCode.trim(), ModelName.trim(), Category.trim(), Hp ? String(Hp) : null, Kw ? String(Kw) : null, Technology?.trim() || null, VoltageRange?.trim() || null, HeadRange?.trim() || null, Discharge?.trim() || null, SizeInch?.trim() || null, WarrantyMonths ? Number(WarrantyMonths) : 24, Description?.trim() || null, IsActive !== undefined ? Boolean(IsActive) : true, sessionUser.UserId]))[0];

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
    if (String(err.number) === "2627" || String(err.number) === "2601") {
      return NextResponse.json(
        { error: "A product model with this model code already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create product model" }, { status: 500 });
  }
}
