import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ierpQuery } from "@/lib/sqlserver";
import { SSO_MESSAGES, clearSessionCookie, setSessionCookie, signInErpUser, type SsoFailure } from "@/lib/services/erpSso";

/**
 * POST /api/Auth/ssoLogin  { "token": "<64-char token>" }  — public (no Warranty session needed).
 *
 * iERP side (built by the iERP developer, see docs/ierp-sso): clicking Warranty runs General/WarrantyLogin.ashx, which
 * saves a random 64-character token for the signed-in iERP user in dbo.WarrantySSOToken (iERP database), valid for
 * 2 minutes and single use, and redirects to <WarrantyUrl>?token=… (WarrantyUrl = http://<this app>/sso).
 * The /sso page posts the token here.
 *
 * This route uses the token exactly once, in one UPDATE on the database clock, then signs in the matching Warranty
 * user with the same session / cookie and the same { success, token, user } response as /api/Auth/login.
 *   401 — unknown, expired or already used token        403 — iERP user disabled / no matching active Warranty user
 * The token is never logged.
 */
export const dynamic = "force-dynamic";

const TOKEN = /^[0-9A-Za-z]{64}$/;
const STATUS: Record<SsoFailure, number> = { invalid: 401, expired: 401, disabled: 403, noaccess: 403, inactive: 403, error: 500 };

function failure(request: NextRequest, reason: SsoFailure) {
  const res = NextResponse.json({ success: false, code: reason, error: SSO_MESSAGES[reason] }, { status: STATUS[reason] });
  clearSessionCookie(request, res);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    if (!TOKEN.test(token)) return failure(request, "invalid");

    // Use the token up: only an unused, unexpired token matches, and only once.
    const used = (await ierpQuery<{ UserID: string; UserName: string | null; UserUnique: string | null; IsAdmin: boolean; CompanyId: string | null }>(
      `UPDATE dbo.[WarrantySSOToken] SET [UsedOn] = GETDATE()
       OUTPUT INSERTED.[UserID], INSERTED.[UserName], INSERTED.[UserUnique], INSERTED.[IsAdmin], INSERTED.[CompanyId]
       WHERE [Token] = @p0 AND [UsedOn] IS NULL AND [ExpiresOn] > GETDATE()`,
      [token]
    ))[0];
    if (!used) return failure(request, "expired");

    // The iERP user is looked up again by its GUID (UserUnique), else by its login id (UserID) — the IsAdmin flag in the
    // token is not trusted on its own; the iERP Users table decides.
    const result = await signInErpUser(request, { userId: used.UserUnique, userName: used.UserID }, { companyId: used.CompanyId, via: "WarrantySSOToken" });
    if (!result.ok) return failure(request, result.reason);

    const res = NextResponse.json({ success: true, token: result.token, user: { ...result.sessionPayload, Source: "IERP" } });
    setSessionCookie(request, res, result.token, result.hours);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err: any) {
    console.error("iERP ssoLogin error:", err?.message || err); // never the token
    return failure(request, "error");
  }
}
