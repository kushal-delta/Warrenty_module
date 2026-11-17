import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, financialYear, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";

/**
 * Preview of the number a NEW document will get, for the entry drawers' header (e.g. "MR/26-27/0004").
 * Read-only: it does NOT reserve the number — the save route still allocates it from DocSequences inside its
 * transaction, so if someone else saves first the saved document simply gets the next one.
 * Keys and prefixes are the same ones the save routes pass to nextDocNo().
 */
const SEQUENCES: Record<string, { prefix: string; table?: string; column?: string }> = {
  MATREQ: { prefix: "MR" },
  MATISSUE: { prefix: "MI" },
  DCHALLAN: { prefix: "DC" },
  CHGRN: { prefix: "GRN" },
  DCRETURN: { prefix: "DRN" },
  JOBCARD: { prefix: "JC" },
  VISIT: { prefix: "VR" },
  REPL: { prefix: "REP" },
  // Service calls skip numbers already used (see nextComplaintNo) — the preview does the same.
  COMPLAINT: { prefix: "SC", table: "Complaints", column: "ComplaintNo" },
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { key } = await request.json().catch(() => ({}));
    const seq = SEQUENCES[String(key || "").toUpperCase()];
    if (!seq) return fail("Unknown document type", 400);

    const fy = financialYear();
    const row = (await runQuery<{ LastNo: number }>(`SELECT TOP 1 [LastNo] FROM dbo.[DocSequences] WHERE [SeqKey] = @key AND [Fy] = @fy`, { key: String(key).toUpperCase(), fy }))[0];
    let n = Number(row?.LastNo || 0) + 1;
    const format = (no: number) => `${seq.prefix}/${fy}/${String(no).padStart(4, "0")}`;

    if (seq.table && seq.column) {
      // Skip numbers that are already taken (checked in one query over the next 50 candidates).
      const candidates = Array.from({ length: 50 }, (_, i) => format(n + i));
      const params = Object.fromEntries(candidates.map((c, i) => [`c${i}`, c]));
      const taken = new Set((await runQuery<any>(`SELECT [${seq.column}] AS [No] FROM dbo.[${seq.table}] WHERE [${seq.column}] IN (${candidates.map((_, i) => `@c${i}`).join(", ")})`, params)).map((r) => r.No));
      const free = candidates.findIndex((c) => !taken.has(c));
      n += free < 0 ? candidates.length : free;
    }

    return NextResponse.json({ success: true, docNo: format(n) });
  } catch (err) {
    return handleApiError(err, "Could not read the next document number");
  }
}
