import { randomUUID } from "crypto";
import { beginIerpTransaction, beginTransaction, getIerpSqlPool, sql } from "@/lib/sqlserver";
import { InputError, type Run } from "@/lib/services/apiHelpers";

/**
 * Service centres and service engineers are also accounts in the Delta iERP (SolarativeiERP):
 * each one is a ledger (dbo.Lgrs) under its ledger group, with its address in dbo.LgrAddresses —
 * the same way the iERP's own ledger master saves a party.
 *
 *   Service centre  → group "Service Center"     · Lgrs.ServiceCenter = 'Yes'
 *   Service engineer → group "Service Engineers" · Lgrs.FieldService = 'Yes', UnderLgrId = the centre's ledger
 *
 * The warranty record and its ledger are tied through dbo.ErpMasterLinks
 * (SourceTable 'Lgrs', SourceId = LgrId, TargetTable 'ServiceCenters' / 'Users', TargetId = the warranty id).
 */
export const LEDGER_GROUPS = { center: "Service Center", engineer: "Service Engineers" } as const;
export type LedgerKind = keyof typeof LEDGER_GROUPS;
const TARGET_TABLE: Record<LedgerKind, string> = { center: "ServiceCenters", engineer: "Users" };
const ADDRESS_TYPE = "Billing ADDRESS";
/** iERP ledger codes are a prefix + 4-digit running number (C0057, V0163, E0663 …); a group's own Code is its prefix, else the general "E" series. */
const DEFAULT_CODE_PREFIX = "E";

export interface LedgerAddress {
  street?: string | null;
  city?: string | null;
  /** Warranty dbo.States id — mapped to the iERP State through ErpMasterLinks. */
  stateId?: string | null;
  district?: string | null;
  pincode?: string | null;
  gstin?: string | null;
  contactPerson?: string | null;
  mobile?: string | null;
  email?: string | null;
}
export interface LedgerInput {
  kind: LedgerKind;
  /** Warranty id of the service centre / engineer user. */
  targetId: string;
  name: string;
  mobile?: string | null;
  email?: string | null;
  active: boolean;
  /** Engineers: the iERP ledger of their service centre. */
  underLgrId?: string | null;
  address: LedgerAddress;
}

/** Named-parameter query on the iERP outside a transaction (same shape as `runQuery`). */
export const erpRun: Run = async (statement, values = {}) => {
  const request = (await getIerpSqlPool()).request();
  Object.entries(values).forEach(([key, value]) => request.input(key, value as any));
  return ((await request.query(statement)).recordset || []) as any[];
};

/**
 * Runs `work` with a transaction on BOTH databases. The iERP commits first; if the warranty commit then
 * fails, ledgers created in this call are removed again so no orphan account is left in the iERP.
 */
export async function inErpAndWarranty<T>(work: (run: Run, erp: Run, created: string[]) => Promise<T>): Promise<T> {
  const erpTx = await beginIerpTransaction();
  let warrantyTx: sql.Transaction;
  try { warrantyTx = await beginTransaction(); } catch (err) { await erpTx.rollback().catch(() => undefined); throw err; }
  const runner = (tx: sql.Transaction): Run => async (statement, values = {}) => {
    const request = new sql.Request(tx);
    Object.entries(values).forEach(([key, value]) => request.input(key, value as any));
    return ((await request.query(statement)).recordset || []) as any[];
  };
  const created: string[] = [];
  let result: T;
  try {
    result = await work(runner(warrantyTx), runner(erpTx), created);
  } catch (err) {
    await Promise.all([erpTx.rollback().catch(() => undefined), warrantyTx.rollback().catch(() => undefined)]);
    throw err;
  }
  try {
    await erpTx.commit();
  } catch (err) {
    await warrantyTx.rollback().catch(() => undefined);
    throw err;
  }
  try {
    await warrantyTx.commit();
  } catch (err) {
    await warrantyTx.rollback().catch(() => undefined);
    await removeErpLedgers(created).catch((cleanupErr) => console.error("[iERP ledger] could not remove ledgers after a failed save:", created, cleanupErr?.message || cleanupErr));
    throw err;
  }
  return result;
}

