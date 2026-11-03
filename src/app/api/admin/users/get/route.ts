import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { search, role, activeOnly } = body;

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (role) { clauses.push(`[Role] = @p${params.length}`); params.push(role); }
    if (activeOnly !== undefined) { clauses.push(`[IsActive] = @p${params.length}`); params.push(Boolean(activeOnly)); }
    if (search) {
      const parameter = `@p${params.length}`;
      clauses.push(`([Username] LIKE ${parameter} OR [FirstName] LIKE ${parameter} OR [LastName] LIKE ${parameter} OR [Email] LIKE ${parameter})`);
      params.push(`%${search}%`);
    }
    const rows = await query(
      `SELECT [UserId], [Username], [FirstName], [LastName], [Email], [Phone], [Role], [IsActive], [IsAdmin], [LastLogin], [InsertedOn], [LastUpdatedOn], [StateRights], [DistrictRights], [FormRights], [ServiceCenterId]
       FROM dbo.[Users]${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""} ORDER BY [FirstName] ASC`, params);

    return NextResponse.json({ success: true, users: rows });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
