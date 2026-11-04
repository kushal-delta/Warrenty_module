import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, requireUser, text } from "@/lib/services/apiHelpers";
import { centerLedgerInput, inErpAndWarranty, upsertErpLedger } from "@/lib/services/erpLedgers";
import { hashPassword } from "@/lib/auth/password";
import { defaultFormsForRole } from "@/lib/auth/forms";
import { clearScopeCache } from "@/lib/auth/scope";

const USERNAME = /^[a-z0-9._-]{3,50}$/;
const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN = /^\d{6}$/;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

/**
 * Creates / updates a service centre (fields as in the prototype) and, in the same save, its iERP ledger:
 * dbo.Lgrs under the "Service Center" group (code S0001, S0002 …) with the address in dbo.LgrAddresses.
 * Centres are never deleted (calls, stock and engineers refer to them) — set Active off instead.
 * Optional centre login (LoginUsername / LoginPassword): a dbo.Users row with role SERVICE_CENTER linked by ServiceCenterId,
 * like the Service Engineers screen. Password is required for a new login; on edit, blank keeps the current one.
 * The login follows the centre's Active flag; leaving the user name blank never removes an existing login.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const v = {
      ServiceCenterCode: text(body.ServiceCenterCode, 30)?.toUpperCase() || null,
      ServiceCenterName: text(body.ServiceCenterName, 150),
      ContactPerson: text(body.ContactPerson, 100),
      Mobile: text(body.Mobile, 20),
      Email: text(body.Email, 120)?.toLowerCase() || null,
      Gstin: text(body.Gstin, 30)?.toUpperCase() || null,
      Address: text(body.Address, 300),
      City: text(body.City, 80),
      StateId: body.StateId || null,
      District: text(body.District, 80),
      Pincode: text(body.Pincode, 12),
      IsActive: body.IsActive === undefined ? true : Boolean(body.IsActive),
    };
    if (!v.ServiceCenterCode) throw new InputError("Center code is required");
    if (!v.ServiceCenterName) throw new InputError("Center name is required");
    if (!v.StateId) throw new InputError("State is required");
    if (v.Mobile && !MOBILE.test(v.Mobile)) throw new InputError("Enter a valid 10-digit mobile number");
    if (v.Email && !EMAIL.test(v.Email)) throw new InputError("Enter a valid e-mail address");
    if (v.Pincode && !PIN.test(v.Pincode)) throw new InputError("Pin code must be 6 digits");
    if (v.Gstin && !GSTIN.test(v.Gstin)) throw new InputError("Enter a valid 15-character GSTIN");
    const loginName = text(body.LoginUsername, 50)?.toLowerCase() || null;
    const loginPassword = typeof body.LoginPassword === "string" ? body.LoginPassword.trim() : "";
    if (loginName && !USERNAME.test(loginName)) throw new InputError("Login user name: 3–50 lowercase letters, digits, dot, dash or underscore");
    if (loginPassword && loginPassword.length < 6) throw new InputError("Login password must be at least 6 characters");

    const id = (body.ServiceCenterId as string | undefined) || null;
    const result = await inErpAndWarranty(async (run, erp, created) => {
      if (!(await run(`SELECT TOP 1 1 AS [x] FROM dbo.[States] WHERE [StateId] = @id`, { id: v.StateId })).length) throw new InputError("Selected state was not found");
      const dupCode = await run(`SELECT TOP 1 1 AS [x] FROM dbo.[ServiceCenters] WHERE [ServiceCenterCode] = @code${id ? " AND [ServiceCenterId] <> @id" : ""}`, { code: v.ServiceCenterCode, id });
      if (dupCode.length) throw new InputError(`Center code ${v.ServiceCenterCode} is already used`);
      const dupName = await run(`SELECT TOP 1 1 AS [x] FROM dbo.[ServiceCenters] WHERE [ServiceCenterName] = @name${id ? " AND [ServiceCenterId] <> @id" : ""}`, { name: v.ServiceCenterName, id });
      if (dupName.length) throw new InputError(`A service center named "${v.ServiceCenterName}" already exists`);

      const keys = Object.keys(v) as (keyof typeof v)[];
      let center: any;
      if (id) {
        center = (await run(`UPDATE dbo.[ServiceCenters] SET ${keys.map((k) => `[${k}] = @${k}`).join(", ")}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId OUTPUT INSERTED.* WHERE [ServiceCenterId] = @id`, { ...v, userId: user.UserId, id }))[0];
        if (!center) throw new InputError("Service center not found");
      } else {
        center = (await run(`INSERT INTO dbo.[ServiceCenters] ([ServiceCenterId], ${keys.map((k) => `[${k}]`).join(", ")}, [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          OUTPUT INSERTED.* VALUES (@id, ${keys.map((k) => `@${k}`).join(", ")}, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, { ...v, userId: user.UserId, id: randomUUID() }))[0];
      }
      const ledger = await upsertErpLedger(run, erp, centerLedgerInput(center), user.UserId, created);

      // Centre login (role SERVICE_CENTER) — created / updated with the centre.
      const existing = (await run<any>(`SELECT TOP 1 [UserId], [Username] FROM dbo.[Users] WITH (UPDLOCK) WHERE [Role] = 'SERVICE_CENTER' AND [ServiceCenterId] = @id`, { id: center.ServiceCenterId }))[0];
      let login: { UserId: string; Username: string; created: boolean } | null = null;
      if (loginName || existing) {
        const name = loginName || existing.Username;
        if (await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Users] WHERE [Username] = @name${existing ? " AND [UserId] <> @uid" : ""}`, { name, uid: existing?.UserId ?? null }).then((r) => r.length)) throw new InputError(`User name ${name} is already taken`);
        const u = { Username: name, FirstName: v.ServiceCenterName!.slice(0, 80), Phone: v.Mobile, Email: v.Email, Address: v.Address?.slice(0, 255) || null, ServiceCenterId: center.ServiceCenterId, IsActive: v.IsActive };
        if (existing) {
          const keys = Object.keys(u) as (keyof typeof u)[];
          await run(`UPDATE dbo.[Users] SET ${keys.map((k) => `[${k}] = @${k}`).join(", ")}${loginPassword ? ", [Password] = @password" : ""}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [UserId] = @uid`,
            { ...u, password: loginPassword ? await hashPassword(loginPassword) : null, userId: user.UserId, uid: existing.UserId });
          login = { UserId: existing.UserId, Username: name, created: false };
        } else {
          if (!loginPassword) throw new InputError("Login password is required");
          const uid = randomUUID();
          await run(`INSERT INTO dbo.[Users] ([UserId], [Username], [Password], [FirstName], [Email], [Phone], [Address], [Role], [FormRights], [ServiceCenterId], [IsActive], [IsAdmin], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
            VALUES (@uid, @Username, @password, @FirstName, @Email, @Phone, @Address, 'SERVICE_CENTER', @forms, @ServiceCenterId, @IsActive, 0, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`,
            { ...u, uid, password: await hashPassword(loginPassword), forms: defaultFormsForRole("SERVICE_CENTER").join(","), userId: user.UserId });
          login = { UserId: uid, Username: name, created: true };
        }
      }
      return { center, ledger, login };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: id ? "UPDATE" : "CREATE", tableName: "ServiceCenters", recordId: result.center.ServiceCenterId, details: { Code: v.ServiceCenterCode, Name: v.ServiceCenterName, ErpLedger: result.ledger.Code, Active: v.IsActive, Login: result.login?.Username || null } });
    if (result.login) {
      await saveAuditLog({ userId: user.UserId, userName: user.Username, action: result.login.created ? "CREATE" : "UPDATE", tableName: "Users", recordId: result.login.UserId, details: { Username: result.login.Username, Role: "SERVICE_CENTER", ServiceCenterId: result.center.ServiceCenterId, Active: v.IsActive, PasswordChanged: Boolean(loginPassword) } });
      clearScopeCache(result.login.UserId);
    }
    return NextResponse.json({ success: true, center: { ...result.center, LgrId: result.ledger.LgrId, LedgerCode: result.ledger.Code, LoginUsername: result.login?.Username || null } });
  } catch (err) {
    return handleApiError(err, "Failed to save service center");
  }
}
