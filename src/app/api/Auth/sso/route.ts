import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ierpQuery } from "@/lib/sqlserver";
import { clearSessionCookie, clientIp, setSessionCookie, signInErpUser, type SsoFailure } from "@/lib/services/erpSso";

/**
 * Alternative iERP → Warranty hand-over (ticket variant): GET /api/Auth/sso?ticket=<TicketId>, ticket from
 * SolarativeiERP.dbo.usp_CreateWarrantySsoTicket (server/migrations/2026-11-13-ierp-warranty-sso.sql).
 * The live iERP uses the token variant instead (/sso page → POST /api/Auth/ssoLogin); both sign in the same way
 * (lib/services/erpSso.ts). Kept so either iERP implementation works.
 */
export const dynamic = "force-dynamic";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same-site relative path only ("/x", never "//host" or "/\host"), else the dashboard. */
const safePath = (p: unknown) => {
  const s = String(p ?? "").trim();
  return /^\/(?![\/\\])/.test(s) && !s.startsWith("/login") && !s.startsWith("/api/") && s.length <= 200 ? s : "/";
};

/** 303 with a relative Location, so it works behind any proxy / host name. The ticket never reaches the next page. */
function redirect(path: string) {
  const res = new NextResponse(null, { status: 303, headers: { Location: path } });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

function fail(request: NextRequest, reason: SsoFailure) {
  const res = redirect(`/login?sso=${reason}`);
  clearSessionCookie(request, res);
  return res;
}

export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket")?.trim() || "";
  if (!GUID.test(ticket)) return fail(request, "invalid");
  try {
    const used = (await ierpQuery<{ UserId: string; CompanyId: string | null; FiscalYear: string | null; ReturnPath: string | null }>(
      `UPDATE dbo.[WarrantySsoTickets] SET [UsedOn] = SYSUTCDATETIME(), [UsedIp] = @p1
       OUTPUT INSERTED.[UserId], INSERTED.[CompanyId], INSERTED.[FiscalYear], INSERTED.[ReturnPath]
       WHERE [TicketId] = @p0 AND [UsedOn] IS NULL AND [ExpiresOn] > SYSUTCDATETIME()`,
      [ticket, clientIp(request)]
    ))[0];
    if (!used) return fail(request, "expired");

    const result = await signInErpUser(request, { userId: used.UserId }, { companyId: used.CompanyId, fiscalYear: used.FiscalYear, via: "WarrantySsoTickets" });
    if (!result.ok) return fail(request, result.reason);

    const res = redirect(safePath(used.ReturnPath));
    setSessionCookie(request, res, result.token, result.hours);
    return res;
  } catch (err: any) {
    console.error("iERP SSO error:", err?.message || err);
    return fail(request, "error");
  }
}
