/*
  Defective / Fresh Receipt: material received back against a RETURNABLE delivery challan.
  Per challan line: quantity back as fresh (unused) and as defective, the defective part's serial / tag and remarks.
  Pending on the challan line = issued - fresh - defective. The challan's own status is not changed.
  Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-04-challan-returns.sql
*/

IF OBJECT_ID('dbo.ChallanReturns') IS NULL
  CREATE TABLE dbo.ChallanReturns (
    ChallanReturnId uniqueidentifier NOT NULL CONSTRAINT PK_ChallanReturns PRIMARY KEY,
    ReturnNo nvarchar(30) NOT NULL,
    ReturnDate date NOT NULL,
    DeliveryChallanId uniqueidentifier NOT NULL CONSTRAINT FK_ChallanReturns_DeliveryChallans REFERENCES dbo.DeliveryChallans (DeliveryChallanId),
    ReceivedThrough nvarchar(80) NULL,
    Remarks nvarchar(500) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_ChallanReturns_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_ChallanReturns_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ChallanReturns_ReturnNo' AND object_id = OBJECT_ID('dbo.ChallanReturns'))
  CREATE UNIQUE INDEX UX_ChallanReturns_ReturnNo ON dbo.ChallanReturns (ReturnNo);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChallanReturns_Challan' AND object_id = OBJECT_ID('dbo.ChallanReturns'))
  CREATE INDEX IX_ChallanReturns_Challan ON dbo.ChallanReturns (DeliveryChallanId);

IF OBJECT_ID('dbo.ChallanReturnItemLns') IS NULL
  CREATE TABLE dbo.ChallanReturnItemLns (
    ChallanReturnItemLnId uniqueidentifier NOT NULL CONSTRAINT PK_ChallanReturnItemLns PRIMARY KEY,
    ChallanReturnId uniqueidentifier NOT NULL CONSTRAINT FK_ChallanReturnItemLns_ChallanReturns REFERENCES dbo.ChallanReturns (ChallanReturnId) ON DELETE CASCADE,
    DeliveryChallanItemLnId uniqueidentifier NOT NULL CONSTRAINT FK_ChallanReturnItemLns_ChallanItems REFERENCES dbo.DeliveryChallanItemLns (DeliveryChallanItemLnId),
    QtyFresh decimal(18, 3) NOT NULL CONSTRAINT DF_ChallanReturnItemLns_QtyFresh DEFAULT (0),
    QtyDefective decimal(18, 3) NOT NULL CONSTRAINT DF_ChallanReturnItemLns_QtyDefective DEFAULT (0),
    DefectSerial nvarchar(60) NULL,
    Remarks nvarchar(250) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_ChallanReturnItemLns_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_ChallanReturnItemLns_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChallanReturnItemLns_Line' AND object_id = OBJECT_ID('dbo.ChallanReturnItemLns'))
  CREATE INDEX IX_ChallanReturnItemLns_Line ON dbo.ChallanReturnItemLns (DeliveryChallanItemLnId);
