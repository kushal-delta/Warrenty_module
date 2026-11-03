import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { stockBalances, visibleStockLocations } from "@/lib/services/stock";

/** Current stock per location and spare, with good and faulty (damaged) quantities and stock value. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { locType, locId, spareId } = await request.json().catch(() => ({}));
    const visible = await visibleStockLocations(user);
    const locIds = locId ? (visible && !visible.includes(locId) ? [] : [locId]) : visible;
    const [balances, spares, centers, engineers] = await Promise.all([
      stockBalances(runQuery, { locIds, spareId }),
      query<any>(`SELECT [SpareId], [SpareCode], [SpareName], [Category], [Uom], [CurrentRate], [MinStock] FROM dbo.[Spares]`),
      query<any>(`SELECT [ServiceCenterId], [ServiceCenterName] FROM dbo.[ServiceCenters]`),
      query<any>(`SELECT [UserId], [FirstName], [LastName], [ServiceCenterId] FROM dbo.[Users] WHERE [Role] = 'ENGINEER'`),
    ]);
    const spareById = new Map(spares.map((s) => [s.SpareId, s]));
    const centerName = new Map(centers.map((c) => [c.ServiceCenterId, c.ServiceCenterName]));
    const engineerById = new Map(engineers.map((e) => [e.UserId, e]));

    // Fold the DAMAGED bin into its service-centre row so each store shows good + faulty side by side.
    const rows = new Map<string, any>();
    for (const b of balances) {
      const type = b.LocType === "DAMAGED" ? "SC" : b.LocType;
      if (locType && type !== locType) continue;
      const key = `${type}|${b.LocId}|${b.SpareId}`;
      const spare = spareById.get(b.SpareId) || {};
      const engineer = engineerById.get(b.LocId);
      const row = rows.get(key) || {
        key, LocType: type, LocId: b.LocId, SpareId: b.SpareId, Good: 0, Damaged: 0,
        LocName: type === "SC" ? centerName.get(b.LocId) || "Unknown store" : engineer ? `${engineer.FirstName} ${engineer.LastName || ""}`.trim() : "Unknown engineer",
        ServiceCenterName: type === "SC" ? centerName.get(b.LocId) : centerName.get(engineer?.ServiceCenterId),
        SpareCode: spare.SpareCode, SpareName: spare.SpareName, Category: spare.Category, Uom: spare.Uom, Rate: Number(spare.CurrentRate || 0), MinStock: Number(spare.MinStock || 0),
      };
      if (b.LocType === "DAMAGED") row.Damaged += Number(b.Balance); else row.Good += Number(b.Balance);
      rows.set(key, row);
    }
    const stock = Array.from(rows.values()).filter((r) => r.Good !== 0 || r.Damaged !== 0).map((r) => ({ ...r, Value: Number((r.Good * r.Rate).toFixed(2)), BelowMin: r.LocType === "SC" && r.Good < r.MinStock }));
    return NextResponse.json({ success: true, stock });
  } catch (err) {
    return handleApiError(err, "Failed to load stock balances");
  }
}
