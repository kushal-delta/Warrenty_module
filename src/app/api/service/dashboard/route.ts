import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { callFilter, getScope, namedParams } from "@/lib/auth/scope";

const OPEN = "c.[Status] NOT IN ('Closed','Resolved','Cancelled')";
const DONE = "c.[ClosedOn] IS NOT NULL AND c.[Status] IN ('Resolved','Closed')";

/**
 * Service Dashboard (call-type and project-wise view of every service call): KPIs, calls by status, six-month booked vs closed,
 * call type × project matrix, open-call ageing, open calls by service center, top faults and the "needs attention" list.
 * Everything follows the user's rights (state / district, manager centre, engineer's own calls).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const values: Record<string, unknown> = {};
    const add = namedParams(values);
    const calls = callFilter(await getScope(user), "c", add);
    const cw = calls ? ` AND ${calls}` : "";
    const jobCalls = callFilter(await getScope(user), "cs", add);
    const jw = jobCalls ? ` AND j.[ComplaintId] IN (SELECT cs.[ComplaintId] FROM dbo.[Complaints] cs WHERE ${jobCalls})` : "";

    const [kpi, byStatus, months, matrix, ageing, centers, faults, attention, approval, cost] = await Promise.all([
      runQuery<any>(`SELECT
          SUM(CASE WHEN ${OPEN} THEN 1 ELSE 0 END) AS [Open],
          SUM(CASE WHEN ${OPEN} AND c.[Status] = 'New' THEN 1 ELSE 0 END) AS [NotAssigned],
          SUM(CASE WHEN ${OPEN} AND c.[DueDate] < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS [Overdue],
          SUM(CASE WHEN ${DONE} AND c.[ClosedOn] >= DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1) THEN 1 ELSE 0 END) AS [DoneThisMonth],
          AVG(CASE WHEN ${DONE} THEN CAST(DATEDIFF(day, c.[CallDate], c.[ClosedOn]) AS float) END) AS [AvgDaysToResolve]
        FROM dbo.[Complaints] c WHERE 1 = 1${cw}`, values),
      runQuery(`SELECT c.[Status], COUNT(*) AS [Count] FROM dbo.[Complaints] c WHERE 1 = 1${cw} GROUP BY c.[Status]`, values),
      runQuery(`WITH m AS (SELECT DATEFROMPARTS(YEAR(DATEADD(month, -n, SYSUTCDATETIME())), MONTH(DATEADD(month, -n, SYSUTCDATETIME())), 1) AS [MonthStart] FROM (VALUES (0),(1),(2),(3),(4),(5)) v(n))
        SELECT m.[MonthStart],
          (SELECT COUNT(*) FROM dbo.[Complaints] c WHERE c.[CallDate] >= m.[MonthStart] AND c.[CallDate] < DATEADD(month, 1, m.[MonthStart])${cw}) AS [Booked],
          (SELECT COUNT(*) FROM dbo.[Complaints] c WHERE ${DONE} AND c.[ClosedOn] >= m.[MonthStart] AND c.[ClosedOn] < DATEADD(month, 1, m.[MonthStart])${cw}) AS [Closed]
        FROM m ORDER BY m.[MonthStart]`, values),
      runQuery(`SELECT ct.[CallTypeName], COALESCE(p.[ProjectName], 'No project') AS [ProjectName], COUNT(*) AS [Count]
        FROM dbo.[Complaints] c JOIN dbo.[CallTypes] ct ON c.[CallTypeId] = ct.[CallTypeId] LEFT JOIN dbo.[Projects] p ON c.[ProjectId] = p.[ProjectId]
        WHERE 1 = 1${cw} GROUP BY ct.[CallTypeName], ct.[SortOrder], p.[ProjectName] ORDER BY ct.[SortOrder], ct.[CallTypeName]`, values),
      runQuery<any>(`SELECT
          SUM(CASE WHEN d <= 3 THEN 1 ELSE 0 END) AS [d0_3], SUM(CASE WHEN d BETWEEN 4 AND 7 THEN 1 ELSE 0 END) AS [d4_7],
          SUM(CASE WHEN d BETWEEN 8 AND 15 THEN 1 ELSE 0 END) AS [d8_15], SUM(CASE WHEN d > 15 THEN 1 ELSE 0 END) AS [d15plus]
        FROM (SELECT DATEDIFF(day, c.[CallDate], SYSUTCDATETIME()) AS d FROM dbo.[Complaints] c WHERE ${OPEN}${cw}) x`, values),
      runQuery(`SELECT COALESCE(sc.[ServiceCenterName], 'Unassigned') AS [Name], COUNT(*) AS [Count] FROM dbo.[Complaints] c LEFT JOIN dbo.[ServiceCenters] sc ON c.[ServiceCenterId] = sc.[ServiceCenterId]
        WHERE ${OPEN}${cw} GROUP BY sc.[ServiceCenterName] ORDER BY [Count] DESC`, values),
      runQuery(`SELECT TOP 6 fm.[FaultName] AS [Name], COUNT(*) AS [Count] FROM dbo.[JobCardFaultLns] f JOIN dbo.[FaultMasters] fm ON f.[FaultMasterId] = fm.[FaultMasterId] JOIN dbo.[JobCards] j ON f.[JobCardId] = j.[JobCardId]
        WHERE 1 = 1${jw} GROUP BY fm.[FaultName] ORDER BY [Count] DESC`, values),
      runQuery(`SELECT TOP 7 c.[ComplaintId], c.[ComplaintNo], c.[CustomerName], c.[Village], c.[District], c.[DueDate], c.[Status] FROM dbo.[Complaints] c
        WHERE ${OPEN} AND (c.[DueDate] < SYSUTCDATETIME() OR c.[Status] = 'New')${cw} ORDER BY c.[DueDate]`, values),
      runQuery<any>(`SELECT COUNT(*) AS [Count], COALESCE(SUM(j.[TotalEstimate]), 0) AS [Amount] FROM dbo.[JobCards] j WHERE j.[Status] = 'In Approval'${jw}`, values),
      runQuery<any>(`SELECT COALESCE(SUM(i.[Amount] + i.[GstAmount]), 0) AS [Cost] FROM dbo.[JobCardItemLns] i JOIN dbo.[JobCards] j ON i.[JobCardId] = j.[JobCardId] WHERE i.[IsWarranty] = 1 AND j.[Status] IN ('Approved','Closed')${jw}`, values),
    ]);

    const k = kpi[0] || {}, n = (v: unknown) => Number(v || 0);
    return NextResponse.json({
      success: true,
      kpis: {
        open: n(k.Open), notAssigned: n(k.NotAssigned), overdue: n(k.Overdue), doneThisMonth: n(k.DoneThisMonth),
        avgDaysToResolve: k.AvgDaysToResolve == null ? 0 : Math.round(Number(k.AvgDaysToResolve) * 10) / 10,
        approvalCount: n(approval[0]?.Count), approvalAmount: n(approval[0]?.Amount), warrantyCost: n(cost[0]?.Cost),
      },
      byStatus: byStatus.map((s: any) => ({ status: s.Status, count: n(s.Count) })),
      months: months.map((m: any) => ({ month: m.MonthStart, booked: n(m.Booked), closed: n(m.Closed) })),
      matrix: matrix.map((m: any) => ({ callType: m.CallTypeName, project: m.ProjectName, count: n(m.Count) })),
      ageing: { d0_3: n(ageing[0]?.d0_3), d4_7: n(ageing[0]?.d4_7), d8_15: n(ageing[0]?.d8_15), d15plus: n(ageing[0]?.d15plus) },
      centers: centers.map((c: any) => ({ name: c.Name, count: n(c.Count) })),
      faults: faults.map((f: any) => ({ name: f.Name, count: n(f.Count) })),
      attention,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load the service dashboard");
  }
}
