import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, nextDocNo, requireUser, runQuery, text } from "@/lib/services/apiHelpers";
import { CHALLAN_TYPES, TRANSPORT_MODES, challanHasReceipts, challanScope, erpLocs, loadChallan, resolveChallanItems } from "@/lib/services/challans";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Creates / updates a delivery challan (number DC/26-27/0001): header, transport and the items sent.
 * A returnable challan needs an expected-back date. Items are re-checked against the iERP / Spares master and
 * their code, name and unit copied onto the line; value = quantity × value per unit.
 * A challan raised against a material request needs that request to be Approved (one challan per request).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const id = (body.DeliveryChallanId as string | undefined) || null;
    const v = {
      ChallanDate: String(body.ChallanDate || ""),
      ChallanType: body.ChallanType,
      Purpose: text(body.Purpose, 120),
      DispatchLocId: body.DispatchLocId || null,
      DispatchLocName: null as string | null,
      ExpectedBackBy: body.ExpectedBackBy ? String(body.ExpectedBackBy) : null,
      PartyKind: text(body.PartyKind, 120),
      WarehouseId: body.WarehouseId || null,
      ServiceCenterId: body.ServiceCenterId || null,
      MaterialRequestId: body.MaterialRequestId || null,
      TransporterName: text(body.TransporterName, 150),
      TransportMode: body.TransportMode || null,
      VehicleNo: text(body.VehicleNo, 30)?.toUpperCase() || null,
      LrNo: text(body.LrNo, 50),
      Remarks: text(body.Remarks, 500),
      TotalValue: 0,
    };
    if (!DATE.test(v.ChallanDate)) throw new InputError("Challan date is required");
    if (!CHALLAN_TYPES.includes(v.ChallanType)) throw new InputError("Select the challan type");
    if (!v.Purpose) throw new InputError("Select the purpose");
    if (!v.DispatchLocId) throw new InputError("Select the store it is dispatched from");
    if (v.ChallanType === "Returnable") {
      if (!v.ExpectedBackBy || !DATE.test(v.ExpectedBackBy)) throw new InputError("Expected back by is required for a returnable challan");
      if (v.ExpectedBackBy < v.ChallanDate) throw new InputError("Expected back by cannot be before the challan date");
    } else v.ExpectedBackBy = null;
    if (!v.WarehouseId) throw new InputError("Select the job worker (warehouse)");
    if (v.TransportMode && !TRANSPORT_MODES.includes(v.TransportMode)) throw new InputError("Select the mode of transport");

    const loc = (await erpLocs()).find((l) => String(l.LocId).toLowerCase() === String(v.DispatchLocId).toLowerCase());
    if (!loc) throw new InputError("Selected store was not found in the iERP");
    v.DispatchLocName = String(loc.Name).slice(0, 150);

    const rawLines: any[] = Array.isArray(body.lines) ? body.lines : [];
    const filled = rawLines.filter((l) => l && l.ItemKey);
    if (!filled.length) throw new InputError("Add at least one item");
    const items = await resolveChallanItems(user, filled.map((l) => String(l.ItemKey)));
    const seen = new Set<string>();
    const lines = filled.map((l, index) => {
      const item = items.get(String(l.ItemKey).toLowerCase());
      if (!item) throw new InputError(`Line ${index + 1}: item is no longer available`);
      if (seen.has(item.key.toLowerCase())) throw new InputError(`Line ${index + 1}: ${item.name} is already on the challan`);
      seen.add(item.key.toLowerCase());
      const qty = Math.round(Number(l.Qty) * 1000) / 1000;
      if (!(qty > 0)) throw new InputError(`Line ${index + 1}: enter a quantity for ${item.name}`);
      const rate = money(Number(l.Rate) || 0);
      if (rate < 0) throw new InputError(`Line ${index + 1}: value per unit cannot be negative`);
      return { item, qty, rate, amount: money(qty * rate), remarks: text(l.Remarks, 250) };
    });
    v.TotalValue = money(lines.reduce((s, l) => s + l.amount, 0));

    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const saved = await inTransaction(async (run) => {
      if (!(await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Warehouses] WHERE [WarehouseId] = @id`, { id: v.WarehouseId })).length) throw new InputError("Selected warehouse was not found");
      if (v.ServiceCenterId && !(await run(`SELECT TOP 1 1 AS [x] FROM dbo.[ServiceCenters] WHERE [ServiceCenterId] = @id`, { id: v.ServiceCenterId })).length) v.ServiceCenterId = null;
      if (v.MaterialRequestId) {
        const req = (await run<any>(`SELECT [Status] FROM dbo.[MaterialRequests] WITH (UPDLOCK) WHERE [MaterialRequestId] = @id`, { id: v.MaterialRequestId }))[0];
        if (!req) throw new InputError("Material request not found");
        if (req.Status !== "Approved") throw new InputError("Only an approved material request can be dispatched");
        if ((await run(`SELECT TOP 1 1 AS [x] FROM dbo.[DeliveryChallans] WHERE [MaterialRequestId] = @mr${id ? " AND [DeliveryChallanId] <> @id" : ""}`, { mr: v.MaterialRequestId, id })).length) throw new InputError("This material request already has a delivery challan");
      }
      let challanId = id, challanNo: string;
      if (id) {
        const current = await loadChallan(run, id, true);
        if (!current) throw new InputError("Delivery challan not found");
        if (scope && !(await run(`SELECT TOP 1 1 AS [ok] FROM dbo.[DeliveryChallans] d WHERE d.[DeliveryChallanId] = @id AND ${scope}`, { ...values, id })).length) throw new InputError(OUT_OF_SCOPE);
        if (current.Status !== "Dispatched") throw new InputError(`A challan that is ${String(current.Status).toLowerCase()} cannot be edited`);
        if (await challanHasReceipts(run, id)) throw new InputError("Goods have already been received against this challan — it can no longer be edited");
        challanNo = current.ChallanNo;
        const keys = Object.keys(v) as (keyof typeof v)[];
        await run(`UPDATE dbo.[DeliveryChallans] SET ${keys.map((k) => `[${k}] = @${k}`).join(", ")}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [DeliveryChallanId] = @id`, { ...v, userId: user.UserId, id });
        await run(`DELETE FROM dbo.[DeliveryChallanItemLns] WHERE [DeliveryChallanId] = @id`, { id });
      } else {
        challanId = randomUUID();
        challanNo = await nextDocNo(run, "DCHALLAN", "DC", user.UserId);
        const keys = Object.keys(v) as (keyof typeof v)[];
        await run(`INSERT INTO dbo.[DeliveryChallans] ([DeliveryChallanId], [ChallanNo], ${keys.map((k) => `[${k}]`).join(", ")}, [Status], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          VALUES (@id, @no, ${keys.map((k) => `@${k}`).join(", ")}, 'Dispatched', @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, { ...v, id: challanId, no: challanNo, userId: user.UserId });
      }
      for (let index = 0; index < lines.length; index++) {
        const l = lines[index];
        await run(`INSERT INTO dbo.[DeliveryChallanItemLns] ([DeliveryChallanItemLnId], [DeliveryChallanId], [LineNo], [ItemSource], [ErpItmId], [SpareId], [ItemCode], [ItemName], [Uom], [Qty], [Rate], [Amount], [Remarks], [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn])
          VALUES (NEWID(), @challanId, @lineNo, @source, @erpId, @spareId, @code, @name, @uom, @qty, @rate, @amount, @remarks, @userId, @userId, SYSUTCDATETIME(), SYSUTCDATETIME())`, {
          challanId, lineNo: index + 1, source: l.item.source, erpId: l.item.source === "ERP" ? l.item.id : null, spareId: l.item.source === "LOCAL" ? l.item.id : null,
          code: l.item.code?.slice(0, 60) || null, name: l.item.name.slice(0, 250), uom: l.item.uom, qty: l.qty, rate: l.rate, amount: l.amount, remarks: l.remarks, userId: user.UserId,
        });
      }
      return { challanId: challanId!, challanNo };
    });

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: id ? "UPDATE" : "CREATE", tableName: "DeliveryChallans", recordId: saved.challanId, details: { ChallanNo: saved.challanNo, Type: v.ChallanType, Purpose: v.Purpose, ServiceCenterId: v.ServiceCenterId, MaterialRequestId: v.MaterialRequestId, Lines: lines.length, TotalValue: v.TotalValue } });
    return NextResponse.json({ success: true, challan: await loadChallan(runQuery, saved.challanId) });
  } catch (err) {
    return handleApiError(err, "Failed to save delivery challan");
  }
}
