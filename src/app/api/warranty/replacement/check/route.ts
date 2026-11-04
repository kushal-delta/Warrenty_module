import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { getScope } from "@/lib/auth/scope";
import { checkNew, checkOld } from "@/lib/services/replacementFlow";

/** Live check for the Replacement Flow form: verdicts for the faulty (old) and replacement (new) serial. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { oldSerial = "", newSerial = "" } = await request.json().catch(() => ({}));
    const scope = await getScope(user);
    const old = await checkOld(runQuery, scope, String(oldSerial));
    const nw = await checkNew(runQuery, String(newSerial), String(oldSerial), old.warranty);
    return NextResponse.json({ success: true, old: old.verdict, new: nw, canReplace: Boolean(old.verdict?.ok && nw?.ok) });
  } catch (err) {
    return handleApiError(err, "Serial check failed");
  }
}
