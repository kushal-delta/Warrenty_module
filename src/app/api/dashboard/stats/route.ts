import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";

export async function POST(request: NextRequest) {
  try {
    const [
      stickersCount,
      warrantiesCount,
      complaintsCount,
      dealersCount,
      recentWarranties,
      recentComplaints,
    ] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN [Status] = 'Registered' THEN 1 ELSE 0 END) as registered,
          SUM(CASE WHEN [Status] = 'Generated' THEN 1 ELSE 0 END) as in_stock
        FROM dbo.[Stickers]
      `),
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN [EndDate] >= SYSUTCDATETIME() AND [Status] = 'Active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN [EndDate] < SYSUTCDATETIME() OR [Status] = 'Void' THEN 1 ELSE 0 END) as expired
        FROM dbo.[Warranties]
      `),
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN [Status] = 'New' THEN 1 ELSE 0 END) as new_count,
          SUM(CASE WHEN [Status] = 'Assigned' THEN 1 ELSE 0 END) as assigned_count,
          SUM(CASE WHEN [Status] IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as closed_count
        FROM dbo.[Complaints]
      `),
      query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN [Status] = 'Approved' THEN 1 ELSE 0 END) as approved
        FROM dbo.[Dealers]
      `),
      query(`
        SELECT TOP 5 w.[WarrantyNo], w.[SerialNo], w.[Category], w.[StartDate], w.[EndDate], c.[CustomerName], i.[District]
        FROM dbo.[Warranties] w
        LEFT JOIN dbo.[Customers] c ON w.[CustomerId] = c.[CustomerId]
        LEFT JOIN dbo.[Installations] i ON w.[InstallationId] = i.[InstallationId]
        ORDER BY w.[InsertedOn] DESC
      `),
      query(`
        SELECT TOP 5 cmp.[ComplaintNo], cmp.[CustomerName], cmp.[Status], cmp.[Priority], cmp.[CallDate], ct.[CallTypeName]
        FROM dbo.[Complaints] cmp
        LEFT JOIN dbo.[CallTypes] ct ON cmp.[CallTypeId] = ct.[CallTypeId]
        ORDER BY cmp.[InsertedOn] DESC
      `),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        stickers: stickersCount[0],
        warranties: warrantiesCount[0],
        complaints: complaintsCount[0],
        dealers: dealersCount[0],
        recentWarranties,
        recentComplaints,
      },
    });
  } catch (err: any) {
    console.error("Dashboard stats error:", err);
    return NextResponse.json({ error: "Failed to load dashboard metrics" }, { status: 500 });
  }
}
