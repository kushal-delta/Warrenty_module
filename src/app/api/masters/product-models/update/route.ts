import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
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

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const allowed = ["ModelCode", "ModelName", "Category", "Hp", "Kw", "Technology", "VoltageRange", "HeadRange", "Discharge", "SizeInch", "WarrantyMonths", "Description", "IsActive", "SortOrder"];
    const edits = Object.entries(fields).filter(([key]) => allowed.includes(key)).map(([key, value]) => [key, key === "Hp" || key === "Kw" ? (value ? String(value) : null) : key === "WarrantyMonths" ? Number(value || 24) : value] as const);
    const updated = await query<any>(`UPDATE dbo.[ProductModels] SET ${edits.map(([key], index) => `[${key}] = @p${index}`).join(", ")}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p${edits.length} OUTPUT INSERTED.* WHERE [ProductModelId] = @p${edits.length + 1}`, [...edits.map(([, value]) => value), sessionUser.UserId, ProductModelId]);

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
    if (String(err.number) === "2627" || String(err.number) === "2601") {
      return NextResponse.json(
        { error: "A product model with this code already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to update product model" }, { status: 500 });
  }
}
