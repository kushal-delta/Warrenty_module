import { nextDocNo, type Run } from "@/lib/services/apiHelpers";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Warranty position of one component serial at a service call:
 *  - in      registered and in warranty today
 *  - out     registered, warranty ended (or replaced)
 *  - unreg   sticker exists but was never registered to a customer
 *  - unk     not in the sticker register at all
 */
export type SerialState = "in" | "out" | "unreg" | "unk";

export interface SerialWarranty {
  SerialNo: string;
  State: SerialState;
  Label: string;
  Category: string | null;
  ProductModelId: string | null;
  ModelName: string | null;
  StickerStatus: string | null;
  WarrantyId: string | null;
  WarrantyStatus: string | null;
  StartDate: string | null;
  EndDate: string | null;
  DaysLeft: number | null;
  InstallationId: string | null;
  CustomerId: string | null;
  DealerId: string | null;
  DealerName: string | null;
  CustomerName: string | null;
  CustomerMobile: string | null;
}

export async function serialWarranty(run: Run, serialNo: string): Promise<SerialWarranty> {
  const sn = String(serialNo || "").trim().toUpperCase();
  const sticker = (await run<any>(`SELECT TOP 1 s.[StickerId], s.[SerialNo], s.[Category], s.[Status], s.[ProductModelId], p.[ModelName] FROM dbo.[Stickers] s LEFT JOIN dbo.[ProductModels] p ON s.[ProductModelId] = p.[ProductModelId] WHERE s.[SerialNo] = @sn`, { sn }))[0];
  const warranty = (await run<any>(`SELECT TOP 1 w.*, p.[ModelName], d.[FirmName] AS [DealerName], cu.[CustomerName], cu.[Mobile] AS [CustomerMobile]
    FROM dbo.[Warranties] w LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId] = p.[ProductModelId] LEFT JOIN dbo.[Dealers] d ON w.[DealerId] = d.[DealerId] LEFT JOIN dbo.[Customers] cu ON w.[CustomerId] = cu.[CustomerId]
    WHERE w.[SerialNo] = @sn ORDER BY w.[StartDate] DESC`, { sn }))[0];

  const base = {
    SerialNo: sticker?.SerialNo || warranty?.SerialNo || sn,
    Category: sticker?.Category || warranty?.Category || null,
    ProductModelId: warranty?.ProductModelId || sticker?.ProductModelId || null,
    ModelName: warranty?.ModelName || sticker?.ModelName || null,
    StickerStatus: sticker?.Status || null,
    WarrantyId: warranty?.WarrantyId || null,
    WarrantyStatus: warranty?.Status || null,
    StartDate: warranty?.StartDate || null,
    EndDate: warranty?.EndDate || null,
    InstallationId: warranty?.InstallationId || null,
    CustomerId: warranty?.CustomerId || null,
    DealerId: warranty?.DealerId || null,
    DealerName: warranty?.DealerName || null,
    CustomerName: warranty?.CustomerName || null,
    CustomerMobile: warranty?.CustomerMobile || null,
  };
  if (!sticker && !warranty) return { ...base, State: "unk", Label: "Unknown serial", DaysLeft: null };
  if (!warranty) return { ...base, State: "unreg", Label: "Not registered", DaysLeft: null };
  const daysLeft = Math.ceil((new Date(warranty.EndDate).getTime() - Date.now()) / DAY);
  const inWarranty = warranty.Status === "Active" && daysLeft >= 0;
  return { ...base, State: inWarranty ? "in" : "out", Label: inWarranty ? "In warranty" : warranty.Status === "Replaced" ? "Replaced" : "Out of warranty", DaysLeft: inWarranty ? daysLeft : 0 };
}

/** Call-level warranty from its component states (prototype rule). */
export function overallWarranty(states: SerialState[]) {
  if (!states.length) return "Not Registered";
  const inCount = states.filter((s) => s === "in").length;
  if (inCount === states.length) return "In Warranty";
  if (inCount > 0) return "Partial";
  return states.includes("out") ? "Out of Warranty" : "Not Registered";
}

/** Next free call number SC/<fy>/NNNN — skips numbers already used (older calls were numbered outside the sequence). */
export async function nextComplaintNo(run: Run, userId: string) {
  for (let i = 0; i < 500; i++) {
    const no = await nextDocNo(run, "COMPLAINT", "SC", userId);
    const taken = await run(`SELECT TOP 1 1 AS [x] FROM dbo.[Complaints] WHERE [ComplaintNo] = @no`, { no });
    if (!taken.length) return no;
  }
  throw new Error("Could not allocate a service call number");
}
