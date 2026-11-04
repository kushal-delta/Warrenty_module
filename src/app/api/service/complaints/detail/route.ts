import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE, callVisible, getScope } from "@/lib/auth/scope";
import { serialWarranty } from "@/lib/services/complaints";

/** One service call with its faulty components (and their current warranty) and attached photos. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { ComplaintId } = await request.json().catch(() => ({}));
    if (!ComplaintId) return fail("ComplaintId is required");
    if (!(await callVisible(await getScope(user), ComplaintId))) return fail(OUT_OF_SCOPE, 403);
    const complaint = (await runQuery<any>(`SELECT c.*, ct.[CallTypeName], sc.[ServiceCenterName], p.[ProjectName], d.[FirmName] AS [DealerName], s.[StateName], CONCAT(u.[FirstName], ' ', u.[LastName]) AS [EngineerName]
      FROM dbo.[Complaints] c LEFT JOIN dbo.[CallTypes] ct ON c.[CallTypeId] = ct.[CallTypeId] LEFT JOIN dbo.[ServiceCenters] sc ON c.[ServiceCenterId] = sc.[ServiceCenterId]
      LEFT JOIN dbo.[Projects] p ON c.[ProjectId] = p.[ProjectId] LEFT JOIN dbo.[Dealers] d ON c.[DealerId] = d.[DealerId] LEFT JOIN dbo.[States] s ON c.[StateId] = s.[StateId] LEFT JOIN dbo.[Users] u ON c.[EngineerUserId] = u.[UserId]
      WHERE c.[ComplaintId] = @id`, { id: ComplaintId }))[0];
    if (!complaint) return fail("Service call not found", 404);
    const [items, attachments, visits, jobCards, activity] = await Promise.all([
      runQuery<any>(`SELECT i.[ComplaintItemLnId], i.[Category], i.[SerialNo], i.[ReportedFault], p.[ModelName] FROM dbo.[ComplaintItemLns] i LEFT JOIN dbo.[ProductModels] p ON i.[ProductModelId] = p.[ProductModelId] WHERE i.[ComplaintId] = @id ORDER BY i.[InsertedOn]`, { id: ComplaintId }),
      runQuery<any>(`SELECT [AttachmentId], [FileUrl], [FileName], [FileType], [FileSize], [Caption], [InsertedOn] FROM dbo.[Attachments] WHERE [ParentTable] = 'Complaints' AND [ParentId] = @id ORDER BY [InsertedOn]`, { id: ComplaintId }),
      runQuery<any>(`SELECT [VisitDate], [VisitNo] FROM dbo.[VisitReports] WHERE [ComplaintId]=@id ORDER BY [VisitDate] DESC`, { id: ComplaintId }),
      runQuery<any>(`SELECT [JobCardId], [JobCardNo], [JobCardDate], [Status], [TotalEstimate] FROM dbo.[JobCards] WHERE [ComplaintId]=@id ORDER BY [JobCardDate] DESC`, { id: ComplaintId }),
      runQuery<any>(`SELECT [Action], [UserName] FROM dbo.[AuditLogs] WHERE [TableName]='Complaints' AND [RecordId]=@id`, { id: ComplaintId }),
    ]);
    const photos = attachments.filter((a: any) => !String(a.FileType || "").startsWith("video/"));
    const videos = attachments.filter((a: any) => String(a.FileType || "").startsWith("video/"));
    const components = await Promise.all(items.map(async (i: any) => {
      if (!i.SerialNo) return { ...i, Warranty: null };
      const w = await serialWarranty(runQuery, i.SerialNo);
      return { ...i, ModelName: i.ModelName || w.ModelName, Warranty: { State: w.State, Label: w.Label, EndDate: w.EndDate, DaysLeft: w.DaysLeft } };
    }));
    return NextResponse.json({ success: true, complaint: { ...complaint, EngineerName: complaint.EngineerName?.trim() || null }, components, photos, visits, jobCards, activity });
  } catch (err) {
    return handleApiError(err, "Failed to load service call");
  }
}
