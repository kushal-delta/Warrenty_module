import { randomUUID } from "crypto";
import type { AuthSessionUser } from "@/lib/auth/jwt";
import { InputError, type Run } from "@/lib/services/apiHelpers";
import { jobCardShortage, postJobCardStock } from "@/lib/services/stock";

export interface ApprovalRule { ApprovalRuleId: string; LevelNo: number; RoleName: string; ApproverUserId?: string | null; MinAmount: number; MaxAmount?: number | null; IsActive: boolean }

/**
 * Columns every job card query needs: the card, its call, and computed warranty / customer amounts.
 * The job card's own service centre / engineer win over the call's (older cards only have the call's).
 */
export const JOBCARD_SELECT = `
  SELECT j.[JobCardId], j.[JobCardNo], j.[ComplaintId], j.[JobCardDate], j.[Status], j.[CurrentLevel], j.[TotalEstimate], j.[SparesTotal], j.[LabourTotal], j.[GstTotal], j.[OtherCharges], j.[Remarks], j.[ClosedOn],
    j.[InsertedOn], j.[LastUpdatedOn], j.[InsertedByUserId], j.[LastUpdatedByUserId], c.[ComplaintNo], c.[CallDate], c.[CustomerId], c.[CustomerName], c.[Mobile], c.[Village], c.[District], c.[WarrantyStatus],
    COALESCE(j.[EngineerUserId], c.[EngineerUserId]) AS [EngineerUserId], COALESCE(j.[ServiceCenterId], c.[ServiceCenterId]) AS [ServiceCenterId], c.[Status] AS [ComplaintStatus], c.[ComplaintText],
    CONCAT(u.[FirstName], ' ', u.[LastName]) AS [EngineerName], sc.[ServiceCenterName],
    COALESCE((SELECT SUM(i.[Amount] + i.[GstAmount]) FROM dbo.[JobCardItemLns] i WHERE i.[JobCardId] = j.[JobCardId] AND i.[IsWarranty] = 1), 0) AS [WarrantyAmount]
  FROM dbo.[JobCards] j JOIN dbo.[Complaints] c ON j.[ComplaintId] = c.[ComplaintId]
  LEFT JOIN dbo.[Users] u ON COALESCE(j.[EngineerUserId], c.[EngineerUserId]) = u.[UserId] LEFT JOIN dbo.[ServiceCenters] sc ON COALESCE(j.[ServiceCenterId], c.[ServiceCenterId]) = sc.[ServiceCenterId]`;

export async function activeRules(run: Run) {
  return (await run<ApprovalRule>(`SELECT * FROM dbo.[ApprovalRules] WHERE [IsActive] = 1 ORDER BY [LevelNo] ASC`)).map((r) => ({ ...r, MinAmount: Number(r.MinAmount) }));
}

/** Levels a job card of this value must pass, lowest first. */
export const rulesFor = (rules: ApprovalRule[], total: number) => rules.filter((r) => r.MinAmount <= total);

/** Whether the user may approve / reject at this level. A named approver on the rule is the only one who may act. */
export function canActOnRule(rule: ApprovalRule | undefined, user: AuthSessionUser, jobServiceCenterId?: string | null) {
  if (!rule) return false;
  if (user.IsAdmin || user.Role === "SUPER") return true;
  if (rule.ApproverUserId) return rule.ApproverUserId.toLowerCase() === user.UserId.toLowerCase();
  const role = String(rule.RoleName || "").toLowerCase();
  if (role === user.Role.toLowerCase()) return true;
  if (user.Role === "MANAGER") return /manager|centre|center/.test(role) && (!user.ServiceCenterId || !jobServiceCenterId || user.ServiceCenterId.toLowerCase() === jobServiceCenterId.toLowerCase());
  if (user.Role === "HO") return /\b(ho|head|director|admin)\b/.test(role);
  return false;
}

export async function loadJobCard(run: Run, jobCardId: string, lock = false) {
  const rows = await run<any>(`${JOBCARD_SELECT.replace("FROM dbo.[JobCards] j", `FROM dbo.[JobCards] j${lock ? " WITH (UPDLOCK)" : ""}`)} WHERE j.[JobCardId] = @id`, { id: jobCardId });
  return rows[0] || null;
}

const OPEN_CALL = ["New", "Assigned", "Visited", "In Approval", "Approved"];

async function setCallStatus(run: Run, complaintId: string, status: string, userId: string) {
  await run(`UPDATE dbo.[Complaints] SET [Status] = @status, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [ComplaintId] = @id AND [Status] IN ('${OPEN_CALL.join("','")}')`, { status, userId, id: complaintId });
}

/** Status a call returns to when its job card is rejected or removed. */
export async function revertCallStatus(run: Run, job: any, userId: string) {
  const visits = await run<any>(`SELECT COUNT(*) AS [n] FROM dbo.[VisitReports] WHERE [ComplaintId] = @id`, { id: job.ComplaintId });
  const status = Number(visits[0].n) ? "Visited" : job.EngineerUserId ? "Assigned" : "New";
  await run(`UPDATE dbo.[Complaints] SET [Status] = @status, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [ComplaintId] = @id AND [Status] IN ('In Approval','Approved')`, { status, userId, id: job.ComplaintId });
}

/** Final approval: checks stock, posts consumption, marks the card and call approved and queues the customer message. */
export async function finalizeJobCard(run: Run, job: any, userId: string) {
  const shortage = await jobCardShortage(run, job);
  if (shortage) throw new InputError(`Cannot approve — ${shortage}`);
  await run(`UPDATE dbo.[JobCards] SET [Status] = 'Approved', [CurrentLevel] = 0, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [JobCardId] = @id`, { userId, id: job.JobCardId });
  await postJobCardStock(run, job, userId);
  await setCallStatus(run, job.ComplaintId, "Approved", userId);
  const payable = Math.max(0, Number(job.TotalEstimate) - Number(job.WarrantyAmount || 0));
  await run(
    `INSERT INTO dbo.[NotificationLogs] ([NotificationLogId],[Channel],[ToMobile],[Template],[Message],[RefType],[RefNo],[SentOn],[Status],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (@id,'WhatsApp',@mobile,'JOBCARD_APPROVED',@message,'JobCard',@refNo,SYSUTCDATETIME(),'Queued',@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
    { id: randomUUID(), mobile: job.Mobile, message: `Dear ${job.CustomerName}, repair estimate ${job.JobCardNo} for service call ${job.ComplaintNo} is approved. Amount payable by you: Rs ${payable.toFixed(2)}.`, refNo: job.JobCardNo, userId }
  );
}

/** Sends a job card into the approval chain, or approves it straight away when no rule applies to its value. */
export async function submitJobCard(run: Run, job: any, userId: string) {
  const levels = rulesFor(await activeRules(run), Number(job.TotalEstimate));
  if (!levels.length) { await finalizeJobCard(run, job, userId); return "Approved"; }
  await run(`UPDATE dbo.[JobCards] SET [Status] = 'In Approval', [CurrentLevel] = @level, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId WHERE [JobCardId] = @id`, { level: levels[0].LevelNo, userId, id: job.JobCardId });
  await setCallStatus(run, job.ComplaintId, "In Approval", userId);
  return "In Approval";
}
