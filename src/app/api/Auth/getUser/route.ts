import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { db } from "@/db";
import { Users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Session expired or unauthenticated", code: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const rows = await db
      .select({
        UserId: Users.UserId,
        Username: Users.Username,
        FirstName: Users.FirstName,
        LastName: Users.LastName,
        Email: Users.Email,
        Phone: Users.Phone,
        Address: Users.Address,
        Role: Users.Role,
        StateRights: Users.StateRights,
        DistrictRights: Users.DistrictRights,
        FormRights: Users.FormRights,
        ServiceCenterId: Users.ServiceCenterId,
        IsAdmin: Users.IsAdmin,
        IsActive: Users.IsActive,
      })
      .from(Users)
      .where(eq(Users.UserId, sessionUser.UserId))
      .limit(1);

    if (rows.length === 0 || !rows[0].IsActive) {
      return NextResponse.json({ error: "User not found or inactive" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 500 });
  }
}
