import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: "Company details are managed centrally in Delta iERP and cannot be edited in the Warranty module." },
    { status: 403 }
  );
}
