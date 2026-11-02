import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
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

    const response = NextResponse.json({ success: true, message: "Logged out successfully" });
    response.cookies.delete("authToken");
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
