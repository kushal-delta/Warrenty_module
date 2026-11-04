import { randomBytes } from "crypto";
import { ierpQuery, query } from "@/lib/sqlserver";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/**
 * Administrators come from the Delta iERP database (SolarativeiERP.dbo.Users where IsAdmin = 1);
 * every other user is managed in this module's User Management.
 *
 * An iERP admin is mirrored into the warranty database's dbo.Users with the SAME UserId, because every
 * warranty table references dbo.Users (InsertedByUserId, ApproverUserId, ...). The mirror gets a random,
 * unusable local password, so it can only sign in through the iERP credentials, and is recorded in
 * ErpMasterLinks (SourceTable = TargetTable = 'Users').
 */
export interface ErpAdmin {
  UserId: string;
  UserName: string;
  Password: string | null;
  FirstName: string | null;
  LastName: string | null;
  Mobileno: string | null;
  EmailId: string | null;
  IsDisabled: boolean | null;
  IsEmpDisable: boolean | null;
}

const LINK = "Users";

export const erpAdminDisabled = (u: Pick<ErpAdmin, "IsDisabled" | "IsEmpDisable">) => Boolean(u.IsDisabled) || Boolean(u.IsEmpDisable);

/** The iERP admin with this user name, or null (also null when the iERP database cannot be reached). */
export async function findErpAdmin(username: string): Promise<ErpAdmin | null> {
  try {
    const rows = await ierpQuery<ErpAdmin>(
      `SELECT TOP 1 u.[UserId], u.[UserName], u.[Password], u.[FirstName], u.[LastName], u.[Mobileno], u.[EmailId], u.[IsDisabled], u.[IsEmpDisable]
       FROM dbo.[Users] u WHERE u.[IsAdmin] = 1 AND u.[UserName] = @p0`,
      [username]
    );
    return rows[0] || null;
  } catch (err: any) {
    console.warn("[iERP login] admin lookup skipped:", err?.message || err);
    return null;
  }
}

/** iERP passwords are compared as stored (constant-time); hashed values in scrypt format are also understood. */
export async function verifyErpPassword(password: string, admin: ErpAdmin) {
  if (admin.Password == null || admin.Password === "") return false;
  return (await verifyPassword(password, String(admin.Password).trim())) || (await verifyPassword(password, String(admin.Password)));
}

/** Creates / refreshes the local mirror of an iERP admin and returns the local dbo.Users row. */
export async function syncErpAdmin(admin: ErpAdmin) {
  const firstName = (admin.FirstName || admin.UserName || "Admin").trim().slice(0, 80);
  const lastName = admin.LastName?.trim().slice(0, 80) || null;
  const email = admin.EmailId?.trim().slice(0, 120) || null;
  const phone = admin.Mobileno?.trim().slice(0, 20) || null;

  const existing = (await query<any>(`SELECT [UserId] FROM dbo.[Users] WHERE [UserId] = @p0`, [admin.UserId]))[0];
  if (existing) {
    await query(
      `UPDATE dbo.[Users] SET [FirstName] = @p0, [LastName] = @p1, [Email] = @p2, [Phone] = @p3, [Role] = 'SUPER', [IsAdmin] = 1, [IsActive] = 1, [LastLogin] = SYSUTCDATETIME(), [LastUpdatedOn] = SYSUTCDATETIME() WHERE [UserId] = @p4`,
      [firstName, lastName, email, phone, admin.UserId]
    );
  } else {
    // A local user may already own this user name; then the mirror gets a suffix (sign-in still uses the iERP name).
    const taken = await query(`SELECT TOP 1 1 AS [x] FROM dbo.[Users] WHERE [Username] = @p0`, [admin.UserName]);
    const username = (taken.length ? `${admin.UserName}.ierp` : admin.UserName).slice(0, 50);
    await query(
      `INSERT INTO dbo.[Users] ([UserId], [Username], [Password], [FirstName], [LastName], [Email], [Phone], [Role], [IsActive], [IsAdmin], [LastLogin], [InsertedOn], [LastUpdatedOn])
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, 'SUPER', 1, 1, SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [admin.UserId, username, await hashPassword(randomBytes(32).toString("hex")), firstName, lastName, email, phone]
    );
  }
  await query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.[ErpMasterLinks] WHERE [SourceTable] = @p0 AND [SourceId] = @p1)
       INSERT INTO dbo.[ErpMasterLinks] ([SourceTable], [SourceId], [TargetTable], [TargetId]) VALUES (@p0, @p1, @p0, @p1)`,
    [LINK, admin.UserId]
  );
  return (await query<any>(`SELECT TOP 1 * FROM dbo.[Users] WHERE [UserId] = @p0`, [admin.UserId]))[0];
}

/** Whether a local user is the mirror of an iERP admin. */
export async function isErpUser(userId: string) {
  const rows = await query(`SELECT TOP 1 1 AS [x] FROM dbo.[ErpMasterLinks] WHERE [SourceTable] = @p0 AND [TargetId] = @p1`, [LINK, userId]);
  return rows.length > 0;
}

/**
 * For a mirrored user: is the account still an enabled admin in the iERP?
 * Returns true when the iERP cannot be reached, so an ERP outage does not lock admins out of an open session.
 */
export async function erpAdminStillValid(userId: string) {
  try {
    const row = (await ierpQuery<any>(`SELECT TOP 1 [IsAdmin], [IsDisabled], [IsEmpDisable] FROM dbo.[Users] WHERE [UserId] = @p0`, [userId]))[0];
    return Boolean(row && row.IsAdmin && !erpAdminDisabled(row));
  } catch (err: any) {
    console.warn("[iERP login] admin re-check skipped:", err?.message || err);
    return true;
  }
}

/** SQL fragment: 1 when the user row (alias) is an iERP admin mirror. */
export const ERP_USER_FLAG = (alias: string) =>
  `CASE WHEN EXISTS (SELECT 1 FROM dbo.[ErpMasterLinks] l WHERE l.[SourceTable] = 'Users' AND l.[TargetId] = ${alias}.[UserId]) THEN 1 ELSE 0 END`;
