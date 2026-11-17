import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, requireUser, text } from "@/lib/services/apiHelpers";
import { clearScopeCache } from "@/lib/auth/scope";

const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Optional decimal within a range; blank = null. */
function decimal(value: unknown, label: string, min: number, max: number) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new InputError(`${label} must be between ${min} and ${max}`);
  return n;
}

/**
 * Creates / updates a warehouse. Warehouses are kept in the warranty database only — no iERP ledger is created.
 * The warehouse manager (ManagerUserId) is a User Management user of role WAREHOUSE ("Warehouse Manager"); it is
 * stored in Warehouses.LoginUserId, which the stock screens already use to limit a manager to their warehouses.
 * One manager may run several warehouses. The manager's login is managed in User Management, not here.
 * Warehouses are never deleted — switch Active off instead.
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
      StateId: body.StateId || null,
    };
    const managerId = (body.ManagerUserId as string | undefined) || null;
    if (!v.WarehouseCode) throw new InputError("Warehouse code is required");
    if (!v.WarehouseName) throw new InputError("Warehouse name is required");
    if (!v.Location) throw new InputError("Location is required");
    if (!v.ContactNumber) throw new InputError("Contact number is required");
    if (!MOBILE.test(v.ContactNumber)) throw new InputError("Enter a valid 10-digit contact number");
    if (v.Email && !EMAIL.test(v.Email)) throw new InputError("Enter a valid e-mail address");
    if (!v.StateId) throw new InputError("State is required");
    if (!managerId) throw new InputError("Warehouse manager is required");

    const result = await inTransaction(async (run) => {
      if ((await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Warehouses] WHERE [WarehouseCode] = @code${id ? " AND [WarehouseId] <> @id" : ""}`, { code: v.WarehouseCode, id })).length) throw new InputError(`Warehouse code ${v.WarehouseCode} is already used`);
      if ((await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Warehouses] WHERE [WarehouseName] = @name${id ? " AND [WarehouseId] <> @id" : ""}`, { name: v.WarehouseName, id })).length) throw new InputError(`A warehouse named "${v.WarehouseName}" already exists`);

      let current: any = null;
      if (id) {
        current = (await run<any>(`SELECT [WarehouseId], [LoginUserId] FROM dbo.[Warehouses] WITH (UPDLOCK) WHERE [WarehouseId] = @id`, { id }))[0];
        if (!current) throw new InputError("Warehouse not found");
      }
      if (!(await run(`SELECT TOP 1 1 AS [x] FROM dbo.[States] WHERE [StateId] = @id`, { id: v.StateId })).length) throw new InputError("Selected state was not found");

      // Warehouse manager: a Warehouse Manager (role WAREHOUSE) user from User Management. An inactive manager is only
      // accepted when it is already this warehouse's manager (so the warehouse can still be edited or switched off).
      const previousManager: string | null = current?.LoginUserId || null;
      const manager = (await run<any>(`SELECT TOP 1 [UserId], [Username], [IsActive] FROM dbo.[Users] WHERE [UserId] = @uid AND [Role] = 'WAREHOUSE'`, { uid: managerId }))[0];
      if (!manager) throw new InputError("Select a user with the role Warehouse Manager (User Management)");
      if (!manager.IsActive && manager.UserId !== previousManager) throw new InputError(`Warehouse manager ${manager.Username} is inactive in User Management`);
      const userId: string = manager.UserId;

      const keys = Object.keys(v) as (keyof typeof v)[];
      let warehouse: any;
      if (id) {
        warehouse = (await run(`UPDATE dbo.[Warehouses] SET ${keys.map((k) => `[${k}] = @${k}`).join(", ")}, [LoginUserId] = @loginUserId, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId OUTPUT INSERTED.* WHERE [WarehouseId] = @id`,
          { ...v, loginUserId: userId, userId: user.UserId, id }))[0];
      } else {
        warehouse = (await run(`INSERT INTO dbo.[Warehouses] ([WarehouseId], ${keys.map((k) => `[${k}]`).join(", ")}, [LoginUserId], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          OUTPUT INSERTED.* VALUES (@id, ${keys.map((k) => `@${k}`).join(", ")}, @loginUserId, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, { ...v, id: randomUUID(), loginUserId: userId, userId: user.UserId }))[0];
      }
      return { warehouse, userId, managerName: manager.Username as string, previousManager };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: id ? "UPDATE" : "CREATE", tableName: "Warehouses", recordId: result.warehouse.WarehouseId, details: { Code: v.WarehouseCode, Name: v.WarehouseName, Active: v.IsActive, Manager: result.managerName } });
    clearScopeCache(result.userId);
    if (result.previousManager && result.previousManager !== result.userId) clearScopeCache(result.previousManager);
    return NextResponse.json({ success: true, warehouse: { ...result.warehouse, ManagerUserId: result.userId, LoginUsername: result.managerName } });
  } catch (err) {
    return handleApiError(err, "Failed to save warehouse");
  }
}
