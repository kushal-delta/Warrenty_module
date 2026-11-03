import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { callFilter, getScope, positionalParams } from "@/lib/auth/scope";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { status, serviceCenterId, engineerUserId, search, limit = 100 } = body;

    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const where: string[] = [], params: unknown[] = [];
    const scopeFilter = callFilter(await getScope(sessionUser), "c", positionalParams(params));
    if (scopeFilter) where.push(scopeFilter);
    if (status) { where.push(`c.[Status] = @p${params.length}`); params.push(status); }
    if (serviceCenterId) { where.push(`c.[ServiceCenterId] = @p${params.length}`); params.push(serviceCenterId); }
    if (engineerUserId) { where.push(`c.[EngineerUserId] = @p${params.length}`); params.push(engineerUserId); }
    if (search) { where.push(`(c.[ComplaintNo] LIKE @p${params.length} OR c.[CustomerName] LIKE @p${params.length} OR c.[Mobile] LIKE @p${params.length} OR c.[Village] LIKE @p${params.length} OR c.[District] LIKE @p${params.length})`); params.push(`%${search}%`); }
    params.push(Number(limit) || 100);
    const rows = await query<any>(`SELECT TOP (@p${params.length - 1}) c.*, ct.[CallTypeName], sc.[ServiceCenterName], p.[ProjectName], u.[FirstName] AS [EngineerFirstName], u.[LastName] AS [EngineerLastName] FROM dbo.[Complaints] c LEFT JOIN dbo.[CallTypes] ct ON c.[CallTypeId] = ct.[CallTypeId] LEFT JOIN dbo.[ServiceCenters] sc ON c.[ServiceCenterId] = sc.[ServiceCenterId] LEFT JOIN dbo.[Users] u ON c.[EngineerUserId] = u.[UserId] LEFT JOIN dbo.[Projects] p ON c.[ProjectId] = p.[ProjectId]${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY c.[InsertedOn] DESC`, params);

    const enriched = rows.map((c) => ({
      ...c,
      EngineerName: c.EngineerFirstName
        ? `${c.EngineerFirstName} ${c.EngineerLastName || ""}`.trim()
        : "Unassigned",
    }));

    let filtered = enriched;
    if (status) {
      filtered = filtered.filter((c) => c.Status === status);
    }
    if (serviceCenterId) {
      filtered = filtered.filter((c) => c.ServiceCenterId === serviceCenterId);
    }
    if (engineerUserId) {
      filtered = filtered.filter((c) => c.EngineerUserId === engineerUserId);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.ComplaintNo.toLowerCase().includes(q) ||
          c.CustomerName.toLowerCase().includes(q) ||
          c.Mobile.includes(q) ||
          (c.Village && c.Village.toLowerCase().includes(q)) ||
          (c.District && c.District.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({ success: true, complaints: filtered });
  } catch (err: any) {
    console.error("Complaints get error:", err);
    return NextResponse.json({ error: "Failed to fetch complaints" }, { status: 500 });
  }
}
