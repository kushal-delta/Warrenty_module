import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { hashPassword } from "@/lib/auth/password";
import { isErpUser } from "@/lib/services/erpUsers";
import { isFormRight, rightsString } from "@/lib/auth/forms";
import { clearScopeCache } from "@/lib/auth/scope";
import { InputError, runQuery, type Run } from "@/lib/services/apiHelpers";
import { hasUserLedger, inErpAndWarranty, syncEngineerLedger } from "@/lib/services/erpLedgers";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser?.IsAdmin) {
      return NextResponse.json({ error: "Unauthorized. Admin access required." }, { status: 403 });
    }

    const body = await request.json();
    const {
      UserId,
      FirstName,
      LastName,
      Email,
      Phone,
      Role,
      IsActive,
      IsAdmin,
      Password,
    } = body;

    if (!UserId || !FirstName || !Role) {
      return NextResponse.json({ error: "UserId, first name and role are required" }, { status: 400 });
    }

    const VALID_ROLES = ["SUPER", "HO", "MANAGER", "ENGINEER", "DEALER", "CUSTOMER"];
    if (!VALID_ROLES.includes(Role)) {
      return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
    }

    // Prevent editing your own IsAdmin flag
    if (UserId === sessionUser.UserId && IsAdmin === false) {
      return NextResponse.json(
        { error: "You cannot remove your own admin privileges." },
        { status: 400 }
      );
    }

    const updatePayload: Record<string, any> = {
      FirstName: FirstName.trim(),
      LastName: LastName?.trim() || null,
      Email: Email?.trim() || null,
      Phone: Phone?.trim() || null,
      Role,
      IsActive: IsActive !== undefined ? Boolean(IsActive) : true,
      IsAdmin: IsAdmin ? Boolean(IsAdmin) : false,
      LastUpdatedByUserId: sessionUser.UserId,
      LastUpdatedOn: new Date(),
    };

    // Access rights: blank = all. Only written when the form sends them, so older clients don't wipe rights.
    if ("StateRights" in body) updatePayload.StateRights = rightsString(body.StateRights);
    if ("DistrictRights" in body) updatePayload.DistrictRights = rightsString(body.DistrictRights);
    if ("FormRights" in body) updatePayload.FormRights = rightsString(body.FormRights, isFormRight);
    if ("ServiceCenterId" in body) updatePayload.ServiceCenterId = body.ServiceCenterId || null;
    if ("Address" in body) updatePayload.Address = String(body.Address || "").trim().slice(0, 255) || null;

    // Only update password if explicitly provided
    // iERP admins keep their iERP password; a local password would never be used.
    if (Password && Password.trim().length > 0 && !(await isErpUser(UserId))) {
      updatePayload.Password = await hashPassword(Password.trim());
    }

    const keys = Object.keys(updatePayload);
    const write = (run: Run) => run<any>(
      `UPDATE dbo.[Users] SET ${keys.map((key, index) => `[${key}] = @p${index}`).join(", ")} OUTPUT INSERTED.* WHERE [UserId] = @p${keys.length}`,
      Object.fromEntries([...keys.map((key) => updatePayload[key]), UserId].map((value, index) => [`p${index}`, value]))
    );
    // Engineers (or users that were engineers) keep their iERP ledger in step — same as the Service Engineers screen.
    const updated = Role === "ENGINEER" || (await hasUserLedger(runQuery, UserId))
      ? await inErpAndWarranty(async (run, erp, created) => { const rows = await write(run); if (rows.length) await syncEngineerLedger(run, erp, UserId, sessionUser.UserId, created); return rows; })
      : await write(runQuery);

    if (updated.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: sessionUser.UserId,
      userName: sessionUser.Username,
      action: "UPDATE",
      tableName: "Users",
      recordId: UserId,
      details: { Role, IsActive, IsAdmin, StateRights: updatePayload.StateRights, DistrictRights: updatePayload.DistrictRights, FormRights: updatePayload.FormRights },
    });
    clearScopeCache(UserId);

    const { Password: _pwd, ...safeUser } = updated[0];
    return NextResponse.json({ success: true, user: safeUser });
  } catch (err: any) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err.message || "Failed to update user" }, { status: 500 });
  }
}
