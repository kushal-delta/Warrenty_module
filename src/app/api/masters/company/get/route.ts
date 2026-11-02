import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Companies } from "@/db/schema";

export async function POST(request: NextRequest) {
  try {
    const rows = await db.select().from(Companies).limit(1);
    return NextResponse.json({ success: true, company: rows[0] || null });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch company profile" }, { status: 500 });
  }
}