async function removeErpLedgers(ids: string[]) {
  if (!ids.length) return;
  const tx = await beginIerpTransaction();
  try {
    for (const id of ids) {
      const request = () => new sql.Request(tx).input("id", id);
      await request().query(`DELETE FROM dbo.[LgrAddresses] WHERE [LgrId] = @id`);
      await request().query(`DELETE FROM dbo.[Lgrs] WHERE [LgrId] = @id`);
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
}

/** The iERP ledger linked to a warranty record, or null. */
export async function linkedLedgerId(run: Run, kind: LedgerKind, targetId: string): Promise<string | null> {
  const row = (await run<any>(`SELECT TOP 1 [SourceId] FROM dbo.[ErpMasterLinks] WHERE [SourceTable] = 'Lgrs' AND [TargetTable] = @table AND [TargetId] = @id`, { table: TARGET_TABLE[kind], id: targetId }))[0];
  return row ? String(row.SourceId) : null;
}

/** Ledger code + group for every linked record of a kind (for list screens). Empty when the iERP cannot be reached. */
export async function ledgerInfo(run: Run, erp: Run, kind: LedgerKind): Promise<Map<string, { LgrId: string; Code: string | null; GroupName: string | null }>> {
  const links = await run<any>(`SELECT [SourceId], [TargetId] FROM dbo.[ErpMasterLinks] WHERE [SourceTable] = 'Lgrs' AND [TargetTable] = @table`, { table: TARGET_TABLE[kind] });
  const out = new Map<string, { LgrId: string; Code: string | null; GroupName: string | null }>();
  if (!links.length) return out;
  try {
    // Parameter list in chunks (the iERP database is at compatibility level 100 — no STRING_SPLIT).
    const ledgers: any[] = [];
    for (let i = 0; i < links.length; i += 500) {
      const chunk = links.slice(i, i + 500), values: Record<string, unknown> = {};
      chunk.forEach((l, j) => { values[`l${j}`] = l.SourceId; });
      ledgers.push(...(await erp<any>(`SELECT l.[LgrId], l.[Code], g.[Name] AS [GroupName] FROM dbo.[Lgrs] l LEFT JOIN dbo.[LgrGrps] g ON l.[LgrGrpId] = g.[LgrGrpId] WHERE l.[LgrId] IN (${chunk.map((_, j) => `@l${j}`).join(",")})`, values)));
    }
    const byLgr = new Map(ledgers.map((l) => [String(l.LgrId).toLowerCase(), l]));
    for (const link of links) {
      const ledger = byLgr.get(String(link.SourceId).toLowerCase());
      if (ledger) out.set(String(link.TargetId).toLowerCase(), { LgrId: String(ledger.LgrId), Code: ledger.Code, GroupName: ledger.GroupName });
    }
  } catch (err: any) {
    console.warn("[iERP ledger] lookup skipped:", err?.message || err);
  }
  return out;
}

/** Creates or updates the iERP ledger (+ default address) of a service centre / engineer and links it. Returns the LgrId and code. */
export async function upsertErpLedger(run: Run, erp: Run, input: LedgerInput, userId: string, created: string[]) {
  const name = input.name.trim().slice(0, 200);
  const group = (await erp<any>(`SELECT TOP 1 [LgrGrpId], [Code] FROM dbo.[LgrGrps] WHERE [Name] = @name`, { name: LEDGER_GROUPS[input.kind] }))[0];
  if (!group) throw new InputError(`Ledger group "${LEDGER_GROUPS[input.kind]}" was not found in the iERP. Create it in the iERP ledger group master first.`);

  // The iERP stamps its own user ids; a signed-in iERP admin is mirrored with the same id, anyone else is recorded as null.
  const erpUser = (await erp<any>(`SELECT TOP 1 [UserId] FROM dbo.[Users] WHERE [UserId] = @id`, { id: userId }))[0]?.UserId || null;

  let lgrId = await linkedLedgerId(run, input.kind, input.targetId);
  const exists = lgrId ? (await erp(`SELECT TOP 1 1 AS [x] FROM dbo.[Lgrs] WITH (UPDLOCK) WHERE [LgrId] = @id`, { id: lgrId })).length > 0 : false;

  // Ledger names are unique in the iERP.
  const clash = (await erp<any>(`SELECT TOP 1 [Code] FROM dbo.[Lgrs] WHERE [Name] = @name${lgrId ? " AND [LgrId] <> @id" : ""}`, { name, id: lgrId }))[0];
  if (clash) throw new InputError(`A ledger named "${name}" already exists in the iERP${clash.Code ? ` (${clash.Code})` : ""}. Use a different name.`);

  const ledger = {
    name, groupId: group.LgrGrpId, mobile: input.mobile?.slice(0, 50) || null, email: input.email?.slice(0, 50) || null,
    disabled: !input.active, underLgrId: input.underLgrId || null, userId: erpUser,
    serviceCenter: input.kind === "center" ? "Yes" : null, fieldService: input.kind === "engineer" ? "Yes" : null,
  };
  let code: string;
  if (exists) {
    const row = (await erp<any>(`UPDATE dbo.[Lgrs] SET [Name] = @name, [LgrGrpId] = @groupId, [MobileNo] = @mobile, [EmailId] = @email, [DisableStatus] = @disabled, [UnderLgrId] = @underLgrId,
        [ServiceCenter] = @serviceCenter, [FieldService] = @fieldService, [LastUpdatedOn] = GETDATE(), [LastUpdatedByUserId] = @userId OUTPUT INSERTED.[Code] WHERE [LgrId] = @id`, { ...ledger, id: lgrId }))[0];
    code = row?.Code;
  } else {
    lgrId = lgrId || randomUUID(); // a link whose ledger was removed in the iERP is re-created with the same id
    code = await nextLedgerCode(erp, String(group.Code || "").trim() || DEFAULT_CODE_PREFIX);
    const currency = (await erp<any>(`SELECT TOP 1 [CrncyId] FROM dbo.[Lgrs] WHERE [CrncyId] IS NOT NULL GROUP BY [CrncyId] ORDER BY COUNT(*) DESC`))[0]?.CrncyId || null;
    await erp(`INSERT INTO dbo.[Lgrs] ([LgrId],[Name],[LgrGrpId],[CrncyId],[IsDefault],[Code],[MobileNo],[EmailId],[DisableStatus],[UnderLgrId],[ServiceCenter],[FieldService],[IsNewCode],[IsTaxationRoundOff],
        [ApprovedDisapproved],[ApprovedDisapprovedOn],[ApprovedDisapprovedbyUserId],[InsertedOn],[LastUpdatedOn],[InsertedByUserId],[LastUpdatedByUserId])
      VALUES (@id,@name,@groupId,@currency,0,@code,@mobile,@email,@disabled,@underLgrId,@serviceCenter,@fieldService,0,0,'A',GETDATE(),@userId,GETDATE(),GETDATE(),@userId,@userId)`,
      { ...ledger, id: lgrId, currency, code });
    created.push(lgrId);
    await run(`IF NOT EXISTS (SELECT 1 FROM dbo.[ErpMasterLinks] WHERE [SourceTable] = 'Lgrs' AND [SourceId] = @lgr)
        INSERT INTO dbo.[ErpMasterLinks] ([SourceTable], [SourceId], [TargetTable], [TargetId]) VALUES ('Lgrs', @lgr, @table, @id)`, { lgr: lgrId, table: TARGET_TABLE[input.kind], id: input.targetId });
  }
  await upsertErpAddress(run, erp, lgrId!, input.address, erpUser);
  return { LgrId: lgrId!, Code: code };
}

/** Next code in a prefix series, read under lock so two saves never get the same number. */
async function nextLedgerCode(erp: Run, prefix: string) {
  // The iERP database runs at compatibility level 100 (no TRY_CAST): only all-digit tails are cast.
  const row = (await erp<any>(`SELECT MAX(CASE WHEN SUBSTRING([Code], LEN(@prefix) + 1, 20) NOT LIKE '%[^0-9]%' AND LEN([Code]) - LEN(@prefix) BETWEEN 1 AND 9
      THEN CAST(SUBSTRING([Code], LEN(@prefix) + 1, 20) AS int) END) AS [n]
    FROM dbo.[Lgrs] WITH (UPDLOCK, HOLDLOCK) WHERE [Code] LIKE @pattern`, { prefix, pattern: `${prefix}[0-9]%` }))[0];
  return `${prefix}${String(Number(row?.n || 0) + 1).padStart(4, "0")}`.slice(0, 50);
}

/** Writes the default billing address of a ledger, resolving the iERP state / district / country / GST type. */
async function upsertErpAddress(run: Run, erp: Run, lgrId: string, a: LedgerAddress, erpUser: string | null) {
  // State: warranty States are synced from the iERP State table (ErpMasterLinks 'State' → 'States').
  let erpStateId: string | null = null, stateName: string | null = null, districtId: string | null = null;
  if (a.stateId) {
    erpStateId = (await run<any>(`SELECT TOP 1 [SourceId] FROM dbo.[ErpMasterLinks] WHERE [SourceTable] = 'State' AND [TargetTable] = 'States' AND [TargetId] = @id`, { id: a.stateId }))[0]?.SourceId || null;
    if (!erpStateId) {
      const local = (await run<any>(`SELECT TOP 1 [StateName] FROM dbo.[States] WHERE [StateId] = @id`, { id: a.stateId }))[0];
      if (local) erpStateId = (await erp<any>(`SELECT TOP 1 [StateId] FROM dbo.[State] WHERE [Name] = @name`, { name: local.StateName }))[0]?.StateId || null;
    }
    if (erpStateId) stateName = (await erp<any>(`SELECT TOP 1 [Name] FROM dbo.[State] WHERE [StateId] = @id`, { id: erpStateId }))[0]?.Name || null;
    if (erpStateId && a.district) districtId = (await erp<any>(`SELECT TOP 1 [DistrictId] FROM dbo.[Districts] WHERE [StateId] = @state AND LTRIM(RTRIM([Name])) = @name`, { state: erpStateId, name: a.district.trim() }))[0]?.DistrictId || null;
  }
  const india = (await erp<any>(`SELECT TOP 1 [CountryId] FROM dbo.[LgrAddresses] WHERE [Country] = 'INDIA' AND [CountryId] IS NOT NULL GROUP BY [CountryId] ORDER BY COUNT(*) DESC`))[0]?.CountryId || null;
  const gstType = (await erp<any>(`SELECT TOP 1 [TextListId] FROM dbo.[TextLists] WHERE [Group] = 'GSTType' AND [Text] = @text`, { text: a.gstin ? "Registered" : "Unregistered" }))[0]?.TextListId || null;

  const values = {
    lgrId, street: a.street?.slice(0, 1000) || null, city: a.city?.slice(0, 50) || null, state: stateName?.slice(0, 50) || null, pin: a.pincode?.slice(0, 15) || null,
    country: "INDIA", countryId: india, stateId: erpStateId, districtId, district: districtId ? null : a.district?.slice(0, 50) || null,
    gstin: a.gstin?.slice(0, 50) || null, gstType, contact: a.contactPerson?.slice(0, 50) || null, mobile: a.mobile?.slice(0, 50) || null,
    email: a.email || null, addressType: ADDRESS_TYPE, userId: erpUser,
  };
  const current = (await erp<any>(`SELECT TOP 1 [LgrAddressId] FROM dbo.[LgrAddresses] WITH (UPDLOCK) WHERE [LgrId] = @lgrId ORDER BY [IsDefault] DESC, [InsertedOn]`, { lgrId }))[0];
  if (current) {
    await erp(`UPDATE dbo.[LgrAddresses] SET [StreetAddress] = @street, [City] = @city, [StateOrProvince] = @state, [ZipOrPostalCode] = @pin, [Country] = @country, [CountryId] = @countryId,
        [StateId] = @stateId, [DistrictId] = @districtId, [District] = @district, [GSTNo] = @gstin, [GSTTypeId] = @gstType, [ContactPerson1Name] = @contact, [ContactPerson1MobileNo] = @mobile,
        [MobileNo] = @mobile, [TelephoneNos] = @mobile, [EmailId1] = @email, [AddressType] = COALESCE([AddressType], @addressType), [IsDefault] = 1, [LastUpdatedOn] = GETDATE(), [LastUpdatedByUserId] = @userId
      WHERE [LgrAddressId] = @addressId`, { ...values, addressId: current.LgrAddressId });
  } else {
    await erp(`INSERT INTO dbo.[LgrAddresses] ([LgrAddressId],[LgrId],[StreetAddress],[City],[StateOrProvince],[ZipOrPostalCode],[Country],[CountryId],[StateId],[DistrictId],[District],[GSTNo],[GSTTypeId],
        [ContactPerson1Name],[ContactPerson1MobileNo],[MobileNo],[TelephoneNos],[EmailId1],[AddressType],[IsDefault],[InsertedOn],[LastUpdatedOn],[InsertedByUserId],[LastUpdatedByUserId])
      VALUES (NEWID(),@lgrId,@street,@city,@state,@pin,@country,@countryId,@stateId,@districtId,@district,@gstin,@gstType,@contact,@mobile,@mobile,@mobile,@email,@addressType,1,GETDATE(),GETDATE(),@userId,@userId)`, values);
  }
}

/** Makes sure a service centre has its iERP ledger (engineers sit under it) and returns its LgrId. */
export async function ensureCenterLedger(run: Run, erp: Run, serviceCenterId: string, userId: string, created: string[]) {
  const center = (await run<any>(`SELECT * FROM dbo.[ServiceCenters] WHERE [ServiceCenterId] = @id`, { id: serviceCenterId }))[0];
  if (!center) throw new InputError("Selected service center was not found");
  const linked = await linkedLedgerId(run, "center", serviceCenterId);
  if (linked && (await erp(`SELECT TOP 1 1 AS [x] FROM dbo.[Lgrs] WHERE [LgrId] = @id`, { id: linked })).length) return linked;
  return (await upsertErpLedger(run, erp, centerLedgerInput(center), userId, created)).LgrId;
}

/**
 * Brings a user's iERP ledger in line with the saved dbo.Users row (call inside `inErpAndWarranty`, after the user write):
 * an ENGINEER gets / updates its ledger under the centre's ledger; a user who is no longer an engineer has its ledger disabled.
 * Used by both Service Engineers and User Management, so the two screens always agree.
 */
export async function syncEngineerLedger(run: Run, erp: Run, userId: string, actorId: string, created: string[]) {
  const u = (await run<any>(`SELECT u.[UserId], u.[FirstName], u.[LastName], u.[Phone], u.[Email], u.[Address], u.[Role], u.[ServiceCenterId], u.[IsActive], sc.[StateId]
    FROM dbo.[Users] u LEFT JOIN dbo.[ServiceCenters] sc ON u.[ServiceCenterId] = sc.[ServiceCenterId] WHERE u.[UserId] = @id`, { id: userId }))[0];
  if (!u) return null;
  if (u.Role !== "ENGINEER") {
    const linked = await linkedLedgerId(run, "engineer", userId);
    if (linked) await erp(`UPDATE dbo.[Lgrs] SET [DisableStatus] = 1, [LastUpdatedOn] = GETDATE() WHERE [LgrId] = @id`, { id: linked });
    return null;
  }
  if (!u.ServiceCenterId) throw new InputError("Select the service center of this engineer");
  const name = [u.FirstName, u.LastName].filter(Boolean).join(" ");
  const underLgrId = await ensureCenterLedger(run, erp, u.ServiceCenterId, actorId, created);
  return upsertErpLedger(run, erp, {
    kind: "engineer", targetId: u.UserId, name, mobile: u.Phone, email: u.Email, active: Boolean(u.IsActive), underLgrId,
    address: { street: u.Address, stateId: u.StateId, contactPerson: name, mobile: u.Phone, email: u.Email },
  }, actorId, created);
}

/** Before a user is deleted: its iERP ledger is disabled (vouchers may still use it) and the link removed. */
export async function releaseUserLedger(run: Run, erp: Run, userId: string) {
  const linked = await linkedLedgerId(run, "engineer", userId);
  if (!linked) return;
  await erp(`UPDATE dbo.[Lgrs] SET [DisableStatus] = 1, [LastUpdatedOn] = GETDATE() WHERE [LgrId] = @id`, { id: linked });
  await run(`DELETE FROM dbo.[ErpMasterLinks] WHERE [SourceTable] = 'Lgrs' AND [SourceId] = @lgr AND [TargetTable] = 'Users'`, { lgr: linked });
}

/** Whether a warranty user has an iERP ledger link (decides if a User Management save must also touch the iERP). */
export async function hasUserLedger(run: Run, userId: string) {
  return Boolean(await linkedLedgerId(run, "engineer", userId));
}

export const centerLedgerInput = (c: any): LedgerInput => ({
  kind: "center", targetId: c.ServiceCenterId, name: c.ServiceCenterName, mobile: c.Mobile, email: c.Email, active: Boolean(c.IsActive),
  address: { street: c.Address, city: c.City, stateId: c.StateId, district: c.District, pincode: c.Pincode, gstin: c.Gstin, contactPerson: c.ContactPerson, mobile: c.Mobile, email: c.Email },
});
