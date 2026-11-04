import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { TEXT_LIST_GROUPS } from "@/lib/services/challans";

/** Every value of the challan text lists (active and inactive) with who added it and how many challans use it. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const rows = await runQuery(`SELECT t.[TextListId], t.[ListGroup], t.[Value], t.[SortOrder], t.[IsActive], t.[InsertedOn], t.[LastUpdatedOn],
        CONCAT(u.[FirstName], ' ', u.[LastName]) AS [AddedBy],
        CASE t.[ListGroup]
          WHEN 'ChallanPurpose' THEN (SELECT COUNT(*) FROM dbo.[DeliveryChallans] d WHERE d.[Purpose] = t.[Value])
          WHEN 'PartyKind' THEN (SELECT COUNT(*) FROM dbo.[DeliveryChallans] d WHERE d.[PartyKind] = t.[Value])
          WHEN 'Transporter' THEN (SELECT COUNT(*) FROM dbo.[DeliveryChallans] d WHERE d.[TransporterName] = t.[Value])
          ELSE 0 END AS [UsedOn]
      FROM dbo.[TextLists] t LEFT JOIN dbo.[Users] u ON u.[UserId] = t.[InsertedByUserId]
      WHERE t.[ListGroup] IN (${TEXT_LIST_GROUPS.map((g) => `'${g}'`).join(", ")})
      ORDER BY t.[ListGroup], t.[SortOrder], t.[Value]`);
    return NextResponse.json({ success: true, values: rows });
  } catch (err) {
    return handleApiError(err, "Could not load the text lists");
  }
}
