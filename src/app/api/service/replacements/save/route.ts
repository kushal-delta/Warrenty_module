import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, dateValue, endOfToday, fail, handleApiError, inTransaction, nextDocNo, numberValue, requireUser, text } from "@/lib/services/apiHelpers";
import { transferWarranty, untransferWarranty } from "@/lib/services/replacements";
import { insertAttachments, removeAttachmentFiles, removeSavedPhotos, savePdfs, type SavedPhoto } from "@/lib/services/attachments";
import { MAX_REPLACEMENT_PDFS, REPLACEMENT_STATUSES, REPLACEMENT_TYPES, VOUCHER_TYPES, WITHOUT_SERIAL } from "@/lib/config/service";
import { OUT_OF_SCOPE, callVisible, getScope } from "@/lib/auth/scope";

/**
 * Saves a replacement / return-pump voucher. Each line with an old and new serial transfers the balance
 * warranty to the new serial. On edit, serials of existing lines are locked; removed lines are reversed.
 *
 * Voucher type "Without Serial No" has nothing to trace a warranty from, so the replacement is out of warranty:
 * serial numbers are not taken and no warranty is transferred.
 * At least one PDF (documents: [{ fileName, dataUrl }] + kept existing minus removeDocumentIds) is mandatory.
 */
export async function POST(request: NextRequest) {
  let documents: SavedPhoto[] = [];
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (user.Role === "ENGINEER") return fail("Engineers cannot record replacements", 403);
    const scope = await getScope(user);
    if (scope.portal === "CUSTOMER") return fail("Customers cannot record replacements", 403);
    if (scope.portal === "DEALER" && !scope.dealerId) return fail("Your login is not linked to a dealer record. Ask the administrator to link it in User Management.", 403);
    const body = await request.json();
    const replDate = dateValue(body.ReplDate, "Replacement date", true)!;
    if (replDate > endOfToday()) throw new InputError("Replacement date cannot be in the future");
    const status = text(body.Status) || "Open";
    if (!REPLACEMENT_STATUSES.includes(status)) throw new InputError("Status is invalid");
    const replacementType = text(body.ReplacementType) || "Invoice";
    if (!REPLACEMENT_TYPES.includes(replacementType)) throw new InputError("Replacement type is invalid");
    const voucherType = text(body.VoucherType, 40) || "With Serial No";
    if (!VOUCHER_TYPES.includes(voucherType)) throw new InputError("Voucher type is invalid");
    const outOfWarranty = voucherType === WITHOUT_SERIAL;
    const header = {
      ReplDate: replDate,
      Source: body.ComplaintId ? "Service" : (text(body.Source) || "Dealer"),
      ComplaintId: body.ComplaintId || null,
      DealerId: scope.portal === "DEALER" ? scope.dealerId : body.DealerId || null,
      VoucherType: voucherType,
      DealerInvoiceNo: text(body.DealerInvoiceNo, 60),
      DealerInvoiceDate: dateValue(body.DealerInvoiceDate, "Dealer invoice date"),
      ReceiptDate: dateValue(body.ReceiptDate, "Receipt date"),
      Transporter: text(body.Transporter, 100),
      LrNo: text(body.LrNo, 60),
      LrDate: dateValue(body.LrDate, "LR date"),
      ReplacementType: replacementType,
      MakeSalesInvoice: Boolean(body.MakeSalesInvoice),
      NoOfArticles: numberValue(body.NoOfArticles, "No. of articles", { integer: true }),
      Reason: text(body.Reason, 300),
      Status: status,
      CnNo: text(body.CnNo, 50),
      CnAmount: numberValue(body.CnAmount, "Credit note amount"),
      Remarks: text(body.Remarks, 300),
    };
    if (header.CnAmount != null && !header.CnNo) throw new InputError("Enter the credit note number for the credit note amount");
    const lines = (Array.isArray(body.lines) ? body.lines : []).map((line: any, index: number) => ({
      ReplacementItemLnId: line.ReplacementItemLnId || null,
      Category: text(line.Category, 20)?.toUpperCase() || null,
      OldSerialNo: outOfWarranty ? null : text(line.OldSerialNo, 60)?.toUpperCase() || null,
      NewSerialNo: outOfWarranty ? null : text(line.NewSerialNo, 60)?.toUpperCase() || null,
      Qty: numberValue(line.Qty ?? 1, `Line ${index + 1} quantity`, { required: true, integer: true, min: 1 })!,
      NetValue: numberValue(line.NetValue, `Line ${index + 1} net value`),
      Location: text(line.Location, 80),
      RefInvoiceNo: text(line.RefInvoiceNo, 60),
      RefInvoiceDate: dateValue(line.RefInvoiceDate, `Line ${index + 1} invoice date`),
      Charges: numberValue(line.Charges, `Line ${index + 1} charges`),
      Remarks: text(line.Remarks, 300),
    }));
    if (!lines.length) throw new InputError("Add at least one replacement line");
    lines.forEach((line: any, index: number) => {
      if (!outOfWarranty && !line.ReplacementItemLnId && !line.OldSerialNo) throw new InputError(`Line ${index + 1}: old serial number is required`);
      if (line.OldSerialNo && line.NewSerialNo && line.OldSerialNo === line.NewSerialNo) throw new InputError(`Line ${index + 1}: old and new serial cannot be the same`);
    });
    const newSerials = lines.map((l: any) => l.NewSerialNo).filter(Boolean);
    if (new Set(newSerials).size !== newSerials.length) throw new InputError("The same new serial is used on more than one line");

    if (body.ComplaintId && !(await callVisible(scope, body.ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    documents = await savePdfs(body.documents, MAX_REPLACEMENT_PDFS);
    const requestedRemoval: string[] = (Array.isArray(body.removeDocumentIds) ? body.removeDocumentIds : []).map(String);
    const removedDocumentIds: string[] = [];
    const replacement = await inTransaction(async (run) => {
      if (header.ComplaintId) {
        const call = (await run<any>(`SELECT [DealerId] FROM dbo.[Complaints] WHERE [ComplaintId] = @id`, { id: header.ComplaintId }))[0];
        if (!call) throw new InputError("Selected service call was not found");
        header.DealerId = header.DealerId || call.DealerId || null;
      }
      const keys = Object.keys(header) as (keyof typeof header)[];
      let replacementId = body.ReplacementId as string | undefined, replNo: string, keptDocuments = 0;
      if (replacementId) {
        const stored = (await run<any>(`SELECT [VoucherType] FROM dbo.[Replacements] WHERE [ReplacementId] = @id`, { id: replacementId }))[0];
        if (stored && stored.VoucherType !== voucherType) throw new InputError("The voucher type cannot be changed after the replacement is saved");
        const updated = (await run<any>(`UPDATE dbo.[Replacements] SET ${keys.map((k) => `[${k}] = @${k}`).join(", ")}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId OUTPUT INSERTED.[ReplNo] WHERE [ReplacementId] = @id${scope.portal === "DEALER" ? " AND [DealerId] = @ownDealer" : ""}`, { ...header, userId: user.UserId, id: replacementId, ownDealer: scope.dealerId }))[0];
        if (!updated) throw new InputError("Replacement not found");
        replNo = updated.ReplNo;
        for (const documentId of requestedRemoval) {
          const gone = await run<any>(`DELETE FROM dbo.[Attachments] OUTPUT DELETED.[AttachmentId] AS [id] WHERE [AttachmentId] = @pid AND [ParentTable] = 'Replacements' AND [ParentId] = @id`, { pid: documentId, id: replacementId });
          gone.forEach((g) => removedDocumentIds.push(String(g.id)));
        }
        keptDocuments = Number((await run<any>(`SELECT COUNT(*) AS [n] FROM dbo.[Attachments] WHERE [ParentTable] = 'Replacements' AND [ParentId] = @id`, { id: replacementId }))[0].n);
        const existing = await run<any>(`SELECT * FROM dbo.[ReplacementItemLns] WHERE [ReplacementId] = @id`, { id: replacementId });
        const kept = new Set(lines.map((l: any) => l.ReplacementItemLnId).filter(Boolean).map((id: string) => id.toLowerCase()));
        for (const old of existing.filter((e) => !kept.has(String(e.ReplacementItemLnId).toLowerCase()))) {
          await untransferWarranty(run, old.OldSerialNo, old.NewSerialNo, user.UserId);
          await run(`DELETE FROM dbo.[ReplacementItemLns] WHERE [ReplacementItemLnId] = @id`, { id: old.ReplacementItemLnId });
        }
      } else {
        replacementId = randomUUID();
        replNo = await nextDocNo(run, "REPL", "REP", user.UserId);
        await run(`INSERT INTO dbo.[Replacements] ([ReplacementId],[ReplNo],${keys.map((k) => `[${k}]`).join(",")},[CreatedBy],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (@id,@replNo,${keys.map((k) => `@${k}`).join(",")},@createdBy,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`, { ...header, id: replacementId, replNo, createdBy: user.Username, userId: user.UserId });
      }

      // The supporting PDF (dealer letter, invoice, inspection report …) is mandatory.
      if (keptDocuments + documents.length < 1) throw new InputError("Attach at least one PDF document to the replacement");
      await insertAttachments(run, "Replacements", replacementId, documents, user.UserId);

      let lineNo = 0;
      for (const line of lines) {
        lineNo += 1;
        const commercial = { qty: line.Qty, netValue: line.NetValue, location: line.Location, refInvoiceNo: line.RefInvoiceNo, refInvoiceDate: line.RefInvoiceDate, charges: line.Charges, remarks: line.Remarks, lineNo, userId: user.UserId };
        if (line.ReplacementItemLnId) {
          await run(`UPDATE dbo.[ReplacementItemLns] SET [LineNo] = @lineNo, [Qty] = @qty, [NetValue] = @netValue, [Location] = @location, [RefInvoiceNo] = @refInvoiceNo, [RefInvoiceDate] = @refInvoiceDate, [Charges] = @charges, [Remarks] = @remarks, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [ReplacementItemLnId] = @id AND [ReplacementId] = @replacementId`, { ...commercial, id: line.ReplacementItemLnId, replacementId });
          continue;
        }
        const transfer = line.OldSerialNo && line.NewSerialNo ? await transferWarranty(run, line.OldSerialNo, line.NewSerialNo, replNo, user.UserId, user.Username) : null;
        // A dealer may only replace products they sold (the transaction rolls back otherwise).
        if (transfer && scope.portal === "DEALER" && String(transfer.dealerId || "").toLowerCase() !== String(scope.dealerId).toLowerCase()) throw new InputError(`Old serial ${line.OldSerialNo} was not sold by you`);
        if (transfer && !header.DealerId && transfer.dealerId) {
          header.DealerId = transfer.dealerId;
          await run(`UPDATE dbo.[Replacements] SET [DealerId] = @dealerId WHERE [ReplacementId] = @id`, { dealerId: transfer.dealerId, id: replacementId });
        }
        await run(`INSERT INTO dbo.[ReplacementItemLns] ([ReplacementItemLnId],[ReplacementId],[LineNo],[Category],[InvoiceItem],[ReceivedItem],[OldSerialNo],[NewSerialNo],[Qty],[NetValue],[Location],[RefInvoiceNo],[RefInvoiceDate],[WarrantyDaysLeft],[Charges],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (NEWID(),@replacementId,@lineNo,@category,@invoiceItem,@receivedItem,@oldSerial,@newSerial,@qty,@netValue,@location,@refInvoiceNo,@refInvoiceDate,@daysLeft,@charges,@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
          { ...commercial, replacementId, category: transfer?.category || line.Category, invoiceItem: transfer?.newModel || null, receivedItem: transfer?.oldModel || null, oldSerial: line.OldSerialNo, newSerial: line.NewSerialNo, daysLeft: transfer?.daysLeft ?? null });
      }
      return { ReplacementId: replacementId, ReplNo: replNo };
    });

    await removeAttachmentFiles(removedDocumentIds);
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: body.ReplacementId ? "UPDATE" : "CREATE", tableName: "Replacements", recordId: replacement.ReplacementId, details: { ReplNo: replacement.ReplNo, Lines: lines.length, Status: status, VoucherType: voucherType, OutOfWarranty: outOfWarranty, Documents: documents.length } });
    return NextResponse.json({ success: true, replacement: { ...replacement, OutOfWarranty: outOfWarranty } });
  } catch (err) {
    await removeSavedPhotos(documents);
    return handleApiError(err, "Failed to save replacement");
  }
}
