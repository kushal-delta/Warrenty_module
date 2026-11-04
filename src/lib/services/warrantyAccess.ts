import type { AuthSessionUser } from "@/lib/auth/jwt";
import { getScope, namedParams, warrantyFilter } from "@/lib/auth/scope";
import type { Run } from "@/lib/services/apiHelpers";

/** Prototype rights on the Active Warranty List: head office and dealers may edit / delete; head office alone changes the period and status. */
export const canEditWarranty = (user: AuthSessionUser) => user.IsAdmin || ["SUPER", "HO", "DEALER"].includes(user.Role);
export const isHoUser = (user: AuthSessionUser) => user.IsAdmin || user.Role === "SUPER" || user.Role === "HO";

/** One warranty row (with its installation and customer) when it is inside the user's rights, else null. */
export async function visibleWarranty(run: Run, user: AuthSessionUser, warrantyId: string, lock = false) {
  const values: Record<string, unknown> = { id: warrantyId };
  const filter = warrantyFilter(await getScope(user), "w", namedParams(values));
  return (await run<any>(`SELECT w.*, p.[ModelName], p.[ModelCode], i.[InstallNo], i.[InstallDate], i.[SiteAddress], i.[Village], i.[District], i.[StateId], i.[Pincode], i.[InvoiceNo], i.[InvoiceDate],
      c.[CustomerName], c.[Mobile] AS [CustomerMobile], d.[FirmName] AS [DealerName], d.[DealerCode]
    FROM dbo.[Warranties] w${lock ? " WITH (UPDLOCK)" : ""} LEFT JOIN dbo.[Installations] i ON w.[InstallationId] = i.[InstallationId] LEFT JOIN dbo.[Customers] c ON w.[CustomerId] = c.[CustomerId]
      LEFT JOIN dbo.[Dealers] d ON w.[DealerId] = d.[DealerId] LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId]
    WHERE w.[WarrantyId] = @id${filter ? ` AND ${filter}` : ""}`, values))[0] || null;
}
