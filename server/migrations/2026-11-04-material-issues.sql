/*
  Material Issue: material issued OUT of a warehouse's stock (Spares Stock → Material Issue).
  Header: issue date, warehouse, purpose, remarks. Lines: item (iERP item or Spares master spare, as on challans),
  quantity, rate (carried from the warehouse stock) and remarks. Issued quantities are outward in Warehouse Stock.
  Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-04-material-issues.sql
*/

IF OBJECT_ID('dbo.MaterialIssues') IS NULL
  CREATE TABLE dbo.MaterialIssues (
    MaterialIssueId uniqueidentifier NOT NULL CONSTRAINT PK_MaterialIssues PRIMARY KEY,
    IssueNo nvarchar(30) NOT NULL,
    IssueDate date NOT NULL,
    WarehouseId uniqueidentifier NOT NULL CONSTRAINT FK_MaterialIssues_Warehouses REFERENCES dbo.Warehouses (WarehouseId),
    Purpose nvarchar(200) NOT NULL,
    Remarks nvarchar(500) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_MaterialIssues_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_MaterialIssues_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_MaterialIssues_IssueNo' AND object_id = OBJECT_ID('dbo.MaterialIssues'))
  CREATE UNIQUE INDEX UX_MaterialIssues_IssueNo ON dbo.MaterialIssues (IssueNo);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MaterialIssues_Warehouse' AND object_id = OBJECT_ID('dbo.MaterialIssues'))
  CREATE INDEX IX_MaterialIssues_Warehouse ON dbo.MaterialIssues (WarehouseId, IssueDate);

IF OBJECT_ID('dbo.MaterialIssueItemLns') IS NULL
  CREATE TABLE dbo.MaterialIssueItemLns (
    MaterialIssueItemLnId uniqueidentifier NOT NULL CONSTRAINT PK_MaterialIssueItemLns PRIMARY KEY,
    MaterialIssueId uniqueidentifier NOT NULL CONSTRAINT FK_MaterialIssueItemLns_MaterialIssues REFERENCES dbo.MaterialIssues (MaterialIssueId) ON DELETE CASCADE,
    [LineNo] int NOT NULL,
    ItemSource nvarchar(10) NOT NULL,              -- 'ERP' | 'LOCAL'
    ErpItmId uniqueidentifier NULL,
    SpareId uniqueidentifier NULL CONSTRAINT FK_MaterialIssueItemLns_Spares REFERENCES dbo.Spares (SpareId),
    ItemCode nvarchar(60) NULL,
    ItemName nvarchar(250) NOT NULL,
    Uom nvarchar(20) NULL,
    Qty decimal(18, 3) NOT NULL,
    Rate decimal(18, 2) NOT NULL CONSTRAINT DF_MaterialIssueItemLns_Rate DEFAULT (0),
    Remarks nvarchar(250) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_MaterialIssueItemLns_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_MaterialIssueItemLns_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MaterialIssueItemLns_Issue' AND object_id = OBJECT_ID('dbo.MaterialIssueItemLns'))
  CREATE INDEX IX_MaterialIssueItemLns_Issue ON dbo.MaterialIssueItemLns (MaterialIssueId);
