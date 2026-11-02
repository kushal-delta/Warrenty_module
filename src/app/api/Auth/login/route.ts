import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signAuthToken } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

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
    const userRows = await db
      .select()
      .from(Users)
      .where(eq(Users.Username, username.trim()))
      .limit(1);

    if (userRows.length === 0) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    const user = userRows[0];

    // Password verification (for demo, simple comparison)
    if (user.Password !== password.trim()) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 }
      );
    }

    if (!user.IsActive) {
      return NextResponse.json(
        { error: "Your account is deactivated. Please contact administrator." },
        { status: 403 }
      );
    }

    // Update LastLogin
    await db
      .update(Users)
      .set({ LastLogin: new Date() })
      .where(eq(Users.UserId, user.UserId));

    const sessionPayload = {
      UserId: user.UserId,
      Username: user.Username,
      FirstName: user.FirstName,
      LastName: user.LastName,
      Email: user.Email,
      Role: user.Role,
      IsAdmin: user.IsAdmin,
      ServiceCenterId: user.ServiceCenterId,
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
