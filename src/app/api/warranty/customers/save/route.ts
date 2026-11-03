import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { query } from "@/lib/sqlserver";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, requireUser, text } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE, customerVisible, getScope, inGeoScope } from "@/lib/auth/scope";

const LANGUAGES = ["EN", "HI", "GU"];

/** Creates a customer, or updates one when CustomerId is supplied. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const body = await request.json();
    const values = {
      CustomerName: text(body.CustomerName, 120),
      Mobile: text(body.Mobile, 20),
      AltMobile: text(body.AltMobile, 20),
      Email: text(body.Email, 120),
      Address: text(body.Address, 300),
      Village: text(body.Village, 100),
      City: text(body.City, 80),
      District: text(body.District, 80),
      StateId: body.StateId || null,
      Pincode: text(body.Pincode, 12),
      Language: text(body.Language) || "EN",
    };
    if (!values.CustomerName) throw new InputError("Customer name is required");
    if (!values.Mobile || !/^[6-9]\d{9}$/.test(values.Mobile)) throw new InputError("Enter a valid 10-digit mobile number");
    if (values.AltMobile && !/^[6-9]\d{9}$/.test(values.AltMobile)) throw new InputError("Alternate mobile must be a valid 10-digit number");
    if (values.Pincode && !/^\d{6}$/.test(values.Pincode)) throw new InputError("Pincode must be 6 digits");
    if (values.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.Email)) throw new InputError("Email address is invalid");
    if (!LANGUAGES.includes(values.Language)) throw new InputError("Preferred language is invalid");
    const scope = await getScope(user);
    if (!inGeoScope(scope, values.StateId, values.District)) return fail(`${OUT_OF_SCOPE}. Choose a state and district you have rights to.`, 403);
    // Dealers / customers can update their own customer records but not create new ones (customers are created at warranty registration).
    if (!body.CustomerId && scope.portal) return fail("Customers are created automatically when a warranty is registered", 403);
    if (body.CustomerId && !(await customerVisible(scope, body.CustomerId))) return fail(OUT_OF_SCOPE, 403);
    // The mobile number is a customer's login, so they cannot change it themselves.
    if (scope.portal === "CUSTOMER" && values.Mobile !== scope.customerMobile) return fail("Your mobile number is your login — ask the dealer or head office to change it", 403);

    const duplicate = await query(`SELECT TOP 1 [CustomerId] FROM dbo.[Customers] WHERE [Mobile] = @p0 AND [CustomerId] <> @p1`, [values.Mobile, body.CustomerId || "00000000-0000-0000-0000-000000000000"]);
    if (duplicate.length) return fail("Another customer is already registered with this mobile number", 409);

    const keys = Object.keys(values) as (keyof typeof values)[];
    let customer: any;
    if (body.CustomerId) {
      customer = (await query(`UPDATE dbo.[Customers] SET ${keys.map((key, index) => `[${key}] = @p${index}`).join(", ")}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p${keys.length} OUTPUT INSERTED.* WHERE [CustomerId] = @p${keys.length + 1}`, [...keys.map((key) => values[key]), user.UserId, body.CustomerId]))[0];
      if (!customer) return fail("Customer not found", 404);
    } else {
      customer = (await query(`INSERT INTO dbo.[Customers] ([CustomerId], ${keys.map((key) => `[${key}]`).join(", ")}, [InsertedByUserId], [LastUpdatedByUserId], [InsertedOn], [LastUpdatedOn]) OUTPUT INSERTED.* VALUES (@p0, ${keys.map((_, index) => `@p${index + 1}`).join(", ")}, @p${keys.length + 1}, @p${keys.length + 1}, SYSUTCDATETIME(), SYSUTCDATETIME())`, [randomUUID(), ...keys.map((key) => values[key]), user.UserId]))[0];
    }

    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: body.CustomerId ? "UPDATE" : "CREATE", tableName: "Customers", recordId: customer.CustomerId, details: { CustomerName: customer.CustomerName, Mobile: customer.Mobile } });
    return NextResponse.json({ success: true, customer });
  } catch (err) {
    return handleApiError(err, "Failed to save customer");
  }
}
