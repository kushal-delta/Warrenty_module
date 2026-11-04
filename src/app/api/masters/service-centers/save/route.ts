import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, requireUser, text } from "@/lib/services/apiHelpers";
import { centerLedgerInput, inErpAndWarranty, upsertErpLedger } from "@/lib/services/erpLedgers";

const MOBILE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN = /^\d{6}$/;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

/**
 * Creates / updates a service centre (fields as in the prototype) and, in the same save, its iERP ledger:
 * dbo.Lgrs under the "Service Center" group (code S0001, S0002 …) with the address in dbo.LgrAddresses.
 * Centres are never deleted (calls, stock and engineers refer to them) — set Active off instead.
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
      return { center, ledger };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: id ? "UPDATE" : "CREATE", tableName: "ServiceCenters", recordId: result.center.ServiceCenterId, details: { Code: v.ServiceCenterCode, Name: v.ServiceCenterName, ErpLedger: result.ledger.Code, Active: v.IsActive } });
    return NextResponse.json({ success: true, center: { ...result.center, LgrId: result.ledger.LgrId, LedgerCode: result.ledger.Code } });
  } catch (err) {
    return handleApiError(err, "Failed to save service center");
  }
}
