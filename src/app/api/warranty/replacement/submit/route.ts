import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, nextDocNo, requireUser, text } from "@/lib/services/apiHelpers";
import { getScope } from "@/lib/auth/scope";
import { transferWarranty } from "@/lib/services/replacements";
import { checkNew, checkOld } from "@/lib/services/replacementFlow";

/** Replace & transfer warranty: old serial (in warranty) → new serial; the balance warranty moves across. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const scope = await getScope(user);
    if (scope.portal === "CUSTOMER") return fail("Customers cannot replace products", 403);
    if (scope.portal === "DEALER" && !scope.dealerId) return fail("Your login is not linked to a dealer record. Ask the administrator to link it in User Management.", 403);
    const body = await request.json();
    const oldSerial = String(body.oldSerial || "").trim().toUpperCase();
    const newSerial = String(body.newSerial || "").trim().toUpperCase();
    if (!oldSerial) throw new InputError("Enter the old (faulty) serial number");
    if (!newSerial) throw new InputError("Enter the new (replacement) serial number");
    const reason = text(body.reason, 300);

    const result = await inTransaction(async (run) => {
      const old = await checkOld(run, scope, oldSerial);
      if (!old.verdict?.ok || !old.warranty) throw new InputError(old.verdict?.message || "The old serial cannot be replaced");
      const nw = await checkNew(run, newSerial, oldSerial, old.warranty);
      if (!nw?.ok) throw new InputError(nw?.message || "The new serial cannot be used");

      const replNo = await nextDocNo(run, "REPL", "REP", user.UserId);
      const replacementId = randomUUID();
      const dealerId = scope.portal === "DEALER" ? scope.dealerId : old.warranty.DealerId;
      await run(`INSERT INTO dbo.[Replacements] ([ReplacementId],[ReplNo],[ReplDate],[Source],[DealerId],[VoucherType],[ReceiptDate],[ReplacementType],[MakeSalesInvoice],[NoOfArticles],[Reason],[Status],[CreatedBy],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn])
        VALUES (@id,@no,SYSUTCDATETIME(),'Dealer',@dealer,'With Serial No',SYSUTCDATETIME(),'Invoice',0,1,@reason,'Closed',@by,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
        { id: replacementId, no: replNo, dealer: dealerId || null, reason, by: user.Username, userId: user.UserId });
      const transfer = await transferWarranty(run, oldSerial, newSerial, replNo, user.UserId, user.Username);
      await run(`INSERT INTO dbo.[ReplacementItemLns] ([ReplacementItemLnId],[ReplacementId],[LineNo],[Category],[InvoiceItem],[ReceivedItem],[OldSerialNo],[NewSerialNo],[Qty],[NetValue],[Location],[WarrantyDaysLeft],[Charges],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn])
        VALUES (NEWID(),@id,1,@category,@newModel,@oldModel,@old,@new,1,0,'Greater Noida HO',@days,0,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
        { id: replacementId, category: transfer.category, newModel: transfer.newModel, oldModel: transfer.oldModel, old: oldSerial, new: newSerial, days: transfer.daysLeft, userId: user.UserId });
      return { ReplacementId: replacementId, ReplNo: replNo, DaysLeft: transfer.daysLeft };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "CREATE", tableName: "Replacements", recordId: result.ReplacementId, details: { ReplNo: result.ReplNo, Old: oldSerial, New: newSerial, DaysLeft: result.DaysLeft } });
    return NextResponse.json({ success: true, replacement: result, message: `Replaced ${oldSerial} with ${newSerial} — ${result.DaysLeft} days of warranty carried over` });
  } catch (err) {
    return handleApiError(err, "Failed to replace the product");
  }
}
