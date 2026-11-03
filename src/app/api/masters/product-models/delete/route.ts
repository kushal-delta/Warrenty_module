import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const { ProductModelId } = body;

    if (!ProductModelId) {
      return NextResponse.json({ error: "ProductModelId is required in request body" }, { status: 400 });
    }

    const deleted = await query<any>(`DELETE FROM dbo.[ProductModels] OUTPUT DELETED.* WHERE [ProductModelId] = @p0`, [ProductModelId]);

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Product model not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: sessionUser?.UserId,
      userName: sessionUser?.Username,
      action: "DELETE",
      tableName: "ProductModels",
      recordId: ProductModelId,
      details: { ModelCode: deleted[0].ModelCode },
    });

    return NextResponse.json({
      success: true,
      message: `Product model ${deleted[0].ModelCode} deleted successfully`,
    });
  } catch (err: any) {
    // RULES §7: Foreign key restrict error handling
    if (String(err.number) === "547") {
      return NextResponse.json(
        {
          error:
            "Cannot delete this product model because existing stickers, warranties, or complaints are linked to it. Please reassign or remove linked records first.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to delete product model" }, { status: 500 });
  }
}
