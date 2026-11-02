import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db, pool } from "@/db";
import {
  Installations,
  Warranties,
  Stickers,
  Customers,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

/**
 * RULES §8: add-full endpoint creates parent Installation + all child Warranties
 * in a single atomic database transaction.
 */
export async function POST(request: NextRequest) {
  const client = await pool.connect();
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const {
      customerId,
      customerName,
      mobile,
      dealerId,
      projectId,
      installDate,
      siteAddress,
      village,
      district,
      stateId,
      pincode,
      borewellDepthM,
      dynamicHeadM,
      panelKwp,
      invoiceNo,
      invoiceDate,
      remarks,
      components = [], // [{ serialNo, category, productModelId, warrantyMonths }]
    } = body;

    if (!mobile || !customerName) {
      return NextResponse.json(
        { error: "Customer name and mobile number are required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(components) || components.length === 0) {
      return NextResponse.json(
        { error: "At least one product component serial (Pump, Motor, or Controller) is required" },
        { status: 400 }
      );
    }

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    await client.query("BEGIN");

    // 1. Resolve or Create Customer
    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId) {
      const custRes = await client.query(
        `SELECT "CustomerId" FROM "Customers" WHERE "Mobile" = $1 LIMIT 1`,
        [mobile.trim()]
      );

      if (custRes.rows.length > 0) {
        resolvedCustomerId = custRes.rows[0].CustomerId;
      } else {
        const newCustRes = await client.query(
          `INSERT INTO "Customers" (
            "CustomerName", "Mobile", "Address", "Village", "District", "StateId", "Pincode",
            "Language", "InsertedByUserId", "LastUpdatedByUserId"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'HI', $8, $8)
          RETURNING "CustomerId"`,
          [
            customerName.trim(),
            mobile.trim(),
            siteAddress?.trim() || null,
            village?.trim() || null,
            district?.trim() || null,
            stateId || null,
            pincode?.trim() || null,
            currentUserId,
          ]
        );
        resolvedCustomerId = newCustRes.rows[0].CustomerId;
      }
    }

    // 2. Generate unique InstallNo
    const installDateObj = installDate ? new Date(installDate) : new Date();
    const countRes = await client.query(`SELECT COUNT(*) as count FROM "Installations"`);
    const nextSeq = parseInt(countRes.rows[0].count, 10) + 1;
    const installNo = `INS/26-27/${String(nextSeq).padStart(4, "0")}`;

    // 3. Insert Installation record
    const instRes = await client.query(
      `INSERT INTO "Installations" (
        "InstallNo", "CustomerId", "DealerId", "InstallDate", "SiteAddress", "Village",
        "District", "StateId", "Pincode", "BorewellDepthM", "DynamicHeadM", "PanelKwp",
        "ProjectId", "InvoiceNo", "InvoiceDate", "RegisteredBy", "RegisteredOn", "Remarks",
        "InsertedByUserId", "LastUpdatedByUserId"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), $17, $18, $18)
      RETURNING *`,
      [
        installNo,
        resolvedCustomerId,
        dealerId || null,
        installDateObj,
        siteAddress?.trim() || null,
        village?.trim() || null,
        district?.trim() || null,
        stateId || null,
        pincode?.trim() || null,
        borewellDepthM ? Number(borewellDepthM) : null,
        dynamicHeadM ? Number(dynamicHeadM) : null,
        panelKwp ? String(panelKwp) : null,
        projectId || null,
        invoiceNo?.trim() || null,
        invoiceDate ? new Date(invoiceDate) : null,
        sessionUser?.Username || "Portal User",
        remarks?.trim() || null,
        currentUserId,
      ]
    );

    const installation = instRes.rows[0];
    const createdWarranties: any[] = [];

    // 4. Register Warranties for each component
    for (const comp of components) {
      const serialNo = String(comp.serialNo || "").trim().toUpperCase();
      if (!serialNo) continue;

      const category = String(comp.category || "PUMP").trim().toUpperCase();
      const warrantyMonths = Number(comp.warrantyMonths || 24);
      const endDate = new Date(installDateObj.getTime() + warrantyMonths * 30 * 24 * 3600 * 1000);
      const warrantyNo = `WR-${serialNo}`;

      // Mark sticker as registered if exists
      const stickerRes = await client.query(
        `UPDATE "Stickers" SET "Status" = 'Registered', "LastUpdatedOn" = NOW(), "LastUpdatedByUserId" = $1
         WHERE "SerialNo" = $2
         RETURNING "StickerId", "ProductModelId"`,
        [currentUserId, serialNo]
      );

      const stickerId = stickerRes.rows.length > 0 ? stickerRes.rows[0].StickerId : null;
      const modelId = comp.productModelId || (stickerRes.rows.length > 0 ? stickerRes.rows[0].ProductModelId : null);

      const wRes = await client.query(
        `INSERT INTO "Warranties" (
          "WarrantyNo", "InstallationId", "SerialNo", "StickerId", "Category",
          "ProductModelId", "CustomerId", "DealerId", "StartDate", "WarrantyMonths",
          "ExtendedMonths", "EndDate", "Status", "RegisteredBy", "RegisteredOn",
          "WhatsappSent", "Remarks", "InsertedByUserId", "LastUpdatedByUserId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, 'Active', $12, NOW(), false, $13, $14, $14)
        RETURNING *`,
        [
          warrantyNo,
          installation.InstallationId,
          serialNo,
          stickerId,
          category,
          modelId,
          resolvedCustomerId,
          dealerId || null,
          installDateObj,
          warrantyMonths,
          endDate,
          sessionUser?.Username || "Portal User",
          `Installed under ${installNo}`,
          currentUserId,
        ]
      );

      createdWarranties.push(wRes.rows[0]);
    }

    await client.query("COMMIT");

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "CREATE",
      tableName: "Installations",
      recordId: installation.InstallationId,
      details: {
        InstallNo: installation.InstallNo,
        Customer: customerName,
        WarrantiesCreated: createdWarranties.map((w) => w.SerialNo),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Installation ${installation.InstallNo} registered successfully with ${createdWarranties.length} warranties`,
      installation,
      warranties: createdWarranties,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Installation add-full error:", err);
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "One of the component serial numbers is already registered with an active warranty." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to register installation and warranties" }, { status: 500 });
  } finally {
    client.release();
  }
}
