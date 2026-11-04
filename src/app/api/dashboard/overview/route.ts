import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { activeRules, canActOnRule, rulesFor } from "@/lib/services/jobCards";
import { callFilter, geoFilter, getScope, namedParams, warrantyFilter } from "@/lib/auth/scope";

const OPEN_CALL = "c.[Status] NOT IN ('Closed','Resolved','Cancelled')";
const ACTIVE = "w.[Status] = 'Active' AND w.[EndDate] >= SYSUTCDATETIME()";

/**
 * Everything the dashboard shows, computed live: KPI tiles, the 6-month registrations vs calls trend,
 * warranty position per serial, calls by status, installations by dealer and the "needs attention" list.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const mine = user.Role === "ENGINEER";
    // Every number follows the user's rights: state / district, manager's centre, engineer's own calls.
    const scope = await getScope(user), values: Record<string, unknown> = {}, add = namedParams(values);
    const pre = (condition: string) => (condition ? ` AND ${condition}` : "");
    const callScope = pre(callFilter(scope, "c", add));
    const wScope = pre(warrantyFilter(scope, "w", add));
    const iScope = pre(geoFilter(scope, { state: "i.[StateId]", district: "i.[District]", dealer: "i.[DealerId]", customer: "i.[CustomerId]" }, add));
    const dScope = pre(geoFilter(scope, { state: "d.[StateId]", district: "d.[District]", dealer: "d.[DealerId]" }, add));
    const jobCalls = callFilter(scope, "cs", add);
    const jScope = jobCalls ? ` AND j.[ComplaintId] IN (SELECT cs.[ComplaintId] FROM dbo.[Complaints] cs WHERE ${jobCalls})` : "";

    const [warrantyKpi, callKpi, dealerKpi, costKpi, months, position, byStatus, byDealer, pendingCards, rules, dealersPending, overdueCalls, unassigned, ending, remindersDue] = await Promise.all([
      runQuery(`SELECT
          (SELECT COUNT(DISTINCT w.[InstallationId]) FROM dbo.[Warranties] w WHERE ${ACTIVE}${wScope}) AS [PumpSets],
          (SELECT COUNT(*) FROM dbo.[Installations] i WHERE 1 = 1${iScope}) AS [Installations],
          (SELECT COUNT(*) FROM dbo.[Warranties] w WHERE 1 = 1${wScope}) AS [Serials],
          (SELECT COUNT(*) FROM dbo.[Warranties] w WHERE ${ACTIVE} AND w.[EndDate] < DATEADD(day, 45, SYSUTCDATETIME())${wScope}) AS [Ending45],
          (SELECT COUNT(*) FROM dbo.[Warranties] w WHERE w.[Status] = 'Active' AND w.[EndDate] < SYSUTCDATETIME()${wScope}) AS [Expired]`, values),
      runQuery(`SELECT COUNT(*) AS [Open],
          SUM(CASE WHEN c.[DueDate] < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS [Overdue],
          SUM(CASE WHEN c.[EngineerUserId] IS NULL THEN 1 ELSE 0 END) AS [Unassigned]
        FROM dbo.[Complaints] c WHERE ${OPEN_CALL}${callScope}`, values),
      runQuery(`SELECT SUM(CASE WHEN [Status] = 'Pending' THEN 1 ELSE 0 END) AS [Pending], SUM(CASE WHEN [Status] = 'Approved' THEN 1 ELSE 0 END) AS [Approved] FROM dbo.[Dealers] d WHERE 1 = 1${dScope}`, values),
      runQuery(`SELECT COALESCE(SUM(i.[Amount] + i.[GstAmount]), 0) AS [WarrantyCost], COUNT(DISTINCT j.[JobCardId]) AS [JobCards]
        FROM dbo.[JobCardItemLns] i JOIN dbo.[JobCards] j ON i.[JobCardId] = j.[JobCardId] WHERE i.[IsWarranty] = 1 AND j.[Status] IN ('Approved','Closed')${jScope}`, values),
      runQuery(`WITH m AS (SELECT DATEFROMPARTS(YEAR(DATEADD(month, -n, SYSUTCDATETIME())), MONTH(DATEADD(month, -n, SYSUTCDATETIME())), 1) AS [MonthStart] FROM (VALUES (0),(1),(2),(3),(4),(5)) v(n))
        SELECT m.[MonthStart],
          (SELECT COUNT(*) FROM dbo.[Installations] i WHERE i.[InstallDate] >= m.[MonthStart] AND i.[InstallDate] < DATEADD(month, 1, m.[MonthStart])${iScope}) AS [Installations],
          (SELECT COUNT(*) FROM dbo.[Complaints] c WHERE c.[CallDate] >= m.[MonthStart] AND c.[CallDate] < DATEADD(month, 1, m.[MonthStart])${callScope}) AS [Calls]
        FROM m ORDER BY m.[MonthStart]`, values),
      runQuery(`SELECT
          SUM(CASE WHEN w.[Status] = 'Active' AND w.[EndDate] >= DATEADD(day, 45, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS [Active],
          SUM(CASE WHEN ${ACTIVE} AND w.[EndDate] < DATEADD(day, 45, SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS [Ending],
          SUM(CASE WHEN w.[Status] = 'Active' AND w.[EndDate] < SYSUTCDATETIME() THEN 1 ELSE 0 END) AS [Expired],
          SUM(CASE WHEN w.[Status] = 'Replaced' THEN 1 ELSE 0 END) AS [Replaced],
          SUM(CASE WHEN w.[Status] NOT IN ('Active','Replaced') THEN 1 ELSE 0 END) AS [Other]
        FROM dbo.[Warranties] w WHERE 1 = 1${wScope}`, values),
      runQuery(`SELECT c.[Status], COUNT(*) AS [Count] FROM dbo.[Complaints] c WHERE 1 = 1${callScope} GROUP BY c.[Status]`, values),
      runQuery(`SELECT TOP 6 COALESCE(d.[FirmName], 'Direct / customer') AS [Name], COUNT(*) AS [Count]
        FROM dbo.[Installations] i LEFT JOIN dbo.[Dealers] d ON i.[DealerId] = d.[DealerId]
        WHERE 1 = 1${iScope}
        GROUP BY d.[FirmName] ORDER BY [Count] DESC, [Name]`, values),
      runQuery(`SELECT j.[JobCardId], j.[JobCardNo], j.[TotalEstimate], j.[CurrentLevel], c.[CustomerName], c.[ServiceCenterId]
        FROM dbo.[JobCards] j JOIN dbo.[Complaints] c ON j.[ComplaintId] = c.[ComplaintId] WHERE j.[Status] = 'In Approval'${callScope} ORDER BY j.[JobCardDate]`, values),
      activeRules(runQuery),
      mine ? Promise.resolve([]) : runQuery(`SELECT TOP 5 [DealerId], [FirmName], [City], [Mobile] FROM dbo.[Dealers] d WHERE d.[Status] = 'Pending'${dScope} ORDER BY d.[InsertedOn]`, values),
      runQuery(`SELECT TOP 6 c.[ComplaintId], c.[ComplaintNo], c.[CustomerName], c.[DueDate], CONCAT(u.[FirstName], ' ', u.[LastName]) AS [EngineerName]
        FROM dbo.[Complaints] c LEFT JOIN dbo.[Users] u ON c.[EngineerUserId] = u.[UserId]
        WHERE ${OPEN_CALL} AND c.[DueDate] < SYSUTCDATETIME()${callScope} ORDER BY c.[DueDate]`, values),
      mine ? Promise.resolve([]) : runQuery(`SELECT TOP 5 c.[ComplaintId], c.[ComplaintNo], c.[CustomerName], c.[ComplaintText] FROM dbo.[Complaints] c WHERE ${OPEN_CALL} AND c.[EngineerUserId] IS NULL${callScope} ORDER BY c.[CallDate]`, values),
      runQuery(`SELECT TOP 5 w.[SerialNo], w.[Category], w.[EndDate], cu.[CustomerName] FROM dbo.[Warranties] w LEFT JOIN dbo.[Customers] cu ON w.[CustomerId] = cu.[CustomerId]
        WHERE ${ACTIVE} AND w.[EndDate] < DATEADD(day, 45, SYSUTCDATETIME())${wScope} ORDER BY w.[EndDate]`, values),
      runQuery(`SELECT TOP 4 r.[ComplaintReminderId], r.[ReminderDate], r.[ReminderText], c.[ComplaintNo] FROM dbo.[ComplaintReminders] r JOIN dbo.[Complaints] c ON r.[ComplaintId] = c.[ComplaintId]
        WHERE r.[Status] = 'Pending' AND r.[ReminderDate] < DATEADD(day, 1, CAST(SYSUTCDATETIME() AS date))${callScope} ORDER BY r.[ReminderDate]`, values),
    ]);

    const waitingForMe = pendingCards.filter((j: any) => canActOnRule(rulesFor(rules, Number(j.TotalEstimate)).find((r) => r.LevelNo === j.CurrentLevel), user, j.ServiceCenterId));
    const w = warrantyKpi[0] || {}, c = callKpi[0] || {}, d = dealerKpi[0] || {}, cost = costKpi[0] || {}, p = position[0] || {};
    const n = (v: unknown) => Number(v || 0);
    const date = (v: string) => new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
    const title = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");

    const attention = [
      ...waitingForMe.slice(0, 5).map((j: any) => ({ kind: "approval", title: `Job card ${j.JobCardNo} waits for your approval`, subtitle: `₹ ${n(j.TotalEstimate).toLocaleString("en-IN")} · ${j.CustomerName}`, url: `/service/jobcards?open=${j.JobCardId}` })),
      ...dealersPending.map((x: any) => ({ kind: "dealer", title: `Dealer sign-up pending: ${x.FirmName}`, subtitle: [x.City, x.Mobile].filter(Boolean).join(" · "), url: `/warranty/dealers?q=${encodeURIComponent(x.FirmName)}` })),
      ...overdueCalls.map((x: any) => ({ kind: "overdue", title: `Overdue call ${x.ComplaintNo} (due ${date(x.DueDate)})`, subtitle: [x.CustomerName, x.EngineerName?.trim() || "Unassigned"].join(" · "), url: `/service/complaints?q=${encodeURIComponent(x.ComplaintNo)}` })),
      ...unassigned.map((x: any) => ({ kind: "assign", title: `New call ${x.ComplaintNo} to assign`, subtitle: `${x.CustomerName} · ${String(x.ComplaintText || "").slice(0, 70)}${String(x.ComplaintText || "").length > 70 ? "…" : ""}`, url: `/service/complaints?q=${encodeURIComponent(x.ComplaintNo)}` })),
      ...remindersDue.map((x: any) => ({ kind: "reminder", title: `Reminder on ${x.ComplaintNo} (${date(x.ReminderDate)})`, subtitle: x.ReminderText, url: `/service/reminders` })),
      ...ending.map((x: any) => ({ kind: "ending", title: `Warranty ending ${date(x.EndDate)} — ${title(x.Category)} ${x.SerialNo}`, subtitle: x.CustomerName || "", url: `/warranty/verify?serial=${encodeURIComponent(x.SerialNo)}` })),
    ];

    return NextResponse.json({
      success: true,
      kpis: {
        pumpSets: n(w.PumpSets), installations: n(w.Installations), serials: n(w.Serials),
        ending45: n(w.Ending45), expired: n(w.Expired),
        openCalls: n(c.Open), overdueCalls: n(c.Overdue), unassignedCalls: n(c.Unassigned),
        jobCardsInApproval: pendingCards.length, jobCardsForMe: waitingForMe.length,
        dealersPending: n(d.Pending), dealersApproved: n(d.Approved),
        warrantyCost: n(cost.WarrantyCost), warrantyJobCards: n(cost.JobCards),
      },
      trend: months.map((m: any) => ({ month: m.MonthStart, installations: n(m.Installations), calls: n(m.Calls) })),
      warrantyPosition: [
        { key: "active", label: "Active", value: n(p.Active) },
        { key: "ending", label: "Ending in 45 days", value: n(p.Ending) },
        { key: "expired", label: "Expired", value: n(p.Expired) },
        { key: "replaced", label: "Replaced", value: n(p.Replaced) },
        ...(n(p.Other) ? [{ key: "other", label: "Other", value: n(p.Other) }] : []),
      ],
      callsByStatus: byStatus.map((s: any) => ({ status: s.Status, count: n(s.Count) })),
      installationsByDealer: byDealer.map((x: any) => ({ name: x.Name, count: n(x.Count) })),
      attention,
    });
  } catch (err) {
    return handleApiError(err, "Failed to load dashboard");
  }
}
