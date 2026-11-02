import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  Warranties,
  Installations,
  Customers,
  Dealers,
  ProductModels,
  Stickers,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serialNo } = body;

    if (!serialNo) {
      return NextResponse.json({ error: "Serial number is required" }, { status: 400 });
    }

    const cleanSerial = String(serialNo).trim().toUpperCase();

    // 1. Check active Warranties table
    const wRows = await db
      .select({
        WarrantyId: Warranties.WarrantyId,
        WarrantyNo: Warranties.WarrantyNo,
        SerialNo: Warranties.SerialNo,
        Category: Warranties.Category,
        ModelName: ProductModels.ModelName,
        ModelCode: ProductModels.ModelCode,
        CustomerId: Warranties.CustomerId,
        CustomerName: Customers.CustomerName,
        CustomerMobile: Customers.Mobile,
        InstallNo: Installations.InstallNo,
        InstallDate: Installations.InstallDate,
        SiteAddress: Installations.SiteAddress,
        Village: Installations.Village,
        District: Installations.District,
        DealerName: Dealers.FirmName,
        StartDate: Warranties.StartDate,
        WarrantyMonths: Warranties.WarrantyMonths,
        EndDate: Warranties.EndDate,
        Status: Warranties.Status,
        ReplacedFromSerial: Warranties.ReplacedFromSerial,
      })
      .from(Warranties)
      .leftJoin(Installations, eq(Warranties.InstallationId, Installations.InstallationId))
      .leftJoin(Customers, eq(Warranties.CustomerId, Customers.CustomerId))
      .leftJoin(Dealers, eq(Warranties.DealerId, Dealers.DealerId))
      .leftJoin(ProductModels, eq(Warranties.ProductModelId, ProductModels.ProductModelId))
      .where(eq(Warranties.SerialNo, cleanSerial))
      .limit(1);

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
    const sRows = await db
      .select({
        StickerId: Stickers.StickerId,
        SerialNo: Stickers.SerialNo,
        Category: Stickers.Category,
        Status: Stickers.Status,
        ModelName: ProductModels.ModelName,
        ModelCode: ProductModels.ModelCode,
        InvoiceNo: Stickers.InvoiceNo,
        MfgDate: Stickers.MfgDate,
      })
      .from(Stickers)
      .leftJoin(ProductModels, eq(Stickers.ProductModelId, ProductModels.ProductModelId))
      .where(eq(Stickers.SerialNo, cleanSerial))
      .limit(1);

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
