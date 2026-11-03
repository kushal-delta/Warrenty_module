import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serialNo } = body;

    if (!serialNo) {
      return NextResponse.json({ error: "Serial number is required" }, { status: 400 });
    }

    const cleanSerial = String(serialNo).trim().toUpperCase();

    // 1. Check active Warranties table
    const wRows = await query<any>(`SELECT TOP 1 w.*, p.[ModelName], p.[ModelCode], c.[CustomerName], c.[Mobile] AS [CustomerMobile], i.[InstallNo], i.[InstallDate], i.[SiteAddress], i.[Village], i.[District], d.[FirmName] AS [DealerName] FROM dbo.[Warranties] w LEFT JOIN dbo.[Installations] i ON w.[InstallationId]=i.[InstallationId] LEFT JOIN dbo.[Customers] c ON w.[CustomerId]=c.[CustomerId] LEFT JOIN dbo.[Dealers] d ON w.[DealerId]=d.[DealerId] LEFT JOIN dbo.[ProductModels] p ON w.[ProductModelId]=p.[ProductModelId] WHERE w.[SerialNo]=@p0`, [cleanSerial]);

    if (wRows.length > 0) {
      const record = wRows[0];
      const now = new Date().getTime();
      const end = new Date(record.EndDate).getTime();
      const daysLeft = Math.ceil((end - now) / (1000 * 3600 * 24));
      const isUnderWarranty = daysLeft > 0 && record.Status === "Active";

      return NextResponse.json({
        success: true,
        found: true,
        isRegistered: true,
        isUnderWarranty,
        daysLeft: daysLeft > 0 ? daysLeft : 0,
        warrantyStatus: isUnderWarranty ? "In Warranty" : "Out of Warranty / Expired",
        data: record,
      });
    }

    // 2. Check Stickers table if registered or unregistered
    const sRows = await query<any>(`SELECT TOP 1 s.*, p.[ModelName], p.[ModelCode] FROM dbo.[Stickers] s LEFT JOIN dbo.[ProductModels] p ON s.[ProductModelId]=p.[ProductModelId] WHERE s.[SerialNo]=@p0`, [cleanSerial]);

    if (sRows.length > 0) {
      const sticker = sRows[0];
      return NextResponse.json({
        success: true,
        found: true,
        isRegistered: false,
        isUnderWarranty: false,
        warrantyStatus: "Unregistered Serial (In Stock / Generated)",
        sticker,
      });
    }

    return NextResponse.json({
      success: true,
      found: false,
      isRegistered: false,
      isUnderWarranty: false,
      warrantyStatus: "Serial Not Found in System",
    });
  } catch (err: any) {
    console.error("Warranty verify error:", err);
    return NextResponse.json({ error: "Failed to verify serial number" }, { status: 500 });
  }
}
