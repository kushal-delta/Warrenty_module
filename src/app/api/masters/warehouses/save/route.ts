import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, requireUser, text } from "@/lib/services/apiHelpers";
import { hashPassword } from "@/lib/auth/password";
import { defaultFormsForRole } from "@/lib/auth/forms";
import { clearScopeCache } from "@/lib/auth/scope";

const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9._-]{3,50}$/;

/** Optional decimal within a range; blank = null. */
function decimal(value: unknown, label: string, min: number, max: number) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new InputError(`${label} must be between ${min} and ${max}`);
  return n;
}

/**
 * Creates / updates a warehouse and its login (dbo.Users, role WAREHOUSE) in one transaction.
 * Warehouses are kept in the warranty database only — no iERP ledger is created.
 * A new warehouse needs a login user name and password; on edit, a blank password keeps the current one.
 * The login follows the warehouse's Active flag. Warehouses are never deleted — switch Active off instead.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const id = (body.WarehouseId as string | undefined) || null;
    const v = {
      WarehouseCode: text(body.WarehouseCode, 30)?.toUpperCase() || null,
      WarehouseName: text(body.WarehouseName, 150),
      Location: text(body.Location, 300),
      ContactNumber: text(body.ContactNumber, 20),
      Email: text(body.Email, 120)?.toLowerCase() || null,
      CapacitySqft: decimal(body.CapacitySqft, "Capacity (sq ft)", 0, 99999999),
      Latitude: decimal(body.Latitude, "Latitude", -90, 90),
      Longitude: decimal(body.Longitude, "Longitude", -180, 180),
      Description: text(body.Description, 500),
      IsActive: body.IsActive === undefined ? true : Boolean(body.IsActive),
    };
    const loginName = text(body.LoginUsername, 50)?.toLowerCase() || null;
    const loginPassword = typeof body.LoginPassword === "string" ? body.LoginPassword.trim() : "";
    if (!v.WarehouseCode) throw new InputError("Warehouse code is required");
    if (!v.WarehouseName) throw new InputError("Warehouse name is required");
    if (!v.Location) throw new InputError("Location is required");
    if (!v.ContactNumber) throw new InputError("Contact number is required");
    if (!MOBILE.test(v.ContactNumber)) throw new InputError("Enter a valid 10-digit contact number");
    if (v.Email && !EMAIL.test(v.Email)) throw new InputError("Enter a valid e-mail address");
    if (!loginName) throw new InputError("Login user name is required");
    if (!USERNAME.test(loginName)) throw new InputError("Login user name: 3–50 lowercase letters, digits, dot, dash or underscore");
    if (loginPassword && loginPassword.length < 6) throw new InputError("Login password must be at least 6 characters");

    const result = await inTransaction(async (run) => {
      if ((await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Warehouses] WHERE [WarehouseCode] = @code${id ? " AND [WarehouseId] <> @id" : ""}`, { code: v.WarehouseCode, id })).length) throw new InputError(`Warehouse code ${v.WarehouseCode} is already used`);
      if ((await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Warehouses] WHERE [WarehouseName] = @name${id ? " AND [WarehouseId] <> @id" : ""}`, { name: v.WarehouseName, id })).length) throw new InputError(`A warehouse named "${v.WarehouseName}" already exists`);

      let current: any = null;
      if (id) {
        current = (await run<any>(`SELECT [WarehouseId], [LoginUserId] FROM dbo.[Warehouses] WITH (UPDLOCK) WHERE [WarehouseId] = @id`, { id }))[0];
        if (!current) throw new InputError("Warehouse not found");
      }
      const loginId: string | null = current?.LoginUserId || null;
      if ((await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Users] WHERE [Username] = @name${loginId ? " AND [UserId] <> @uid" : ""}`, { name: loginName, uid: loginId })).length) throw new InputError(`User name ${loginName} is already taken`);

      // Warehouse login (role WAREHOUSE) — created / updated with the warehouse.
      const u = { Username: loginName, FirstName: v.WarehouseName!.slice(0, 80), Phone: v.ContactNumber, Email: v.Email, Address: v.Location!.slice(0, 255), IsActive: v.IsActive };
      let userId: string, loginCreated = false;
      if (loginId) {
        const keys = Object.keys(u) as (keyof typeof u)[];
        await run(`UPDATE dbo.[Users] SET ${keys.map((k) => `[${k}] = @${k}`).join(", ")}${loginPassword ? ", [Password] = @password" : ""}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [UserId] = @uid`,
          { ...u, password: loginPassword ? await hashPassword(loginPassword) : null, userId: user.UserId, uid: loginId });
        userId = loginId;
      } else {
        if (!loginPassword) throw new InputError("Login password is required");
        userId = randomUUID();
        loginCreated = true;
        await run(`INSERT INTO dbo.[Users] ([UserId], [Username], [Password], [FirstName], [Email], [Phone], [Address], [Role], [FormRights], [IsActive], [IsAdmin], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          VALUES (@uid, @Username, @password, @FirstName, @Email, @Phone, @Address, 'WAREHOUSE', @forms, @IsActive, 0, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`,
          { ...u, uid: userId, password: await hashPassword(loginPassword), forms: defaultFormsForRole("WAREHOUSE").join(",") || null, userId: user.UserId });
      }

      const keys = Object.keys(v) as (keyof typeof v)[];
      let warehouse: any;
      if (id) {
        warehouse = (await run(`UPDATE dbo.[Warehouses] SET ${keys.map((k) => `[${k}] = @${k}`).join(", ")}, [LoginUserId] = @loginUserId, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId OUTPUT INSERTED.* WHERE [WarehouseId] = @id`,
          { ...v, loginUserId: userId, userId: user.UserId, id }))[0];
      } else {
        warehouse = (await run(`INSERT INTO dbo.[Warehouses] ([WarehouseId], ${keys.map((k) => `[${k}]`).join(", ")}, [LoginUserId], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          OUTPUT INSERTED.* VALUES (@id, ${keys.map((k) => `@${k}`).join(", ")}, @loginUserId, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, { ...v, id: randomUUID(), loginUserId: userId, userId: user.UserId }))[0];
      }
      return { warehouse, userId, loginCreated };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: id ? "UPDATE" : "CREATE", tableName: "Warehouses", recordId: result.warehouse.WarehouseId, details: { Code: v.WarehouseCode, Name: v.WarehouseName, Active: v.IsActive, Login: loginName } });
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: result.loginCreated ? "CREATE" : "UPDATE", tableName: "Users", recordId: result.userId, details: { Username: loginName, Role: "WAREHOUSE", WarehouseId: result.warehouse.WarehouseId, Active: v.IsActive, PasswordChanged: Boolean(loginPassword) } });
    clearScopeCache(result.userId);
    return NextResponse.json({ success: true, warehouse: { ...result.warehouse, LoginUsername: loginName } });
  } catch (err) {
    return handleApiError(err, "Failed to save warehouse");
  }
}
