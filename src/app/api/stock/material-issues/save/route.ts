import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, nextDocNo, requireUser, text } from "@/lib/services/apiHelpers";
import { issueWarehouses, warehouseBalances } from "@/lib/services/warehouseStock";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Saves a material issue (MI/26-27/0001): material issued out of a warehouse's stock.
 * Only items in stock at that warehouse can be issued, and no more than is available (checked again on save).
 * Code, name, unit and the carried rate are copied onto each line.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const warehouseId = body.WarehouseId as string | undefined;
    const issueDate = String(body.IssueDate || "");
    const purpose = text(body.Purpose, 200);
    const remarks = text(body.Remarks, 500);
    if (!DATE.test(issueDate)) throw new InputError("Issue date is required");
    if (issueDate > new Date().toISOString().slice(0, 10)) throw new InputError("Issue date cannot be in the future");
    if (!warehouseId) throw new InputError("Select the warehouse");
    if (!purpose) throw new InputError("Purpose is required");
    if (!(await issueWarehouses(user)).some((w: any) => String(w.WarehouseId).toLowerCase() === String(warehouseId).toLowerCase())) throw new InputError("You cannot issue from this warehouse");

    const rawLines: any[] = (Array.isArray(body.lines) ? body.lines : []).filter((l: any) => l && l.ItemKey);
    if (!rawLines.length) throw new InputError("Add at least one item");

    const saved = await inTransaction(async (run) => {
      // Serialise issues per warehouse so two people cannot issue the same last units at once.
      await run(`SELECT [WarehouseId] FROM dbo.[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [WarehouseId] = @id`, { id: warehouseId });
      const stock = new Map((await warehouseBalances(run, warehouseId)).map((s) => [s.key, s]));
      const seen = new Set<string>();
      const lines = rawLines.map((l, index) => {
        const key = String(l.ItemKey).toUpperCase();
        const item = stock.get(key);
        if (!item) throw new InputError(`Line ${index + 1}: this item is not in stock at the warehouse`);
        if (seen.has(key)) throw new InputError(`Line ${index + 1}: ${item.ItemName} is already on the issue`);
        seen.add(key);
        const qty = round3(Number(l.Qty));
        if (!(qty > 0)) throw new InputError(`Line ${index + 1}: enter a quantity for ${item.ItemName}`);
        if (qty > item.Available) throw new InputError(`Line ${index + 1}: only ${item.Available} of ${item.ItemName} is in stock`);
        return { item, qty, remarks: text(l.Remarks, 250) };
      });

      const issueId = randomUUID();
      const issueNo = await nextDocNo(run, "MATISSUE", "MI", user.UserId);
      await run(`INSERT INTO dbo.[MaterialIssues] ([MaterialIssueId], [IssueNo], [IssueDate], [WarehouseId], [Purpose], [Remarks], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
        VALUES (@id, @no, @date, @wh, @purpose, @remarks, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        { id: issueId, no: issueNo, date: issueDate, wh: warehouseId, purpose, remarks, userId: user.UserId });
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await run(`INSERT INTO dbo.[MaterialIssueItemLns] ([MaterialIssueItemLnId], [MaterialIssueId], [LineNo], [ItemSource], [ErpItmId], [SpareId], [ItemCode], [ItemName], [Uom], [Qty], [Rate], [Remarks], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          VALUES (NEWID(), @issueId, @lineNo, @source, @erpId, @spareId, @code, @name, @uom, @qty, @rate, @remarks, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, {
          issueId, lineNo: i + 1, source: l.item.ItemSource, erpId: l.item.ItemSource === "ERP" ? l.item.ItemId : null, spareId: l.item.ItemSource === "LOCAL" ? l.item.ItemId : null,
          code: l.item.ItemCode?.slice(0, 60) || null, name: l.item.ItemName.slice(0, 250), uom: l.item.Uom, qty: l.qty, rate: l.item.Rate, remarks: l.remarks, userId: user.UserId,
        });
      }
      return { issueId, issueNo, lines: lines.length, qty: lines.reduce((s, l) => s + l.qty, 0) };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "CREATE", tableName: "MaterialIssues", recordId: saved.issueId, details: { IssueNo: saved.issueNo, WarehouseId: warehouseId, Purpose: purpose, Lines: saved.lines, Qty: saved.qty } });
    return NextResponse.json({ success: true, issue: saved });
  } catch (err) {
    return handleApiError(err, "Failed to save the material issue");
  }
}
