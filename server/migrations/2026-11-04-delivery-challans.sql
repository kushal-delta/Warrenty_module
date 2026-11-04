/*
  Delivery Challan (Spares Stock → Delivery Challan) and the TextLists master behind its dropdowns.
   - dbo.TextLists: small user-extendable lists, one ListGroup each — ChallanPurpose, PartyKind, Transporter.
     New values are added straight from the challan form ("Add new purpose" …).
   - dbo.DeliveryChallans + dbo.DeliveryChallanItemLns: header and items sent. Dispatch store is an iERP dbo.Locs row
     (id + name copied); an item is an iERP item (ErpItmId) or a Spares master spare (SpareId), as on material requests.
  Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-04-delivery-challans.sql
*/

IF OBJECT_ID('dbo.TextLists') IS NULL
  CREATE TABLE dbo.TextLists (
    TextListId uniqueidentifier NOT NULL CONSTRAINT PK_TextLists PRIMARY KEY,
    ListGroup nvarchar(40) NOT NULL,
    Value nvarchar(120) NOT NULL,
    SortOrder int NOT NULL CONSTRAINT DF_TextLists_SortOrder DEFAULT (100),
    IsActive bit NOT NULL CONSTRAINT DF_TextLists_IsActive DEFAULT (1),
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_TextLists_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_TextLists_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TextLists_Group_Value' AND object_id = OBJECT_ID('dbo.TextLists'))
  CREATE UNIQUE INDEX UX_TextLists_Group_Value ON dbo.TextLists (ListGroup, Value);

-- Starting values (only the ones not there yet)
INSERT INTO dbo.TextLists (TextListId, ListGroup, Value, SortOrder)
SELECT NEWID(), v.ListGroup, v.Value, v.SortOrder
FROM (VALUES
  ('ChallanPurpose', 'Job work', 1), ('ChallanPurpose', 'Repair', 2), ('ChallanPurpose', 'Testing', 3), ('ChallanPurpose', 'Calibration', 4),
  ('ChallanPurpose', 'Sample approval', 5), ('ChallanPurpose', 'Exhibition', 6), ('ChallanPurpose', 'Replacement', 7), ('ChallanPurpose', 'Free supply', 8),
  ('PartyKind', 'Job worker', 1), ('PartyKind', 'Service center', 2), ('PartyKind', 'Supplier', 3), ('PartyKind', 'Customer', 4)
) v (ListGroup, Value, SortOrder)
WHERE NOT EXISTS (SELECT 1 FROM dbo.TextLists t WHERE t.ListGroup = v.ListGroup AND t.Value = v.Value);

IF OBJECT_ID('dbo.DeliveryChallans') IS NULL
  CREATE TABLE dbo.DeliveryChallans (
    DeliveryChallanId uniqueidentifier NOT NULL CONSTRAINT PK_DeliveryChallans PRIMARY KEY,
    ChallanNo nvarchar(30) NOT NULL,
    ChallanDate date NOT NULL,
    ChallanType nvarchar(20) NOT NULL,              -- 'Returnable' | 'Non-returnable'
    Purpose nvarchar(120) NOT NULL,
    DispatchLocId uniqueidentifier NULL,             -- SolarativeiERP dbo.Locs.LocId (no FK: other database)
    DispatchLocName nvarchar(150) NULL,
    ExpectedBackBy date NULL,
    PartyKind nvarchar(120) NULL,
    ServiceCenterId uniqueidentifier NOT NULL CONSTRAINT FK_DeliveryChallans_ServiceCenters REFERENCES dbo.ServiceCenters (ServiceCenterId),
    MaterialRequestId uniqueidentifier NULL CONSTRAINT FK_DeliveryChallans_MaterialRequests REFERENCES dbo.MaterialRequests (MaterialRequestId),
    TransporterName nvarchar(150) NULL,
    TransportMode nvarchar(20) NULL,                 -- Road | Rail | Air | Ship | Courier
    VehicleNo nvarchar(30) NULL,
    LrNo nvarchar(50) NULL,
    TotalValue decimal(18, 2) NOT NULL CONSTRAINT DF_DeliveryChallans_TotalValue DEFAULT (0),
    Status nvarchar(20) NOT NULL CONSTRAINT DF_DeliveryChallans_Status DEFAULT ('Dispatched'),
    Remarks nvarchar(500) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_DeliveryChallans_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_DeliveryChallans_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_DeliveryChallans_ChallanNo' AND object_id = OBJECT_ID('dbo.DeliveryChallans'))
  CREATE UNIQUE INDEX UX_DeliveryChallans_ChallanNo ON dbo.DeliveryChallans (ChallanNo);

IF OBJECT_ID('dbo.DeliveryChallanItemLns') IS NULL
  CREATE TABLE dbo.DeliveryChallanItemLns (
    DeliveryChallanItemLnId uniqueidentifier NOT NULL CONSTRAINT PK_DeliveryChallanItemLns PRIMARY KEY,
    DeliveryChallanId uniqueidentifier NOT NULL CONSTRAINT FK_DeliveryChallanItemLns_DeliveryChallans REFERENCES dbo.DeliveryChallans (DeliveryChallanId) ON DELETE CASCADE,
    [LineNo] int NOT NULL,
    ItemSource nvarchar(10) NOT NULL,               -- 'ERP' | 'LOCAL'
    ErpItmId uniqueidentifier NULL,
    SpareId uniqueidentifier NULL CONSTRAINT FK_DeliveryChallanItemLns_Spares REFERENCES dbo.Spares (SpareId),
    ItemCode nvarchar(60) NULL,
    ItemName nvarchar(250) NOT NULL,
    Uom nvarchar(20) NULL,
    Qty decimal(18, 3) NOT NULL,
    Rate decimal(18, 2) NOT NULL CONSTRAINT DF_DeliveryChallanItemLns_Rate DEFAULT (0),
    Amount decimal(18, 2) NOT NULL CONSTRAINT DF_DeliveryChallanItemLns_Amount DEFAULT (0),
    Remarks nvarchar(250) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_DeliveryChallanItemLns_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_DeliveryChallanItemLns_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DeliveryChallanItemLns_Challan' AND object_id = OBJECT_ID('dbo.DeliveryChallanItemLns'))
  CREATE INDEX IX_DeliveryChallanItemLns_Challan ON dbo.DeliveryChallanItemLns (DeliveryChallanId);
