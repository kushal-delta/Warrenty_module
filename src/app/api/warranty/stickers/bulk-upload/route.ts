import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query, beginTransaction, sql } from "@/lib/sqlserver";
import { randomUUID } from "crypto";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const { rows } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided for bulk upload" }, { status: 400 });
    }

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentUserId = sessionUser.UserId;

    // 1. Resolve product models to find ProductModelId by ModelCode
    const allModels = await query<any>(`SELECT [ProductModelId], [ModelCode], [Category] FROM dbo.[ProductModels]`);

    const modelCodeMap = new Map<string, { id: string; category: string }>();
    allModels.forEach((m) => {
      modelCodeMap.set(m.ModelCode.trim().toUpperCase(), {
        id: m.ProductModelId,
        category: m.Category,
      });
    });

    // 2. JS Deduplication by SerialNo
    const seenSerials = new Set<string>();
    const uniqueIncoming: any[] = [];
    let internalDuplicates = 0;

    for (const r of rows) {
      const serial = String(r.SerialNo || r["Serial No"] || "").trim().toUpperCase();
      if (!serial) continue;
      if (seenSerials.has(serial)) {
        internalDuplicates++;
        continue;
      }
      seenSerials.add(serial);
      uniqueIncoming.push({
        ...r,
        cleanSerial: serial,
      });
    }

    // 3. Query existing serials via inArray
    const serials = Array.from(seenSerials);
    const existing = serials.length ? await query<any>(`SELECT [SerialNo] FROM dbo.[Stickers] WHERE [SerialNo] IN (${serials.map((_, index) => `@p${index}`).join(", ")})`, serials) : [];

    const existingSerialSet = new Set(existing.map((s) => s.SerialNo.toUpperCase()));

    // 4. Build toInsert batch
    const defaultModel = allModels[0];
    const toInsert = uniqueIncoming
      .filter((r) => !existingSerialSet.has(r.cleanSerial))
      .map((r) => {
        const modelCode = String(r.ModelCode || r["Model Code"] || "").trim().toUpperCase();
        const matchedModel = modelCodeMap.get(modelCode) || {
          id: defaultModel?.ProductModelId,
          category: r.Category || defaultModel?.Category || "PUMP",
        };

        return {
          SerialNo: r.cleanSerial,
          ProductModelId: matchedModel.id,
          Category: String(r.Category || matchedModel.category || "PUMP").trim().toUpperCase(),
          SupplierName: r.SupplierName || "Solartive Techno Industries",
          ProductGroup: r.ProductGroup || "Solar Submersible Pump Set",
          InvoiceNo: r.InvoiceNo || null,
          InvoiceDate: r.InvoiceDate ? new Date(r.InvoiceDate) : null,
          InvoiceLocation: r.InvoiceLocation || "Greater Noida HO",
          MfgDate: r.MfgDate ? new Date(r.MfgDate) : null,
          Status: "Generated",
          PrintCount: 0,
          InsertedByUserId: currentUserId,
          LastUpdatedByUserId: currentUserId,
        };
      });

    let insertedCount = 0;
    if (toInsert.length > 0) {
      const transaction = await beginTransaction();
      try {
        for (const record of toInsert) {
          const request = new sql.Request(transaction);
          Object.entries(record).forEach(([key, value]) => request.input(key, value as any));
          request.input("StickerId", randomUUID());
          await request.query(`INSERT INTO dbo.[Stickers] ([StickerId],[SerialNo],[ProductModelId],[Category],[SupplierName],[ProductGroup],[InvoiceNo],[InvoiceDate],[InvoiceLocation],[MfgDate],[Status],[PrintCount],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (@StickerId,@SerialNo,@ProductModelId,@Category,@SupplierName,@ProductGroup,@InvoiceNo,@InvoiceDate,@InvoiceLocation,@MfgDate,@Status,@PrintCount,@InsertedByUserId,@LastUpdatedByUserId,SYSUTCDATETIME(),SYSUTCDATETIME())`);
          insertedCount++;
        }
        await transaction.commit();
      } catch (error) { await transaction.rollback().catch(() => undefined); throw error; }
    }

    const skippedCount = internalDuplicates + existingSerialSet.size;

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "BULK_UPLOAD",
      tableName: "Stickers",
      details: { totalRows: rows.length, inserted: insertedCount, skipped: skippedCount },
    });

    return NextResponse.json({
      success: true,
      inserted: insertedCount,
      skipped: skippedCount,
      failed: 0,
      message: `Successfully uploaded ${insertedCount} serial numbers (${skippedCount} duplicates skipped)`,
    });
  } catch (err: any) {
    console.error("Bulk upload stickers error:", err);
    return NextResponse.json({ error: "Bulk upload failed on server" }, { status: 500 });
  }
}
