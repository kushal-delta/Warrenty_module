/*
  Material Request approval: who approved / rejected a request, when, and with what remarks.
  Status moves Pending → Approved | Rejected on the Material Approvals screen.
  Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-04-material-request-approval.sql
*/

IF COL_LENGTH('dbo.MaterialRequests', 'DecisionByUserId') IS NULL
  ALTER TABLE dbo.MaterialRequests ADD DecisionByUserId uniqueidentifier NULL CONSTRAINT FK_MaterialRequests_DecisionBy REFERENCES dbo.Users (UserId);
IF COL_LENGTH('dbo.MaterialRequests', 'DecisionOn') IS NULL
  ALTER TABLE dbo.MaterialRequests ADD DecisionOn datetime2 NULL;
IF COL_LENGTH('dbo.MaterialRequests', 'DecisionRemarks') IS NULL
  ALTER TABLE dbo.MaterialRequests ADD DecisionRemarks nvarchar(500) NULL;
