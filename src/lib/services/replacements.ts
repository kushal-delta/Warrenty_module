import { randomUUID } from "crypto";
import { InputError, type Run } from "@/lib/services/apiHelpers";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Moves the balance warranty of an in-warranty serial to its replacement serial:
 * the old warranty and sticker become "Replaced"; a new warranty starts today on the new serial
 * and ends on the old end date. Returns the remaining warranty days and both model names.
 */
export async function transferWarranty(run: Run, oldSerial: string, newSerial: string, replNo: string, userId: string, username: string) {
  const old = (await run<any>(`SELECT TOP 1 w.*, p.[ModelName] FROM dbo.[Warranties] w WITH (UPDLOCK) LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId] WHERE w.[SerialNo] = @serial ORDER BY w.[StartDate] DESC`, { serial: oldSerial }))[0];
  if (!old) throw new InputError(`Old serial ${oldSerial} is not registered for warranty`);
  if (old.Status !== "Active" || new Date(old.EndDate) < new Date()) throw new InputError(`Old serial ${oldSerial} is not in warranty (${old.Status === "Active" ? "expired" : old.Status.toLowerCase()})`);

  const sticker = (await run<any>(`SELECT s.*, p.[ModelName] FROM dbo.[Stickers] s WITH (UPDLOCK) LEFT JOIN dbo.[ProductModels] p ON s.[ProductModelId] = p.[ProductModelId] WHERE s.[SerialNo] = @serial`, { serial: newSerial }))[0];
  if (!sticker) throw new InputError(`New serial ${newSerial} is not in the serial register`);
  if (["Registered", "Replaced"].includes(sticker.Status)) throw new InputError(`New serial ${newSerial} is already ${sticker.Status.toLowerCase()}`);
  const taken = await run(`SELECT TOP 1 [WarrantyId] FROM dbo.[Warranties] WHERE [SerialNo] = @serial`, { serial: newSerial });
  if (taken.length) throw new InputError(`New serial ${newSerial} already has a warranty`);
  if (String(sticker.Category).toUpperCase() !== String(old.Category).toUpperCase()) throw new InputError(`New serial ${newSerial} must be a ${String(old.Category).toLowerCase()}`);

  const daysLeft = Math.max(0, Math.ceil((new Date(old.EndDate).getTime() - Date.now()) / DAY));
  await run(`UPDATE dbo.[Warranties] SET [Status] = 'Replaced', [Remarks] = @remarks, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [WarrantyId] = @id`, { remarks: `Replaced by ${newSerial} under ${replNo}`, userId, id: old.WarrantyId });
  if (old.StickerId) await run(`UPDATE dbo.[Stickers] SET [Status] = 'Replaced', [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [StickerId] = @id`, { userId, id: old.StickerId });
  await run(`UPDATE dbo.[Stickers] SET [Status] = 'Registered', [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [StickerId] = @id`, { userId, id: sticker.StickerId });
  await run(
    `INSERT INTO dbo.[Warranties] ([WarrantyId],[WarrantyNo],[InstallationId],[SerialNo],[StickerId],[Category],[ProductModelId],[CustomerId],[DealerId],[StartDate],[WarrantyMonths],[ExtendedMonths],[EndDate],[Status],[ReplacedFromSerial],[RegisteredBy],[RegisteredOn],[WhatsappSent],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn])
     VALUES (@id,@no,@installationId,@serial,@stickerId,@category,@modelId,@customerId,@dealerId,SYSUTCDATETIME(),@months,@extended,@endDate,'Active',@oldSerial,@registeredBy,SYSUTCDATETIME(),0,@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
    { id: randomUUID(), no: `WR-${newSerial}`, installationId: old.InstallationId, serial: newSerial, stickerId: sticker.StickerId, category: old.Category, modelId: sticker.ProductModelId || old.ProductModelId, customerId: old.CustomerId, dealerId: old.DealerId, months: old.WarrantyMonths, extended: old.ExtendedMonths || 0, endDate: old.EndDate, oldSerial, registeredBy: username, remarks: `Replacement ${replNo} — balance warranty ${daysLeft} days`, userId }
  );
  return { daysLeft, category: old.Category, oldModel: old.ModelName || null, newModel: sticker.ModelName || null, dealerId: old.DealerId };
}

/** Reverses a transfer when a replacement line is removed. Blocked once the new serial has service calls. */
export async function untransferWarranty(run: Run, oldSerial: string | null, newSerial: string | null, userId: string) {
  if (!oldSerial || !newSerial) return;
  const fresh = (await run<any>(`SELECT [WarrantyId], [StickerId] FROM dbo.[Warranties] WHERE [SerialNo] = @serial AND [ReplacedFromSerial] = @oldSerial`, { serial: newSerial, oldSerial }))[0];
  if (!fresh) return;
  const calls = await run(`SELECT TOP 1 1 AS [x] FROM dbo.[ComplaintItemLns] WHERE [SerialNo] = @serial`, { serial: newSerial });
  if (calls.length) throw new InputError(`New serial ${newSerial} already has service calls, so the replacement cannot be reversed`);
  await run(`DELETE FROM dbo.[Warranties] WHERE [WarrantyId] = @id`, { id: fresh.WarrantyId });
  if (fresh.StickerId) await run(`UPDATE dbo.[Stickers] SET [Status] = 'Generated', [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [StickerId] = @id`, { userId, id: fresh.StickerId });
  const old = (await run<any>(`SELECT TOP 1 [WarrantyId], [StickerId] FROM dbo.[Warranties] WHERE [SerialNo] = @serial AND [Status] = 'Replaced' ORDER BY [StartDate] DESC`, { serial: oldSerial }))[0];
  if (old) {
    await run(`UPDATE dbo.[Warranties] SET [Status] = 'Active', [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [WarrantyId] = @id`, { userId, id: old.WarrantyId });
    if (old.StickerId) await run(`UPDATE dbo.[Stickers] SET [Status] = 'Registered', [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [StickerId] = @id`, { userId, id: old.StickerId });
  }
}
