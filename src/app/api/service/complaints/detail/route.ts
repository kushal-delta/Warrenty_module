import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE, callVisible, getScope } from "@/lib/auth/scope";
import { serialWarranty } from "@/lib/services/complaints";
import { withAppFileUrls } from "@/lib/services/attachments";

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
      runQuery<any>(`SELECT v.[VisitReportId], v.[VisitDate], v.[VisitNo], v.[Status], v.[Observations], v.[ActionTaken], CONCAT(u.[FirstName], ' ', u.[LastName]) AS [EngineerName]
        FROM dbo.[VisitReports] v LEFT JOIN dbo.[Users] u ON u.[UserId] = v.[EngineerUserId] WHERE v.[ComplaintId]=@id ORDER BY v.[VisitDate] DESC`, { id: ComplaintId }),
      runQuery<any>(`SELECT [JobCardId], [JobCardNo], [JobCardDate], [Status], [TotalEstimate] FROM dbo.[JobCards] WHERE [ComplaintId]=@id ORDER BY [JobCardDate] DESC`, { id: ComplaintId }),
      // Full trail of the call and of its visit reports and job cards, newest first, with who and when.
      runQuery<any>(`SELECT a.[AuditLogId], a.[Action], a.[TableName], a.[Details], a.[LogOn], a.[UserName] AS [Username],
          COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(u.[FirstName], ' ', u.[LastName]))), ''), a.[UserName]) AS [UserName]
        FROM dbo.[AuditLogs] a LEFT JOIN dbo.[Users] u ON u.[UserId] = a.[UserId]
        WHERE (a.[TableName] = 'Complaints' AND a.[RecordId] = CAST(@id AS nvarchar(50)))
          OR (a.[TableName] = 'VisitReports' AND a.[RecordId] IN (SELECT CAST(v.[VisitReportId] AS nvarchar(50)) FROM dbo.[VisitReports] v WHERE v.[ComplaintId] = @id))
          OR (a.[TableName] = 'JobCards' AND a.[RecordId] IN (SELECT CAST(j.[JobCardId] AS nvarchar(50)) FROM dbo.[JobCards] j WHERE j.[ComplaintId] = @id))
        ORDER BY a.[LogOn] DESC`, { id: ComplaintId }),
    ]);
    // Activity: details parsed, and engineer ids (assignments) shown as names.
    const parsed = activity.map((a: any) => { let d: any = null; try { d = a.Details ? JSON.parse(a.Details) : null; } catch { d = a.Details; } return { ...a, Details: d }; });
    const engineerIds = Array.from(new Set(parsed.map((a: any) => a.Details?.EngineerUserId).filter(Boolean).map(String)));
    const engineerNames = new Map<string, string>();
    if (engineerIds.length) {
      const p: Record<string, unknown> = {};
      const list = engineerIds.map((id, i) => { p[`e${i}`] = id; return `@e${i}`; }).join(",");
      (await runQuery<any>(`SELECT [UserId], CONCAT([FirstName], ' ', [LastName]) AS [Name] FROM dbo.[Users] WHERE [UserId] IN (${list})`, p))
        .forEach((u) => engineerNames.set(String(u.UserId).toLowerCase(), String(u.Name).trim()));
    }
    const trail = parsed.map((a: any) => ({ ...a, EngineerName: a.Details?.EngineerUserId ? engineerNames.get(String(a.Details.EngineerUserId).toLowerCase()) || null : null }));
    // Mobile app (Bearer): full links with the server address; the website keeps the short ones.
    const files = withAppFileUrls(request, attachments as any[]);
    const photos = files.filter((a: any) => !String(a.FileType || "").startsWith("video/"));
    const videos = files.filter((a: any) => String(a.FileType || "").startsWith("video/"));
    const components = await Promise.all(items.map(async (i: any) => {
      if (!i.SerialNo) return { ...i, Warranty: null };
      const w = await serialWarranty(runQuery, i.SerialNo);
      return { ...i, ModelName: i.ModelName || w.ModelName, Warranty: { State: w.State, Label: w.Label, EndDate: w.EndDate, DaysLeft: w.DaysLeft } };
    }));
    return NextResponse.json({ success: true, complaint: { ...complaint, EngineerName: complaint.EngineerName?.trim() || null }, components, photos, videos, visits, jobCards, activity: trail });
  } catch (err) {
    return handleApiError(err, "Failed to load service call");
  }
}
