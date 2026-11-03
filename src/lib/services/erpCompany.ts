import { ierpQuery } from "@/lib/sqlserver";

export interface ErpCompany {
  CompanyId: string;
  CompanyName: string;
  Address?: string | null;
  City?: string | null;
  State?: string | null;
  Pincode?: string | null;
  Phone?: string | null;
  Mobile?: string | null;
  Email?: string | null;
  ServiceEmail?: string | null;
  Website?: string | null;
  Gstin?: string | null;
  Country?: string | null;
  Cin?: string | null;
  [key: string]: any;
}

export function normalizeCompany(raw: any): ErpCompany | null {
  if (!raw) return null;
  const addressParts = [raw.AddressLine1, raw.AddressLine2].filter(Boolean);
  const fullAddress = raw.Address || addressParts.join(", ") || null;
  return {
    ...raw,
    CompanyId: String(raw.CompanyId || ""),
    CompanyName: raw.Name || raw.CompanyName || "Solartive Techno Industries Pvt. Ltd.",
    Address: fullAddress,
    City: raw.City || null,
    State: raw.State || null,
    Pincode: raw.PINCode || raw.Pincode || null,
    Phone: raw.TelephoneNos || raw.Phone || null,
    Mobile: raw.MobileNo || raw.Mobile || null,
    Email: raw.EmailIDs || raw.Email || null,
    ServiceEmail: raw.ServiceEmailId || raw.ServiceEmail || null,
    Website: raw.Website || null,
    Gstin: raw.GSTNo || raw.Gstin || null,
    Country: raw.Country || "India",
    Cin: raw.CINNO || raw.Cin || null,
  };
}

export async function getErpCompany(): Promise<ErpCompany | null> {
  const rows = await ierpQuery("SELECT TOP 1 * FROM dbo.Company c");
  return normalizeCompany(rows[0]) || null;
}
