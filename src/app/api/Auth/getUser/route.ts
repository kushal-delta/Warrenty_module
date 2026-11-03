import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionFromRequest, signAuthToken } from "@/lib/auth/jwt";
import { query } from "@/lib/sqlserver";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Session expired or unauthenticated", code: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const rows = await query<any>(
      `SELECT TOP 1 [UserId], [Username], [FirstName], [LastName], [Email], [Phone], [Address], [Role], [StateRights], [DistrictRights], [FormRights], [ServiceCenterId], [IsAdmin], [IsActive]
       FROM dbo.[Users] WHERE [UserId] = @p0`,
      [sessionUser.UserId]
    );

    if (rows.length === 0 || !rows[0].IsActive) {
      return NextResponse.json({ error: "User not found or inactive" }, { status: 404 });
    }

    const user = rows[0];
    const response = NextResponse.json({ success: true, user });

    // Re-issue the session with the latest role and screen rights, so rights changed by an admin
    // apply on the user's next page load without signing out (the middleware reads them from the token).
    const token = await signAuthToken({
      UserId: user.UserId,
      Username: user.Username,
      FirstName: user.FirstName,
      LastName: user.LastName,
      Email: user.Email,
      Role: user.Role,
      IsAdmin: user.IsAdmin,
      ServiceCenterId: user.ServiceCenterId,
      FormRights: user.FormRights || null,
    });
    response.cookies.set("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 500 });
  }
}
