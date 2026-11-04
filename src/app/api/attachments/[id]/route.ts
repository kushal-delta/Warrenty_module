import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { query } from "@/lib/sqlserver";
import { fail, requireUser } from "@/lib/services/apiHelpers";
import { callVisible, getScope, positionalParams, replacementFilter } from "@/lib/auth/scope";
import { PENDING_TABLE, attachmentPath } from "@/lib/services/attachments";

/**
 * Streams an attachment (photo, PDF or video). Only users who can see the parent record (e.g. the service call) may open it;
 * a pending upload only by its uploader. Byte ranges are served so videos can be played and seeked.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser(request);
  if (!user) return fail("Unauthorized", 401);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return fail("Attachment not found", 404);
  const row = (await query<any>(`SELECT [ParentTable], [ParentId], [FileName], [FileType], [InsertedByUserId] FROM dbo.[Attachments] WHERE [AttachmentId] = @p0`, [params.id]))[0];
  if (!row) return fail("Attachment not found", 404);
  if (row.ParentTable === PENDING_TABLE && String(row.InsertedByUserId).toLowerCase() !== String(user.UserId).toLowerCase()) return fail("Attachment not found", 404);
  // Photos follow the service call: a job card photo is visible to whoever can see the job card's call.
  const callId = row.ParentTable === "Complaints" ? row.ParentId
    : row.ParentTable === "JobCards" ? (await query<any>(`SELECT [ComplaintId] FROM dbo.[JobCards] WHERE [JobCardId] = @p0`, [row.ParentId]))[0]?.ComplaintId : null;
  if (callId && !(await callVisible(await getScope(user), callId))) return fail("This record is outside your access rights", 403);
  // Replacement documents follow the replacement's own scope (dealer, linked call, state / district).
  if (row.ParentTable === "Replacements") {
    const values: unknown[] = [row.ParentId];
    const filter = replacementFilter(await getScope(user), "r", positionalParams(values));
    if (!(await query(`SELECT TOP 1 1 AS [ok] FROM dbo.[Replacements] r WHERE r.[ReplacementId] = @p0${filter ? ` AND ${filter}` : ""}`, values)).length) return fail("This record is outside your access rights", 403);
  }

  const filePath = attachmentPath(params.id, row.FileType);
  let size: number;
  try { size = (await stat(filePath)).size; } catch { return fail("The file is missing on the server", 404); }
  const headers: Record<string, string> = {
    "Content-Type": row.FileType || "application/octet-stream",
    "Content-Disposition": `inline; filename="${encodeURIComponent(row.FileName || "file")}"`,
    "Cache-Control": "private, max-age=86400",
    "Accept-Ranges": "bytes",
  };
  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream;
    return new NextResponse(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const body = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new NextResponse(body, { headers: { ...headers, "Content-Length": String(size) } });
}
