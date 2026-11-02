import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import {
  Warranties,
  Installations,
  Customers,
  Dealers,
  ProductModels,
} from "@/db/schema";
import { desc, eq, and, ilike } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { category, status, search, limit = 100 } = body;

    const rows = await db
      .select({
        WarrantyId: Warranties.WarrantyId,
        WarrantyNo: Warranties.WarrantyNo,
        InstallationId: Warranties.InstallationId,
        InstallNo: Installations.InstallNo,
        SerialNo: Warranties.SerialNo,
        Category: Warranties.Category,
        ProductModelId: Warranties.ProductModelId,
        ModelName: ProductModels.ModelName,
        ModelCode: ProductModels.ModelCode,
        CustomerId: Warranties.CustomerId,
        CustomerName: Customers.CustomerName,
        CustomerMobile: Customers.Mobile,
        Village: Installations.Village,
        District: Installations.District,
        DealerId: Warranties.DealerId,
        DealerName: Dealers.FirmName,
        StartDate: Warranties.StartDate,
        WarrantyMonths: Warranties.WarrantyMonths,
        ExtendedMonths: Warranties.ExtendedMonths,
        EndDate: Warranties.EndDate,
        Status: Warranties.Status,
        RegisteredBy: Warranties.RegisteredBy,
        RegisteredOn: Warranties.RegisteredOn,
        WhatsappSent: Warranties.WhatsappSent,
        Remarks: Warranties.Remarks,
        InsertedOn: Warranties.InsertedOn,
      })
      .from(Warranties)
      .leftJoin(Installations, eq(Warranties.InstallationId, Installations.InstallationId))
      .leftJoin(Customers, eq(Warranties.CustomerId, Customers.CustomerId))
      .leftJoin(Dealers, eq(Warranties.DealerId, Dealers.DealerId))
      .leftJoin(ProductModels, eq(Warranties.ProductModelId, ProductModels.ProductModelId))
      .orderBy(desc(Warranties.InsertedOn))
      .limit(limit);

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
