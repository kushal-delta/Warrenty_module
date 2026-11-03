import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { callFilter, getScope, namedParams, replacementFilter } from "@/lib/auth/scope";

/**
 * Service MIS in one request: call summary (status, centre, engineer, ageing), job card values,
 * replacement / credit-note effect and the warranty claim summary of spares replaced under warranty.
 * Optional fromDate / toDate filter on the document date.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { fromDate, toDate } = await request.json().catch(() => ({}));
    const values: Record<string, unknown> = { from: fromDate ? new Date(fromDate) : new Date("2000-01-01"), to: toDate ? new Date(toDate) : new Date("2100-01-01") };
    const scope = await getScope(user), add = namedParams(values);
    // Every figure follows the user's rights: calls by state / district (manager: centre, engineer: own calls).
    const callScope = callFilter(scope, "c", add), jobCallScope = callFilter(scope, "cs", add), replFilter = replacementFilter(scope, "r", add);
    const callRange = `c.[CallDate] BETWEEN @from AND @to${callScope ? ` AND ${callScope}` : ""}`;
    const jobScope = jobCallScope ? ` AND j.[ComplaintId] IN (SELECT cs.[ComplaintId] FROM dbo.[Complaints] cs WHERE ${jobCallScope})` : "";
    const replScope = replFilter ? ` AND ${replFilter}` : "";
    const [byStatus, byCenter, byEngineer, ageing, jobCards, jobCardLines, replacements, claims] = await Promise.all([
      runQuery(`SELECT c.[Status], COUNT(*) AS [Calls] FROM dbo.[Complaints] c WHERE ${callRange} GROUP BY c.[Status]`, values),
      runQuery(`SELECT COALESCE(sc.[ServiceCenterName], 'Not assigned') AS [Name], COUNT(*) AS [Total], SUM(CASE WHEN c.[Status] IN ('Closed','Resolved','Cancelled') THEN 0 ELSE 1 END) AS [Open], SUM(CASE WHEN c.[Status] IN ('Closed','Resolved') THEN 1 ELSE 0 END) AS [Closed], AVG(CASE WHEN c.[ClosedOn] IS NOT NULL THEN DATEDIFF(day, c.[CallDate], c.[ClosedOn]) END) AS [AvgDaysToClose] FROM dbo.[Complaints] c LEFT JOIN dbo.[ServiceCenters] sc ON c.[ServiceCenterId] = sc.[ServiceCenterId] WHERE ${callRange} GROUP BY sc.[ServiceCenterName] ORDER BY [Total] DESC`, values),
      runQuery(`SELECT CASE WHEN u.[UserId] IS NULL THEN 'Unassigned' ELSE CONCAT(u.[FirstName], ' ', u.[LastName]) END AS [Name], COUNT(*) AS [Total], SUM(CASE WHEN c.[Status] IN ('Closed','Resolved','Cancelled') THEN 0 ELSE 1 END) AS [Open], SUM(CASE WHEN c.[Status] IN ('Closed','Resolved') THEN 1 ELSE 0 END) AS [Closed], (SELECT COUNT(*) FROM dbo.[VisitReports] v WHERE v.[EngineerUserId] = u.[UserId] AND v.[VisitDate] BETWEEN @from AND @to) AS [Visits] FROM dbo.[Complaints] c LEFT JOIN dbo.[Users] u ON c.[EngineerUserId] = u.[UserId] WHERE ${callRange} GROUP BY u.[UserId], u.[FirstName], u.[LastName] ORDER BY [Total] DESC`, values),
      runQuery(`SELECT SUM(CASE WHEN d <= 2 THEN 1 ELSE 0 END) AS [d0_2], SUM(CASE WHEN d BETWEEN 3 AND 7 THEN 1 ELSE 0 END) AS [d3_7], SUM(CASE WHEN d BETWEEN 8 AND 15 THEN 1 ELSE 0 END) AS [d8_15], SUM(CASE WHEN d > 15 THEN 1 ELSE 0 END) AS [d15plus] FROM (SELECT DATEDIFF(day, c.[CallDate], SYSUTCDATETIME()) AS d FROM dbo.[Complaints] c WHERE c.[Status] NOT IN ('Closed','Resolved','Cancelled') AND ${callRange}) x`, values),
      runQuery(`SELECT j.[Status], COUNT(*) AS [Count], SUM(j.[TotalEstimate]) AS [Total], SUM(j.[SparesTotal]) AS [Spares], SUM(j.[LabourTotal]) AS [Labour], SUM(COALESCE(w.[Amount], 0)) AS [Warranty] FROM dbo.[JobCards] j OUTER APPLY (SELECT SUM(i.[Amount]) AS [Amount] FROM dbo.[JobCardItemLns] i WHERE i.[JobCardId] = j.[JobCardId] AND i.[IsWarranty] = 1) w WHERE j.[JobCardDate] BETWEEN @from AND @to${jobScope} GROUP BY j.[Status]`, values),
      runQuery(`SELECT j.[JobCardNo], j.[JobCardDate], j.[Status], c.[ComplaintNo], c.[CustomerName], s.[SpareCode], s.[SpareName], i.[Qty], i.[Rate], i.[Amount], i.[IsWarranty] FROM dbo.[JobCardItemLns] i JOIN dbo.[JobCards] j ON i.[JobCardId] = j.[JobCardId] JOIN dbo.[Complaints] c ON j.[ComplaintId] = c.[ComplaintId] JOIN dbo.[Spares] s ON i.[SpareId] = s.[SpareId] WHERE j.[JobCardDate] BETWEEN @from AND @to${jobScope} ORDER BY j.[JobCardDate] DESC, j.[JobCardNo]`, values),
      runQuery(`SELECT r.[ReplNo], r.[ReplDate], r.[Source], r.[ReplacementType], r.[Status], r.[CnNo], r.[CnAmount], d.[FirmName] AS [DealerName], i.[Category], i.[OldSerialNo], i.[NewSerialNo], i.[NetValue], i.[Charges], i.[WarrantyDaysLeft] FROM dbo.[Replacements] r JOIN dbo.[ReplacementItemLns] i ON i.[ReplacementId] = r.[ReplacementId] LEFT JOIN dbo.[Dealers] d ON r.[DealerId] = d.[DealerId] LEFT JOIN dbo.[Complaints] c ON r.[ComplaintId] = c.[ComplaintId] WHERE r.[ReplDate] BETWEEN @from AND @to${replScope} ORDER BY r.[ReplDate] DESC, i.[LineNo]`, values),
      runQuery(`SELECT s.[SpareCode], s.[SpareName], s.[Uom], SUM(i.[Qty]) AS [Qty], SUM(i.[Amount]) AS [Amount], COUNT(DISTINCT j.[JobCardId]) AS [JobCards] FROM dbo.[JobCardItemLns] i JOIN dbo.[JobCards] j ON i.[JobCardId] = j.[JobCardId] JOIN dbo.[Spares] s ON i.[SpareId] = s.[SpareId] WHERE i.[IsWarranty] = 1 AND j.[Status] IN ('Approved','Closed') AND j.[JobCardDate] BETWEEN @from AND @to${jobScope} GROUP BY s.[SpareCode], s.[SpareName], s.[Uom] ORDER BY [Amount] DESC`, values),
    ]);
    return NextResponse.json({ success: true, calls: { byStatus, byCenter, byEngineer, ageing: ageing[0] || {} }, jobCards, jobCardLines, replacements, claims });
  } catch (err) {
    return handleApiError(err, "Failed to build service reports");
  }
}
