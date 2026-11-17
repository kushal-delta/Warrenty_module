import type { NextRequest, NextResponse } from "next/server";
import { execute, ierpQuery, query } from "@/lib/sqlserver";
import { signAuthToken, type AuthSessionUser } from "@/lib/auth/jwt";
import { isHttpsRequest } from "@/lib/auth/token";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { ERP_USER_FLAG, erpAdminDisabled, syncErpAdmin, type ErpAdmin } from "@/lib/services/erpUsers";

/**
 * Shared iERP → Warranty single sign-on: turns an iERP user (already proven by a one-time iERP token / ticket) into a
 * normal Warranty session — the same JWT and authToken cookie that /api/Auth/login creates.
 *
 * Which Warranty user is signed in:
 *   - iERP admin (dbo.Users.IsAdmin = 1, enabled)  → the same local mirror the iERP-admin password login uses (role SUPER);
 *   - any other enabled iERP user                  → the active Warranty user with the same user name (User Management).
 *     Admin mirrors and dealer logins are never matched by name.
 */
export type SsoFailure = "invalid" | "expired" | "disabled" | "noaccess" | "inactive" | "error";

export const SSO_MESSAGES: Record<SsoFailure, string> = {
  invalid: "The sign-in link from iERP is not valid. Please click Warranty in iERP again.",
  expired: "The sign-in link from iERP has expired or was already used. Please click Warranty in iERP again.",
  disabled: "Your iERP account is disabled. Please contact administrator.",
  noaccess: "Your iERP user does not have access to the Warranty module. Ask your administrator to create your user here with the same user name.",
  inactive: "Your Warranty account is deactivated. Please contact administrator.",
  error: "Could not sign you in from iERP right now. Please try again, or sign in below.",
};

export const ssoSessionHours = () => {
  const h = Number(process.env.SSO_SESSION_HOURS);
  return Number.isFinite(h) && h > 0 && h <= 168 ? h : 12;
};

export const clientIp = (request: NextRequest) =>
  (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "local").trim().slice(0, 50);

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The iERP user: by its GUID (Users.UserId) when known, else by its login name (Users.UserName). */
async function findErpUser(ref: { userId?: string | null; userName?: string | null }) {
  const cols = `u.[UserId], u.[UserName], u.[Password], u.[FirstName], u.[LastName], u.[Mobileno], u.[EmailId], u.[IsDisabled], u.[IsEmpDisable], u.[IsAdmin]`;
  const id = String(ref.userId || "").trim();
  if (GUID.test(id)) {
    const row = (await ierpQuery<ErpAdmin & { IsAdmin: boolean | null }>(`SELECT TOP 1 ${cols} FROM dbo.[Users] u WHERE u.[UserId] = @p0`, [id]))[0];
    if (row) return row;
  }
  const name = String(ref.userName || "").trim();
  if (!name) return null;
  return (await ierpQuery<ErpAdmin & { IsAdmin: boolean | null }>(`SELECT TOP 1 ${cols} FROM dbo.[Users] u WHERE u.[UserName] = @p0`, [name]))[0] || null;
}

export type SsoResult =
  | { ok: true; user: any; sessionPayload: AuthSessionUser; token: string; hours: number }
  | { ok: false; reason: SsoFailure };

/** Resolves the Warranty user for an iERP user and signs a session token (writes LastLogin and the SSO_LOGIN audit entry). */
export async function signInErpUser(request: NextRequest, ref: { userId?: string | null; userName?: string | null },
  audit: Record<string, unknown>): Promise<SsoResult> {
  const erp = await findErpUser(ref);
  if (!erp || erpAdminDisabled(erp)) return { ok: false, reason: "disabled" };

  let user: any;
  let source: "IERP_SSO_ADMIN" | "IERP_SSO_USER";
  if (erp.IsAdmin) {
    user = await syncErpAdmin(erp); // same mirror (and same UserId) as the iERP admin password login
    source = "IERP_SSO_ADMIN";
  } else {
    user = (await query<any>(
      `SELECT TOP 1 u.* FROM dbo.[Users] u WHERE u.[Username] = @p0 AND u.[Role] <> 'DEALER' AND ${ERP_USER_FLAG("u")} = 0`,
      [String(erp.UserName || "").trim()]
    ))[0];
    if (!user) return { ok: false, reason: "noaccess" };
    if (!user.IsActive) return { ok: false, reason: "inactive" };
    await execute(`UPDATE dbo.[Users] SET [LastLogin] = SYSUTCDATETIME() WHERE [UserId] = @p0`, [user.UserId]);
    source = "IERP_SSO_USER";
  }

  const sessionPayload: AuthSessionUser = {
    UserId: user.UserId, Username: user.Username, FirstName: user.FirstName, LastName: user.LastName, Email: user.Email,
    Role: user.Role, IsAdmin: user.IsAdmin, ServiceCenterId: user.ServiceCenterId, FormRights: user.FormRights || null,
  };
  const hours = ssoSessionHours();
  const token = await signAuthToken(sessionPayload, `${hours}h`);

  await saveAuditLog({
    userId: user.UserId,
    userName: `${user.FirstName} ${user.LastName || ""}`.trim(),
    action: "SSO_LOGIN",
    tableName: "Users",
    recordId: user.UserId,
    details: { role: user.Role, source, ierpUserId: erp.UserId, ierpUserName: erp.UserName, ip: clientIp(request), ...audit },
  });
  return { ok: true, user, sessionPayload, token, hours };
}

/** The authToken cookie, exactly as the password login sets it (lifetime = the SSO session). */
export function setSessionCookie(request: NextRequest, res: NextResponse, token: string, hours: number) {
  res.cookies.set("authToken", token, { httpOnly: true, secure: isHttpsRequest(request), sameSite: "lax", path: "/", maxAge: hours * 60 * 60 });
}

/** Never leave a previous user signed in after a failed hand-over from iERP. */
export function clearSessionCookie(request: NextRequest, res: NextResponse) {
  res.cookies.set("authToken", "", { httpOnly: true, secure: isHttpsRequest(request), sameSite: "lax", path: "/", maxAge: 0 });
}
