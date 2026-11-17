/*
  iERP → Warranty single sign-on (one-time login tickets).
  RUNS ON THE iERP DATABASE (SolarativeiERP), not on the warranty database.

  Flow:
    1. iERP (user clicks WARRANTY) calls dbo.usp_CreateWarrantySsoTicket with the logged-in UserId → gets a TicketId.
    2. iERP redirects the browser to  <warranty-url>/api/Auth/sso?ticket=<TicketId>
    3. The warranty module marks the ticket used (once only, within 60 seconds) and signs that user in.

  Compatible with database compatibility level 100. Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-13-ierp-warranty-sso.sql --ierp
  (or paste into SSMS against SolarativeiERP and execute)
*/

IF OBJECT_ID('dbo.WarrantySsoTickets') IS NULL
  CREATE TABLE dbo.WarrantySsoTickets (
    TicketId uniqueidentifier NOT NULL CONSTRAINT PK_WarrantySsoTickets PRIMARY KEY,
    UserId uniqueidentifier NOT NULL,              -- dbo.Users.UserId of the iERP user who clicked WARRANTY
    CompanyId uniqueidentifier NULL,               -- dbo.Company.CompanyId selected in the iERP session (optional)
    FiscalYear nvarchar(20) NULL,                  -- year selected in the iERP session, e.g. '2026-27' (optional)
    ReturnPath nvarchar(200) NULL,                 -- warranty page to open, e.g. '/warranty/active' (optional, default dashboard)
    ClientIp nvarchar(50) NULL,                    -- browser IP seen by iERP (audit only)
    CreatedOn datetime2 NOT NULL CONSTRAINT DF_WarrantySsoTickets_CreatedOn DEFAULT (SYSUTCDATETIME()),
    ExpiresOn datetime2 NOT NULL,
    UsedOn datetime2 NULL,
    UsedIp nvarchar(50) NULL
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WarrantySsoTickets_CreatedOn' AND object_id = OBJECT_ID('dbo.WarrantySsoTickets'))
  CREATE INDEX IX_WarrantySsoTickets_CreatedOn ON dbo.WarrantySsoTickets (CreatedOn);

IF OBJECT_ID('dbo.usp_CreateWarrantySsoTicket', 'P') IS NOT NULL
  DROP PROCEDURE dbo.usp_CreateWarrantySsoTicket;

EXEC('
CREATE PROCEDURE dbo.usp_CreateWarrantySsoTicket
  @UserId uniqueidentifier,
  @CompanyId uniqueidentifier = NULL,
  @FiscalYear nvarchar(20) = NULL,
  @ReturnPath nvarchar(200) = NULL,
  @ClientIp nvarchar(50) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  -- Only enabled iERP users get a ticket.
  IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE UserId = @UserId AND ISNULL(IsDisabled, 0) = 0 AND ISNULL(IsEmpDisable, 0) = 0)
  BEGIN
    RAISERROR(''Warranty login: user not found or disabled.'', 16, 1);
    RETURN;
  END

  -- Housekeeping: tickets are only useful for 60 seconds; keep 7 days for audit.
  DELETE FROM dbo.WarrantySsoTickets WHERE CreatedOn < DATEADD(DAY, -7, SYSUTCDATETIME());

  DECLARE @TicketId uniqueidentifier;
  SET @TicketId = NEWID();

  INSERT INTO dbo.WarrantySsoTickets (TicketId, UserId, CompanyId, FiscalYear, ReturnPath, ClientIp, CreatedOn, ExpiresOn)
  VALUES (@TicketId, @UserId, @CompanyId, @FiscalYear, @ReturnPath, @ClientIp, SYSUTCDATETIME(), DATEADD(SECOND, 60, SYSUTCDATETIME()));

  SELECT @TicketId AS TicketId;
END
');
