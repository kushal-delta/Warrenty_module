import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { execute, query } from "@/lib/sqlserver";
import { signAuthToken } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    // Query user by username
    const userRows = await query<any>(
      `SELECT TOP 1 * FROM dbo.[Users] WHERE [Username] = @p0`,
      [username.trim()]
    );

    if (userRows.length === 0) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const user = userRows[0];

    // Password verification against the scrypt hash (legacy plain-text rows are still accepted once)
    if (!(await verifyPassword(password.trim(), user.Password))) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Replace a legacy plain-text (or weaker) password with a fresh hash now that we know it is correct
    if (needsRehash(user.Password)) {
      await execute(`UPDATE dbo.[Users] SET [Password] = @p0 WHERE [UserId] = @p1`, [await hashPassword(password.trim()), user.UserId]);
    }

    if (!user.IsActive) {
      return NextResponse.json(
        { error: "Your account is deactivated. Please contact administrator." },
        { status: 403 }
      );
    }

    // Update LastLogin
    await execute(`UPDATE dbo.[Users] SET [LastLogin] = SYSUTCDATETIME() WHERE [UserId] = @p0`, [user.UserId]);

    const sessionPayload = {
      UserId: user.UserId,
      Username: user.Username,
      FirstName: user.FirstName,
      LastName: user.LastName,
      Email: user.Email,
      Role: user.Role,
      IsAdmin: user.IsAdmin,
      ServiceCenterId: user.ServiceCenterId,
      FormRights: user.FormRights || null,
    };

    const token = await signAuthToken(sessionPayload);

    // Write audit log
    await saveAuditLog({
      userId: user.UserId,
      userName: `${user.FirstName} ${user.LastName || ""}`.trim(),
      action: "LOGIN",
      tableName: "Users",
      recordId: user.UserId,
      details: { role: user.Role, ip: request.headers.get("x-forwarded-for") || "local" },
    });

    const response = NextResponse.json({
      success: true,
      token,
      user: sessionPayload,
    });

    // RULES §49: Set cookie for browser web app
    response.cookies.set("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    console.error("Login API Error:", err);
    return NextResponse.json(
      { error: "Internal server error occurred during login" },
      { status: 500 }
    );
  }
}
