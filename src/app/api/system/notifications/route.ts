import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";

/** WhatsApp / SMS messages queued by the system, newest first. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (user.Role === "ENGINEER") return fail("You cannot view the message log", 403);
    const { search, channel, limit = 500 } = await request.json().catch(() => ({}));
    const where: string[] = [], params: unknown[] = [];
    if (channel) { where.push(`[Channel] = @p${params.length}`); params.push(channel); }
    if (search) { where.push(`([ToMobile] LIKE @p${params.length} OR [RefNo] LIKE @p${params.length} OR [Message] LIKE @p${params.length})`); params.push(`%${search}%`); }
    params.push(Math.min(Number(limit) || 500, 2000));
    const notifications = await query(`SELECT TOP (@p${params.length - 1}) * FROM dbo.[NotificationLogs]${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY [SentOn] DESC`, params);
    return NextResponse.json({ success: true, notifications });
  } catch (err) {
    return handleApiError(err, "Failed to load message log");
  }
}
