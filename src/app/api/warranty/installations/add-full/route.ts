import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { beginTransaction, query, sql } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { OUT_OF_SCOPE, getScope, inGeoScope } from "@/lib/auth/scope";
import { randomUUID } from "crypto";

/** Creates customer, installation, sticker updates, and warranties as one SQL Server transaction. */
export async function POST(request: NextRequest) {
  // The transaction must be built on the connected pool (getSqlPool() is async) — see beginTransaction.
  let transaction: sql.Transaction | null = null;
  let started = false;
  try {
    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { customerId, customerName, mobile, dealerId, projectId, installDate, siteAddress, village, district, stateId, pincode, borewellDepthM, dynamicHeadM, panelKwp, invoiceNo, invoiceDate, remarks, components = [], email, language, consent = true } = body;
    if (!mobile || !customerName) return NextResponse.json({ error: "Customer name and mobile number are required" }, { status: 400 });
    if (!Array.isArray(components) || !components.length) return NextResponse.json({ error: "At least one product component serial is required" }, { status: 400 });
    // Required fields of the register-warranty form.
    const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
    if (!/^[6-9]\d{9}$/.test(String(mobile).trim())) return bad("Enter a valid 10-digit mobile number");
    if (!String(siteAddress || "").trim()) return bad("Address is required");
    if (!stateId) return bad("State is required");
    if (!String(district || "").trim()) return bad("District is required");
    if (!/^\d{6}$/.test(String(pincode || "").trim())) return bad("Pincode must be 6 digits");
    const customerEmail = String(email || "").trim() || null;
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return bad("Email address is invalid");
    const customerLanguage = ["EN", "HI", "GU"].includes(String(language || "").toUpperCase()) ? String(language).toUpperCase() : "EN";

    const currentUserId = sessionUser.UserId;
    const scope = await getScope(sessionUser);
    if (scope.portal && !(scope.dealerId || scope.customerId)) return NextResponse.json({ error: "Your login is not linked to a dealer / customer record. Ask the administrator to link it in User Management." }, { status: 403 });
    // A dealer registers under their own dealer code; a customer registers pumps to their own account.
    const pinnedDealerId = (scope.portal === "DEALER" ? scope.dealerId : dealerId) || null;
    if (pinnedDealerId) {
      const dealer = (await query<any>(`SELECT [Status] FROM dbo.[Dealers] WHERE [DealerId] = @p0`, [pinnedDealerId]))[0];
      if (dealer?.Status === "Blocked") return NextResponse.json({ error: "This dealer is blocked and cannot register warranties" }, { status: 403 });
    }
    if (!inGeoScope(scope, stateId, district)) return NextResponse.json({ error: `${OUT_OF_SCOPE}. Choose a state and district you have rights to.` }, { status: 403 });
    transaction = await beginTransaction(); started = true;
    const run = async <T = any>(statement: string, values: Record<string, unknown> = {}) => {
      const dbRequest = new sql.Request(transaction);
      Object.entries(values).forEach(([key, value]) => dbRequest.input(key, value as any));
      return (await dbRequest.query<T>(statement)).recordset;
    };

    let resolvedCustomerId = (scope.portal === "CUSTOMER" ? scope.customerId : customerId) as string | undefined;
    if (!resolvedCustomerId) {
      const existing = await run<any>(`SELECT TOP 1 [CustomerId] FROM dbo.[Customers] WHERE [Mobile] = @mobile`, { mobile: String(mobile).trim() });
      if (existing.length) {
        resolvedCustomerId = existing[0].CustomerId;
        // Keep the customer's profile current with what was entered (email only when given).
        await run(`UPDATE dbo.[Customers] SET [Email] = COALESCE(@email, [Email]), [Language] = @language, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [CustomerId] = @id`, { email: customerEmail, language: customerLanguage, userId: currentUserId, id: resolvedCustomerId });
      }
      else {
        const customer = await run<any>(`INSERT INTO dbo.[Customers] ([CustomerId],[CustomerName],[Mobile],[Address],[Village],[District],[StateId],[Pincode],[Language],[Email],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) OUTPUT INSERTED.[CustomerId] VALUES (@id,@name,@mobile,@address,@village,@district,@stateId,@pincode,@language,@email,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`, { language: customerLanguage, email: customerEmail, id: randomUUID(), name: String(customerName).trim(), mobile: String(mobile).trim(), address: siteAddress?.trim() || null, village: village?.trim() || null, district: district?.trim() || null, stateId: stateId || null, pincode: pincode?.trim() || null, userId: currentUserId });
        resolvedCustomerId = customer[0].CustomerId;
      }
    }

    const installDateObj = installDate ? new Date(installDate) : new Date();
    const count = await run<any>(`SELECT COUNT(*) AS [count] FROM dbo.[Installations]`);
    const installNo = `INS/26-27/${String(Number(count[0].count) + 1).padStart(4, "0")}`;
    const installationRows = await run<any>(`INSERT INTO dbo.[Installations] ([InstallationId],[InstallNo],[CustomerId],[DealerId],[InstallDate],[SiteAddress],[Village],[District],[StateId],[Pincode],[BorewellDepthM],[DynamicHeadM],[PanelKwp],[ProjectId],[InvoiceNo],[InvoiceDate],[RegisteredBy],[RegisteredOn],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) OUTPUT INSERTED.* VALUES (@id,@installNo,@customerId,@dealerId,@installDate,@siteAddress,@village,@district,@stateId,@pincode,@borewell,@dynamicHead,@panel,@projectId,@invoiceNo,@invoiceDate,@registeredBy,SYSUTCDATETIME(),@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`, { id: randomUUID(), installNo, customerId: resolvedCustomerId, dealerId: pinnedDealerId, installDate: installDateObj, siteAddress: siteAddress?.trim() || null, village: village?.trim() || null, district: district?.trim() || null, stateId: stateId || null, pincode: pincode?.trim() || null, borewell: borewellDepthM ? Number(borewellDepthM) : null, dynamicHead: dynamicHeadM ? Number(dynamicHeadM) : null, panel: panelKwp ? String(panelKwp) : null, projectId: projectId || null, invoiceNo: invoiceNo?.trim() || null, invoiceDate: invoiceDate ? new Date(invoiceDate) : null, registeredBy: sessionUser.Username, remarks: remarks?.trim() || null, userId: currentUserId });
    const installation = installationRows[0], warranties: any[] = [];

    for (const component of components) {
      const serialNo = String(component.serialNo || "").trim().toUpperCase(); if (!serialNo) continue;
      const sticker = await run<any>(`UPDATE dbo.[Stickers] SET [Status]='Registered',[LastUpdatedOn]=SYSUTCDATETIME(),[LastUpdatedByUserId]=@userId OUTPUT INSERTED.[StickerId], INSERTED.[ProductModelId], INSERTED.[Category] WHERE [SerialNo]=@serialNo`, { userId: currentUserId, serialNo });
      // Type and warranty period default to the sticker and its product model (form sends only the serial when it can).
      const modelId = component.productModelId || sticker[0]?.ProductModelId || null;
      const modelMonths = modelId && !component.warrantyMonths ? Number((await run<any>(`SELECT [WarrantyMonths] FROM dbo.[ProductModels] WHERE [ProductModelId] = @id`, { id: modelId }))[0]?.WarrantyMonths || 0) : 0;
      const months = Number(component.warrantyMonths || modelMonths || 24), endDate = new Date(installDateObj.getTime() + months * 30 * 24 * 60 * 60 * 1000);
      const warranty = await run<any>(`INSERT INTO dbo.[Warranties] ([WarrantyId],[WarrantyNo],[InstallationId],[SerialNo],[StickerId],[Category],[ProductModelId],[CustomerId],[DealerId],[StartDate],[WarrantyMonths],[ExtendedMonths],[EndDate],[Status],[RegisteredBy],[RegisteredOn],[WhatsappSent],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) OUTPUT INSERTED.* VALUES (@id,@warrantyNo,@installationId,@serialNo,@stickerId,@category,@productModelId,@customerId,@dealerId,@startDate,@months,0,@endDate,'Active',@registeredBy,SYSUTCDATETIME(),0,@remarks,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`, { id: randomUUID(), warrantyNo: `WR-${serialNo}`, installationId: installation.InstallationId, serialNo, stickerId: sticker[0]?.StickerId || null, category: String(component.category || sticker[0]?.Category || "PUMP").trim().toUpperCase(), productModelId: component.productModelId || sticker[0]?.ProductModelId || null, customerId: resolvedCustomerId, dealerId: pinnedDealerId, startDate: installDateObj, months, endDate, registeredBy: sessionUser.Username, remarks: `Installed under ${installNo}`, userId: currentUserId });
      warranties.push(warranty[0]);
    }
    // Customer agreed to updates → queue the warranty message and mark the warranties as sent.
    if (consent && warranties.length) {
      const lines = warranties.map((w) => `${w.Category} ${w.SerialNo} till ${new Date(w.EndDate).toLocaleDateString("en-GB")}`).join(", ");
      await run(`INSERT INTO dbo.[NotificationLogs] ([NotificationLogId],[Channel],[ToMobile],[Template],[Message],[RefType],[RefNo],[SentOn],[Status],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (NEWID(),'WhatsApp',@mobile,'WARRANTY_REGISTERED',@message,'Installation',@refNo,SYSUTCDATETIME(),'Queued',@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
        { mobile: String(mobile).trim(), message: `Dear ${String(customerName).trim()}, your Solartive warranty is registered (${installNo}): ${lines}.`, refNo: installNo, userId: currentUserId });
      await run(`UPDATE dbo.[Warranties] SET [WhatsappSent] = 1 WHERE [InstallationId] = @id`, { id: installation.InstallationId });
    }
    await transaction.commit(); started = false;
    await saveAuditLog({ userId: currentUserId, userName: sessionUser.Username, action: "CREATE", tableName: "Installations", recordId: installation.InstallationId, details: { InstallNo: installNo, Customer: customerName, WarrantiesCreated: warranties.map((w) => w.SerialNo) } });
    return NextResponse.json({ success: true, message: `Installation ${installNo} registered successfully with ${warranties.length} warranties`, installation, warranties });
  } catch (error: any) {
    if (started && transaction) await transaction.rollback().catch(() => undefined);
    console.error("Installation add-full error:", error);
    if (["2627", "2601"].includes(String(error?.number))) return NextResponse.json({ error: "One of the component serial numbers is already registered with an active warranty." }, { status: 409 });
    return NextResponse.json({ error: "Failed to register installation and warranties" }, { status: 500 });
  }
}
