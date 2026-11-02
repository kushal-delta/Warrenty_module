import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { ProductModels } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

/**
 * RULES §8: Bulk upload endpoint — single insert().values([...]), JS dedup
 */
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const { rows } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided for bulk upload" }, { status: 400 });
    }

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    // 1. In-memory JS deduplication by ModelCode
    const seenCodes = new Set<string>();
    const uniqueIncoming: any[] = [];
    let internalDuplicates = 0;

    for (const r of rows) {
      const code = String(r.ModelCode || r["Model Code"] || "").trim().toUpperCase();
      if (!code) continue;
      if (seenCodes.has(code)) {
        internalDuplicates++;
        continue;
      }
      seenCodes.add(code);
      uniqueIncoming.push({
        ...r,
        cleanCode: code,
      });
    }

    // 2. Query existing records in single DB round-trip using inArray
    const existingModels = await db
      .select({ ModelCode: ProductModels.ModelCode })
      .from(ProductModels)
      .where(inArray(ProductModels.ModelCode, Array.from(seenCodes)));

    const existingCodeSet = new Set(existingModels.map((m) => m.ModelCode.toUpperCase()));

    // 3. Filter out rows that already exist in DB
    const toInsert = uniqueIncoming
      .filter((r) => !existingCodeSet.has(r.cleanCode))
      .map((r) => ({
        ModelCode: r.cleanCode,
        ModelName: String(r.ModelName || r["Model Name"] || r.cleanCode).trim(),
        Category: String(r.Category || "PUMP").trim().toUpperCase(),
        Hp: r.Hp ? String(r.Hp) : null,
        Kw: r.Kw ? String(r.Kw) : null,
        Technology: r.Technology?.trim() || null,
        VoltageRange: r.VoltageRange || r["Voltage Range"] || null,
        HeadRange: r.HeadRange || r["Head Range"] || null,
        Discharge: r.Discharge || null,
        SizeInch: r.SizeInch || r["Size Inch"] || null,
        WarrantyMonths: r.WarrantyMonths ? Number(r.WarrantyMonths) : 24,
        Description: r.Description || null,
        IsActive: true,
        InsertedByUserId: currentUserId,
        LastUpdatedByUserId: currentUserId,
      }));

    let insertedCount = 0;
    if (toInsert.length > 0) {
      // Single DB insert call (RULES §8)
      const inserted = await db.insert(ProductModels).values(toInsert).returning();
      insertedCount = inserted.length;
    }

    const skippedCount = internalDuplicates + existingCodeSet.size;

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "BULK_UPLOAD",
      tableName: "ProductModels",
      details: { totalRows: rows.length, inserted: insertedCount, skipped: skippedCount },
    });

    return NextResponse.json({
      success: true,
      inserted: insertedCount,
      skipped: skippedCount,
      failed: 0,
      message: `Successfully inserted ${insertedCount} product models (${skippedCount} duplicates skipped)`,
    });
  } catch (err: any) {
    console.error("Bulk upload error:", err);
    return NextResponse.json({ error: "Bulk upload failed on server" }, { status: 500 });
  }
}
