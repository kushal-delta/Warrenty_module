import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { ProductModels } from "@/db/schema";
import { asc, desc, eq, and, ilike } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { category, search, activeOnly } = body;

    let query = db.select().from(ProductModels);

    const conditions: any[] = [];
    if (category) {
      conditions.push(eq(ProductModels.Category, category));
    }
    if (activeOnly) {
      conditions.push(eq(ProductModels.IsActive, true));
    }
    if (search) {
      conditions.push(ilike(ProductModels.ModelName, `%${search}%`));
    }

    const rows =
      conditions.length > 0
        ? await query.where(and(...conditions)).orderBy(asc(ProductModels.ModelCode))
        : await query.orderBy(asc(ProductModels.ModelCode));

    return NextResponse.json({ success: true, productModels: rows });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch product models" }, { status: 500 });
  }
}
