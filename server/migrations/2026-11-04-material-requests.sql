/*
  Material Request (Spares Stock → Material Request): a header per request and its item lines.
  An item line is either an iERP item (dbo.Itms in SolarativeiERP, ItemSource = 'ERP', ErpItmId) or a spare
  from the local Spares master (ItemSource = 'LOCAL', SpareId). Code / name / unit are copied onto the line
  so the request still reads correctly if the master changes later.
  Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-04-material-requests.sql
*/

IF OBJECT_ID('dbo.MaterialRequests') IS NULL
  CREATE TABLE dbo.MaterialRequests (
    MaterialRequestId uniqueidentifier NOT NULL CONSTRAINT PK_MaterialRequests PRIMARY KEY,
    RequestNo nvarchar(30) NOT NULL,
    RequestType nvarchar(20) NOT NULL,            -- 'Product' | 'Spare'
    ServiceCenterId uniqueidentifier NOT NULL CONSTRAINT FK_MaterialRequests_ServiceCenters REFERENCES dbo.ServiceCenters (ServiceCenterId),
    RequestDate date NOT NULL,
    RequiredBy date NULL,
    Priority nvarchar(20) NOT NULL CONSTRAINT DF_MaterialRequests_Priority DEFAULT ('Normal'),
    Status nvarchar(20) NOT NULL CONSTRAINT DF_MaterialRequests_Status DEFAULT ('Pending'),
    Remarks nvarchar(500) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_MaterialRequests_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_MaterialRequests_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_MaterialRequests_RequestNo' AND object_id = OBJECT_ID('dbo.MaterialRequests'))
  CREATE UNIQUE INDEX UX_MaterialRequests_RequestNo ON dbo.MaterialRequests (RequestNo);

IF OBJECT_ID('dbo.MaterialRequestItemLns') IS NULL
  CREATE TABLE dbo.MaterialRequestItemLns (
    MaterialRequestItemLnId uniqueidentifier NOT NULL CONSTRAINT PK_MaterialRequestItemLns PRIMARY KEY,
    MaterialRequestId uniqueidentifier NOT NULL CONSTRAINT FK_MaterialRequestItemLns_MaterialRequests REFERENCES dbo.MaterialRequests (MaterialRequestId) ON DELETE CASCADE,
    [LineNo] int NOT NULL,
    ItemSource nvarchar(10) NOT NULL,             -- 'ERP' | 'LOCAL'
    ErpItmId uniqueidentifier NULL,               -- SolarativeiERP dbo.Itms.ItmId (no FK: other database)
    SpareId uniqueidentifier NULL CONSTRAINT FK_MaterialRequestItemLns_Spares REFERENCES dbo.Spares (SpareId),
    ItemCode nvarchar(60) NULL,
    ItemName nvarchar(250) NOT NULL,
    Uom nvarchar(20) NULL,
    Qty decimal(18, 3) NOT NULL,
    Remarks nvarchar(250) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_MaterialRequestItemLns_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_MaterialRequestItemLns_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MaterialRequestItemLns_Request' AND object_id = OBJECT_ID('dbo.MaterialRequestItemLns'))
  CREATE INDEX IX_MaterialRequestItemLns_Request ON dbo.MaterialRequestItemLns (MaterialRequestId);
