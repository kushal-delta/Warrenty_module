import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { getErpCompany } from "@/lib/services/erpCompany";

export async function POST(request: NextRequest) {
  try {
    if (!await sessionFromRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const company = await getErpCompany();
    return NextResponse.json({ success: true, company, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("Company get error from iERP:", err);
    return NextResponse.json({ error: err.message || "Unable to load company details. Please try Refresh." }, { status: 502 });
  }
}
