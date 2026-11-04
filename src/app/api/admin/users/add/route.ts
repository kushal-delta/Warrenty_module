import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { randomUUID } from "crypto";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { hashPassword } from "@/lib/auth/password";
import { isFormRight, rightsString } from "@/lib/auth/forms";
import { InputError, runQuery, type Run } from "@/lib/services/apiHelpers";
import { inErpAndWarranty, syncEngineerLedger } from "@/lib/services/erpLedgers";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser?.IsAdmin) {
      return NextResponse.json({ error: "Unauthorized. Admin access required." }, { status: 403 });
    }

    const body = await request.json();
    const {
      Username,
      Password,
      FirstName,
      LastName,
      Email,
      Phone,
      Role,
      IsActive,
      IsAdmin,
    } = body;

    if (!Username || !Password || !FirstName || !Role) {
      return NextResponse.json(
        { error: "Username, password, first name and role are required" },
        { status: 400 }
      );
    }

    const VALID_ROLES = ["SUPER", "HO", "MANAGER", "ENGINEER", "SERVICE_CENTER", "DEALER", "CUSTOMER"];
    if (!VALID_ROLES.includes(Role)) {
      return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
    }

    // Check username uniqueness
    const existing = await query(`SELECT TOP 1 [UserId] FROM dbo.[Users] WHERE [Username] = @p0`, [Username.trim().toLowerCase()]);

    if (existing.length > 0) {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }

    const params = [randomUUID(), Username.trim().toLowerCase(), await hashPassword(Password.trim()), FirstName.trim(), LastName?.trim() || null, Email?.trim() || null, Phone?.trim() || null, Role, IsActive !== undefined ? Boolean(IsActive) : true, IsAdmin ? Boolean(IsAdmin) : false, sessionUser.UserId, sessionUser.UserId,
      rightsString(body.StateRights), rightsString(body.DistrictRights), rightsString(body.FormRights, isFormRight), body.ServiceCenterId || null, String(body.Address || "").trim().slice(0, 255) || null];
    const insert = async (run: Run) => (await run<any>(
      `INSERT INTO dbo.[Users] ([UserId], [Username], [Password], [FirstName], [LastName], [Email], [Phone], [Role], [IsActive], [IsAdmin], [InsertedByUserId], [LastUpdatedByUserId], [StateRights], [DistrictRights], [FormRights], [ServiceCenterId], [Address], [InsertedOn], [LastUpdatedOn])
       OUTPUT INSERTED.* VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15, @p16, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      Object.fromEntries(params.map((value, index) => [`p${index}`, value]))
    ))[0];
    // An engineer is also an iERP ledger ("Service Engineers" group) — same as the Service Engineers screen.
    const newUser = Role === "ENGINEER"
      ? await inErpAndWarranty(async (run, erp, created) => { const row = await insert(run); await syncEngineerLedger(run, erp, row.UserId, sessionUser.UserId, created); return row; })
      : await insert(runQuery);

    await saveAuditLog({
      userId: sessionUser.UserId,
      userName: sessionUser.Username,
      action: "CREATE",
      tableName: "Users",
      recordId: newUser.UserId,
      details: { Username: newUser.Username, Role: newUser.Role },
    });

    // Never return password
    const { Password: _pwd, ...safeUser } = newUser;

    return NextResponse.json({ success: true, user: safeUser });
  } catch (err: any) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json(
      { error: err.message || "Failed to create user" },
      { status: 500 }
    );
  }
}
