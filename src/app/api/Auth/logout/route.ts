import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { isHttpsRequest } from "@/lib/auth/token";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  // Audit is best-effort: a DB hiccup must never leave the user signed in.
  try {
    const user = await sessionFromRequest(request);
    if (user) {
      await saveAuditLog({
        userId: user.UserId,
        userName: user.Username,
        action: "LOGOUT",
        tableName: "Users",
        recordId: user.UserId,
      });
    }
  } catch (err: any) {
    console.error("Logout audit failed:", err?.message || err);
  }

  const response = NextResponse.json({ success: true, message: "Logged out successfully" });
  // Same attributes as the login cookie so the browser overwrites (expires) that exact cookie
  response.cookies.set("authToken", "", {
    httpOnly: true,
    secure: isHttpsRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
