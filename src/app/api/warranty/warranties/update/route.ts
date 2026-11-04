import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, dateValue, endOfToday, fail, handleApiError, inTransaction, numberValue, requireUser, text } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE, getScope } from "@/lib/auth/scope";
import { canEditWarranty, isHoUser, visibleWarranty } from "@/lib/services/warrantyAccess";

const MOBILE = /^[6-9]\d{9}$/;
const PIN = /^\d{6}$/;

/** End date = start + (period + extended) months, same day of month (clamped to month end). */
function addMonths(start: Date, months: number) {
  const d = new Date(start), day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

/**
 * Edit from the Active Warranty List (prototype rules):
 *  · customer & site (name, mobile, address, village, state, district, pincode) and dealer — head office and dealers;
 *  · warranty start date — head office and dealers; period, extended months and status (Active / Void) — head office only;
 *  · a changed start date or period recalculates the end date. Replaced warranties keep their status.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (!canEditWarranty(user)) return fail("You cannot edit warranties", 403);
    const scope = await getScope(user);
    const ho = isHoUser(user);
    const body = await request.json();
    if (!body.WarrantyId) return fail("WarrantyId is required");

    const v = {
      CustomerName: text(body.CustomerName, 120),
      Mobile: text(body.Mobile, 15),
      Address: text(body.Address, 300),
      Village: text(body.Village, 100),
      StateId: body.StateId || null,
      District: text(body.District, 80),
      Pincode: text(body.Pincode, 10),
      Remarks: text(body.Remarks, 300),
    };
    if (!v.CustomerName) throw new InputError("Customer name is required");
    if (!v.Mobile || !MOBILE.test(v.Mobile)) throw new InputError("Enter a valid 10-digit mobile number");
    if (!v.StateId) throw new InputError("State is required");
    if (!v.District) throw new InputError("District is required");
    if (v.Pincode && !PIN.test(v.Pincode)) throw new InputError("Pincode must be 6 digits");
    const startDate = dateValue(body.StartDate, "Warranty start date");
    if (startDate && startDate > endOfToday()) throw new InputError("Warranty start date cannot be in the future");

    const result = await inTransaction(async (run) => {
      const w = await visibleWarranty(run, user, body.WarrantyId, true);
      if (!w) throw new InputError(OUT_OF_SCOPE);
      if (!(await run(`SELECT TOP 1 1 AS [x] FROM dbo.[States] WHERE [StateId] = @id`, { id: v.StateId })).length) throw new InputError("Selected state was not found");

      // Dealer: a dealer login keeps its own dealer; others may pick any approved dealer (or none = direct).
      const dealerId = scope.portal === "DEALER" ? w.DealerId : (body.DealerId || null);
      if (dealerId && dealerId !== w.DealerId) {
        const dealer = (await run<any>(`SELECT [Status] FROM dbo.[Dealers] WHERE [DealerId] = @id`, { id: dealerId }))[0];
        if (!dealer) throw new InputError("Selected dealer was not found");
        if (dealer.Status && dealer.Status !== "Approved") throw new InputError("Only approved dealers can be selected");
      }

      const dup = (await run<any>(`SELECT TOP 1 [CustomerName] FROM dbo.[Customers] WHERE [Mobile] = @mobile AND [CustomerId] <> @id`, { mobile: v.Mobile, id: w.CustomerId }))[0];
      if (dup) throw new InputError(`Mobile ${v.Mobile} already belongs to customer ${dup.CustomerName}`);

      await run(`UPDATE dbo.[Customers] SET [CustomerName] = @CustomerName, [Mobile] = @Mobile, [Address] = @Address, [Village] = @Village, [StateId] = @StateId, [District] = @District, [Pincode] = @Pincode,
          [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [CustomerId] = @id`, { ...v, userId: user.UserId, id: w.CustomerId });

      const start = startDate || new Date(w.StartDate);
      const startChanged = Boolean(startDate) && startDate!.toISOString().slice(0, 10) !== new Date(w.StartDate).toISOString().slice(0, 10);
      await run(`UPDATE dbo.[Installations] SET [SiteAddress] = @Address, [Village] = @Village, [StateId] = @StateId, [District] = @District, [Pincode] = @Pincode, [DealerId] = @dealerId
          ${startChanged ? ", [InstallDate] = @start, [InvoiceDate] = COALESCE([InvoiceDate], @start)" : ""}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [InstallationId] = @id`,
        { ...v, dealerId, start, userId: user.UserId, id: w.InstallationId });

      // Head office only: period, extended months, status.
      let months = Number(w.WarrantyMonths || 0), extended = Number(w.ExtendedMonths || 0), status = w.Status;
      if (ho) {
        months = numberValue(body.WarrantyMonths ?? months, "Warranty period (months)", { required: true, integer: true, min: 1 })!;
        if (months > 120) throw new InputError("Warranty period cannot exceed 120 months");
        extended = numberValue(body.ExtendedMonths ?? extended, "Extended months", { integer: true }) ?? 0;
        if (extended > 60) throw new InputError("Extended months cannot exceed 60");
        if (w.Status !== "Replaced" && body.Status) {
          if (!["Active", "Void"].includes(body.Status)) throw new InputError("Status must be Active or Void");
          status = body.Status;
        }
      }
      const recalc = startChanged || months !== Number(w.WarrantyMonths || 0) || extended !== Number(w.ExtendedMonths || 0);
      const endDate = recalc ? addMonths(start, months + extended) : new Date(w.EndDate);
      const updated = (await run<any>(`UPDATE dbo.[Warranties] SET [DealerId] = @dealerId, [Remarks] = @Remarks, [WarrantyMonths] = @months, [ExtendedMonths] = @extended, [Status] = @status,
          [StartDate] = @start, [EndDate] = @end, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId OUTPUT INSERTED.[WarrantyNo], INSERTED.[SerialNo], INSERTED.[EndDate] WHERE [WarrantyId] = @id`,
        { dealerId, Remarks: v.Remarks, months, extended, status, start: recalc ? start : new Date(w.StartDate), end: endDate, userId: user.UserId, id: w.WarrantyId }))[0];
      return { ...updated, recalculated: recalc, previousEnd: w.EndDate };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "UPDATE", tableName: "Warranties", recordId: body.WarrantyId, details: { SerialNo: result.SerialNo, EndDate: result.EndDate, Recalculated: result.recalculated } });
    return NextResponse.json({ success: true, warranty: result });
  } catch (err) {
    return handleApiError(err, "Failed to update warranty");
  }
}
