import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
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

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentUserId = sessionUser.UserId, allowed = ["SerialNo","ProductModelId","Category","SupplierName","ProductGroup","InvoiceNo","InvoiceDate","InvoiceLocation","MfgDate","Status","StickerBatchId"];
    const edits = Object.entries(fields).filter(([key]) => allowed.includes(key)).map(([key, value]) => [key, (key === "InvoiceDate" || key === "MfgDate") && value ? new Date(value as string) : value] as const);
    const updated = await query<any>(`UPDATE dbo.[Stickers] SET ${edits.map(([key], index) => `[${key}] = @p${index}`).join(", ")}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p${edits.length} OUTPUT INSERTED.* WHERE [StickerId] = @p${edits.length + 1}`, [...edits.map(([, value]) => value), currentUserId, StickerId]);

    if (updated.length === 0) {
      return NextResponse.json({ error: "Sticker record not found" }, { status: 404 });
    }

    // Re-enrich with ModelName
    const enriched = await query<any>(`SELECT s.*, p.[ModelCode], p.[ModelName] FROM dbo.[Stickers] s LEFT JOIN dbo.[ProductModels] p ON s.[ProductModelId] = p.[ProductModelId] WHERE s.[StickerId] = @p0`, [StickerId]);

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
    if (String(err.number) === "2627" || String(err.number) === "2601") {
      return NextResponse.json({ error: "Serial number already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update sticker" }, { status: 500 });
  }
}
