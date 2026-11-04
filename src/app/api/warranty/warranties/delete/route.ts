import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, requireUser } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";
import { canEditWarranty, visibleWarranty } from "@/lib/services/warrantyAccess";

/**
 * Deletes a wrongly registered warranty (prototype rules): blocked when the serial has service call lines
 * (delete those calls first, or set the status to Void) or when a replacement made / used it.
 * The sticker goes back to "Printed" so it can be registered again; the installation is removed too when
 * this was its last warranty and nothing else refers to it.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (!canEditWarranty(user)) return fail("You cannot delete warranties", 403);
    const { WarrantyId } = await request.json().catch(() => ({}));
    if (!WarrantyId) return fail("WarrantyId is required");

    const result = await inTransaction(async (run) => {
      const w = await visibleWarranty(run, user, WarrantyId, true);
      if (!w) throw new InputError(OUT_OF_SCOPE);
      const calls = Number((await run<any>(`SELECT COUNT(*) AS [n] FROM dbo.[ComplaintItemLns] WHERE [SerialNo] = @serial`, { serial: w.SerialNo }))[0].n);
      if (calls) throw new InputError(`Serial ${w.SerialNo} has ${calls} service call line(s). Delete those service calls first, or set the warranty status to Void instead.`);
      if (w.Status === "Replaced" || w.ReplacedFromSerial) throw new InputError("This warranty was moved by a replacement — delete the replacement instead (it reverses the transfer).");

      await run(`DELETE FROM dbo.[Warranties] WHERE [WarrantyId] = @id`, { id: w.WarrantyId });
      if (w.StickerId) await run(`UPDATE dbo.[Stickers] SET [Status] = 'Printed', [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [StickerId] = @id AND [Status] = 'Registered'`, { userId: user.UserId, id: w.StickerId });

      let installationRemoved = false;
      if (w.InstallationId) {
        const left = await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Warranties] WHERE [InstallationId] = @id`, { id: w.InstallationId });
        const calls = await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Complaints] WHERE [InstallationId] = @id`, { id: w.InstallationId });
        if (!left.length && !calls.length) {
          await run(`DELETE FROM dbo.[Installations] WHERE [InstallationId] = @id`, { id: w.InstallationId });
          installationRemoved = true;
        }
      }
      return { WarrantyNo: w.WarrantyNo, SerialNo: w.SerialNo, installationRemoved };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "Warranties", recordId: WarrantyId, details: result });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return handleApiError(err, "Failed to delete warranty");
  }
}
