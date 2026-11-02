import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { pool } from "@/db";

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
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "Status" = 'Registered') as registered,
          COUNT(*) FILTER (WHERE "Status" = 'Generated') as in_stock
        FROM "Stickers"
      `),
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "EndDate" >= NOW() AND "Status" = 'Active') as active,
          COUNT(*) FILTER (WHERE "EndDate" < NOW() OR "Status" = 'Void') as expired
        FROM "Warranties"
      `),
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "Status" = 'New') as new_count,
          COUNT(*) FILTER (WHERE "Status" = 'Assigned') as assigned_count,
          COUNT(*) FILTER (WHERE "Status" IN ('Resolved', 'Closed')) as closed_count
        FROM "Complaints"
      `),
      pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE "Status" = 'Approved') as approved
        FROM "Dealers"
      `),
      pool.query(`
        SELECT w."WarrantyNo", w."SerialNo", w."Category", w."StartDate", w."EndDate", c."CustomerName", i."District"
        FROM "Warranties" w
        LEFT JOIN "Customers" c ON w."CustomerId" = c."CustomerId"
        LEFT JOIN "Installations" i ON w."InstallationId" = i."InstallationId"
        ORDER BY w."InsertedOn" DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT cmp."ComplaintNo", cmp."CustomerName", cmp."Status", cmp."Priority", cmp."CallDate", ct."CallTypeName"
        FROM "Complaints" cmp
        LEFT JOIN "CallTypes" ct ON cmp."CallTypeId" = ct."CallTypeId"
        ORDER BY cmp."InsertedOn" DESC
        LIMIT 5
      `),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        stickers: stickersCount.rows[0],
        warranties: warrantiesCount.rows[0],
        complaints: complaintsCount.rows[0],
        dealers: dealersCount.rows[0],
        recentWarranties: recentWarranties.rows,
        recentComplaints: recentComplaints.rows,
      },
    });
  } catch (err: any) {
    console.error("Dashboard stats error:", err);
    return NextResponse.json({ error: "Failed to load dashboard metrics" }, { status: 500 });
  }
}
