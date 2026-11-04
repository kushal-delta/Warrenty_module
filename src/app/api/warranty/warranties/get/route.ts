import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { geoFilter, getScope, positionalParams } from "@/lib/auth/scope";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { category, status, search, limit = 5000 } = body;

    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const scope = await getScope(sessionUser);
    const where: string[] = [], params: unknown[] = [];
    const scopeFilter = geoFilter(scope, { state: "i.[StateId]", district: "i.[District]", dealer: "w.[DealerId]", customer: "w.[CustomerId]" }, positionalParams(params));
    if (scopeFilter) where.push(scopeFilter);
    if (category) { where.push(`w.[Category] = @p${params.length}`); params.push(category); } if (status) { where.push(`(w.[Status] = @p${params.length} OR (@p${params.length} = 'Expired' AND w.[EndDate] < SYSUTCDATETIME()))`); params.push(status); } if (search) { where.push(`(w.[SerialNo] LIKE @p${params.length} OR w.[WarrantyNo] LIKE @p${params.length} OR c.[CustomerName] LIKE @p${params.length} OR c.[Mobile] LIKE @p${params.length} OR d.[FirmName] LIKE @p${params.length})`); params.push(`%${search}%`); } params.push(Math.min(Number(limit) || 5000, 20000));
    const rows = await query<any>(`SELECT TOP (@p${params.length - 1}) w.*, i.[InstallNo], i.[Village], i.[District], i.[StateId] AS [SiteStateId], st.[StateName], st.[ShortName] AS [StateShort], c.[CustomerName], c.[Mobile] AS [CustomerMobile], d.[FirmName] AS [DealerName], p.[ModelName], p.[ModelCode] FROM dbo.[Warranties] w LEFT JOIN dbo.[Installations] i ON w.[InstallationId]=i.[InstallationId] LEFT JOIN dbo.[Customers] c ON w.[CustomerId]=c.[CustomerId] LEFT JOIN dbo.[Dealers] d ON w.[DealerId]=d.[DealerId] LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId]=p.[ProductModelId] LEFT JOIN dbo.[States] st ON i.[StateId]=st.[StateId]${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY w.[InsertedOn] DESC`, params);

    const now = new Date().getTime();
    const enriched = rows.map((r) => {
      const end = new Date(r.EndDate).getTime();
      const daysLeft = Math.ceil((end - now) / (1000 * 3600 * 24));
      const isExpired = daysLeft < 0;

      return {
        ...r,
        daysLeft: daysLeft > 0 ? daysLeft : 0,
        isExpired,
        effectiveStatus: isExpired ? "Expired" : r.Status,
      };
    });

    let filtered = enriched;
    if (category) {
      filtered = filtered.filter((w) => w.Category === category);
    }
    if (status) {
      filtered = filtered.filter((w) => w.effectiveStatus === status || w.Status === status);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (w) =>
          w.SerialNo.toLowerCase().includes(q) ||
          (w.WarrantyNo && w.WarrantyNo.toLowerCase().includes(q)) ||
          (w.CustomerName && w.CustomerName.toLowerCase().includes(q)) ||
          (w.CustomerMobile && w.CustomerMobile.includes(q)) ||
          (w.DealerName && w.DealerName.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({ success: true, warranties: filtered });
  } catch (err: any) {
    console.error("Warranties get error:", err);
    return NextResponse.json({ error: "Failed to fetch active warranties" }, { status: 500 });
  }
}
