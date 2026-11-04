import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { ERP_USER_FLAG } from "@/lib/services/erpUsers";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { runQuery } from "@/lib/services/apiHelpers";
import { erpRun, ledgerInfo } from "@/lib/services/erpLedgers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { search, role, activeOnly } = body;

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (role) { clauses.push(`u.[Role] = @p${params.length}`); params.push(role); }
    if (activeOnly !== undefined) { clauses.push(`u.[IsActive] = @p${params.length}`); params.push(Boolean(activeOnly)); }
    if (search) {
      const parameter = `@p${params.length}`;
      clauses.push(`(u.[Username] LIKE ${parameter} OR u.[FirstName] LIKE ${parameter} OR u.[LastName] LIKE ${parameter} OR u.[Email] LIKE ${parameter})`);
      params.push(`%${search}%`);
    }
    const [rows, ledgers] = await Promise.all([
      query<any>(
        `SELECT u.[UserId], u.[Username], u.[FirstName], u.[LastName], u.[Email], u.[Phone], u.[Address], u.[Role], u.[IsActive], u.[IsAdmin], u.[LastLogin], u.[InsertedOn], u.[LastUpdatedOn], u.[StateRights], u.[DistrictRights], u.[FormRights], u.[ServiceCenterId], sc.[ServiceCenterName], ${ERP_USER_FLAG("u")} AS [IsErpUser]
         FROM dbo.[Users] u LEFT JOIN dbo.[ServiceCenters] sc ON u.[ServiceCenterId] = sc.[ServiceCenterId]${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY u.[FirstName] ASC`, params),
      ledgerInfo(runQuery, erpRun, "engineer"),
    ]);
    // Engineers carry the code of their iERP ledger (Service Engineers group).
    const users = rows.map((u) => ({ ...u, LedgerCode: ledgers.get(String(u.UserId).toLowerCase())?.Code || null }));

    return NextResponse.json({ success: true, users });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
