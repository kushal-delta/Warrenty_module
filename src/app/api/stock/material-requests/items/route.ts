import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, text } from "@/lib/services/apiHelpers";
import { REQUEST_TYPES, catalogue } from "@/lib/services/materialRequests";

/** Items that can be requested for a request type: Product → iERP finished goods; Spare → Spares master + iERP components. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json().catch(() => ({}));
    if (!REQUEST_TYPES.includes(body.type)) return fail("Select the request type");
    const items = await catalogue(user, body.type, text(body.search, 60) || undefined);
    return NextResponse.json({ success: true, items });
  } catch (err) {
    return handleApiError(err, "Could not load items");
  }
}
