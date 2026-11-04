import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, requireUser, text } from "@/lib/services/apiHelpers";
import { hashPassword } from "@/lib/auth/password";
import { defaultFormsForRole, rightsString } from "@/lib/auth/forms";
import { inErpAndWarranty, syncEngineerLedger } from "@/lib/services/erpLedgers";

const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9._-]{3,50}$/;

/**
 * Creates / updates a service engineer (fields as in the prototype): a login with role ENGINEER in dbo.Users and,
 * in the same save, an iERP ledger under the "Service Engineers" group, placed under the centre's ledger (UnderLgrId),
 * with the address in dbo.LgrAddresses. Password is required for a new engineer; on edit, blank keeps the current one.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const id = (body.UserId as string | undefined) || null;
    const v = {
      FirstName: text(body.FirstName, 80),
      LastName: text(body.LastName, 80),
      Username: text(body.Username, 50)?.toLowerCase() || null,
      Phone: text(body.Phone, 20),
      Email: text(body.Email, 120)?.toLowerCase() || null,
      ServiceCenterId: body.ServiceCenterId || null,
      StateRights: rightsString(body.StateRights),
      Address: text(body.Address, 255),
      IsActive: body.IsActive === undefined ? true : Boolean(body.IsActive),
    };
    const password = typeof body.Password === "string" ? body.Password.trim() : "";
    if (!v.FirstName) throw new InputError("First name is required");
    if (!v.Username) throw new InputError("User name is required");
    if (!USERNAME.test(v.Username)) throw new InputError("User name: 3–50 lowercase letters, digits, dot, dash or underscore");
    if (!id && !password) throw new InputError("Password is required");
    if (password && password.length < 6) throw new InputError("Password must be at least 6 characters");
    if (v.Phone && !MOBILE.test(v.Phone)) throw new InputError("Enter a valid 10-digit mobile number");
    if (v.Email && !EMAIL.test(v.Email)) throw new InputError("Enter a valid e-mail address");
    if (!v.ServiceCenterId) throw new InputError("Select the service center of this engineer");

    const result = await inErpAndWarranty(async (run, erp, created) => {
      const center = (await run<any>(`SELECT [ServiceCenterId] FROM dbo.[ServiceCenters] WHERE [ServiceCenterId] = @id`, { id: v.ServiceCenterId }))[0];
      if (!center) throw new InputError("Selected service center was not found");
      if (await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Users] WHERE [Username] = @name${id ? " AND [UserId] <> @id" : ""}`, { name: v.Username, id }).then((r) => r.length)) throw new InputError(`User name ${v.Username} is already taken`);

      let engineer: any;
      if (id) {
        const current = (await run<any>(`SELECT [Role] FROM dbo.[Users] WITH (UPDLOCK) WHERE [UserId] = @id`, { id }))[0];
        if (!current) throw new InputError("Engineer not found");
        if (current.Role !== "ENGINEER") throw new InputError("This user is not a service engineer — edit it in User Management");
        if (id === user.UserId && !v.IsActive) throw new InputError("You cannot deactivate the user you are signed in as");
        const keys = Object.keys(v) as (keyof typeof v)[];
        engineer = (await run(`UPDATE dbo.[Users] SET ${keys.map((k) => `[${k}] = @${k}`).join(", ")}${password ? ", [Password] = @password" : ""}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId
          OUTPUT INSERTED.[UserId], INSERTED.[FirstName], INSERTED.[LastName], INSERTED.[Username] WHERE [UserId] = @id`, { ...v, password: password ? await hashPassword(password) : null, userId: user.UserId, id }))[0];
      } else {
        engineer = (await run(`INSERT INTO dbo.[Users] ([UserId], [Username], [Password], [FirstName], [LastName], [Email], [Phone], [Address], [Role], [StateRights], [FormRights], [ServiceCenterId], [IsActive], [IsAdmin], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          OUTPUT INSERTED.[UserId], INSERTED.[FirstName], INSERTED.[LastName], INSERTED.[Username]
          VALUES (@id, @Username, @password, @FirstName, @LastName, @Email, @Phone, @Address, 'ENGINEER', @StateRights, @forms, @ServiceCenterId, @IsActive, 0, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`,
          { ...v, id: randomUUID(), password: await hashPassword(password), forms: defaultFormsForRole("ENGINEER").join(","), userId: user.UserId }))[0];
      }

      // The engineer's ledger sits under the centre's ledger (the centre gets its ledger first if it has none yet).
      const ledger = (await syncEngineerLedger(run, erp, engineer.UserId, user.UserId, created))!;
      return { engineer, ledger };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: id ? "UPDATE" : "CREATE", tableName: "Users", recordId: result.engineer.UserId, details: { Username: v.Username, Role: "ENGINEER", ServiceCenterId: v.ServiceCenterId, ErpLedger: result.ledger.Code, Active: v.IsActive, PasswordChanged: Boolean(password) } });
    return NextResponse.json({ success: true, engineer: { ...result.engineer, LgrId: result.ledger.LgrId, LedgerCode: result.ledger.Code } });
  } catch (err) {
    return handleApiError(err, "Failed to save service engineer");
  }
}
