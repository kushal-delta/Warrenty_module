/* ============================================================================
   Delta Warranty & Service — server database update (SolarativeiWarranty)
   All schema changes of 04-Nov-2026, in the order they must run, plus the
   warehouse-login screen rights. Every step is idempotent: safe to run again.

   Run in SQL Server Management Studio against the WARRANTY database
   (not the iERP database). Take a backup first.
   ============================================================================ */

/* ---------------------------------------------------------------- STEP 1 of 9: Material Request (MaterialRequests, MaterialRequestItemLns)  [2026-11-04-material-requests.sql] */
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
GO

/* ---------------------------------------------------------------- STEP 2 of 9: Material Request approval (decision columns)  [2026-11-04-material-request-approval.sql] */
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
GO

/* ---------------------------------------------------------------- STEP 3 of 9: Delivery Challan + Text Lists (TextLists, DeliveryChallans, DeliveryChallanItemLns)  [2026-11-04-delivery-challans.sql] */
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
GO

/* ---------------------------------------------------------------- STEP 4 of 9: Warehouses master (Warehouses)  [2026-11-04-warehouses.sql] */
/*
  Warehouses master (Configuration → Service Centers / Warehouses, type "Warehouse").
  Kept in the warranty database only — unlike service centres, a warehouse is NOT a ledger in the iERP.
  Each warehouse has one login (dbo.Users, role WAREHOUSE) linked through LoginUserId.
  Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-04-warehouses.sql
*/

IF OBJECT_ID('dbo.Warehouses') IS NULL
  CREATE TABLE dbo.Warehouses (
    WarehouseId uniqueidentifier NOT NULL CONSTRAINT PK_Warehouses PRIMARY KEY,
    WarehouseCode nvarchar(30) NOT NULL,
    WarehouseName nvarchar(150) NOT NULL,
    Location nvarchar(300) NOT NULL,
    ContactNumber nvarchar(20) NOT NULL,
    Email nvarchar(120) NULL,
    CapacitySqft decimal(18, 2) NULL,
    Latitude decimal(9, 6) NULL,
    Longitude decimal(9, 6) NULL,
    Description nvarchar(500) NULL,
    LoginUserId uniqueidentifier NULL CONSTRAINT FK_Warehouses_Users REFERENCES dbo.Users (UserId),
    IsActive bit NOT NULL CONSTRAINT DF_Warehouses_IsActive DEFAULT (1),
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_Warehouses_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_Warehouses_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Warehouses_Code' AND object_id = OBJECT_ID('dbo.Warehouses'))
  CREATE UNIQUE INDEX UX_Warehouses_Code ON dbo.Warehouses (WarehouseCode);
GO

/* ---------------------------------------------------------------- STEP 5 of 9: Material Request raised for a warehouse (MaterialRequests.WarehouseId)  [2026-11-04-material-request-warehouse.sql] */
/*
  Material Request: raised for a WAREHOUSE (instead of a service centre).
   - dbo.MaterialRequests.WarehouseId: the warehouse the material is requested for (required on new requests by the app).
   - ServiceCenterId becomes optional: older requests keep their service centre; a service-centre / manager login
     still has its own centre stored on the request (used for who-sees-what).
  Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-04-material-request-warehouse.sql
*/

IF COL_LENGTH('dbo.MaterialRequests', 'WarehouseId') IS NULL
  ALTER TABLE dbo.MaterialRequests ADD WarehouseId uniqueidentifier NULL CONSTRAINT FK_MaterialRequests_Warehouses REFERENCES dbo.Warehouses (WarehouseId);

-- ServiceCenterId: NOT NULL -> NULL (the foreign key has to be dropped and re-added around the change)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MaterialRequests') AND name = 'ServiceCenterId' AND is_nullable = 0)
BEGIN
  IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MaterialRequests_ServiceCenters')
    ALTER TABLE dbo.MaterialRequests DROP CONSTRAINT FK_MaterialRequests_ServiceCenters;
  ALTER TABLE dbo.MaterialRequests ALTER COLUMN ServiceCenterId uniqueidentifier NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_MaterialRequests_ServiceCenters')
  ALTER TABLE dbo.MaterialRequests ADD CONSTRAINT FK_MaterialRequests_ServiceCenters FOREIGN KEY (ServiceCenterId) REFERENCES dbo.ServiceCenters (ServiceCenterId);
GO

/* ---------------------------------------------------------------- STEP 6 of 9: Challan job worker = warehouse + Goods Receipt (ChallanReceipts, ChallanReceiptItemLns)  [2026-11-04-challan-receipts.sql] */
/*
  Delivery Challan → warehouse as the job worker, and Goods Receipt (GRN) against a delivery challan.
   - dbo.DeliveryChallans.WarehouseId: the warehouse the material is sent to (Job worker dropdown).
     ServiceCenterId becomes optional: older challans keep their service centre; new ones carry the
     material request's centre when raised against one.
   - dbo.ChallanReceipts + dbo.ChallanReceiptItemLns: goods received against a challan, line by line
     (received quantity per challan line; the challan's own status is not changed).
  Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-04-challan-receipts.sql
*/

IF COL_LENGTH('dbo.DeliveryChallans', 'WarehouseId') IS NULL
  ALTER TABLE dbo.DeliveryChallans ADD WarehouseId uniqueidentifier NULL CONSTRAINT FK_DeliveryChallans_Warehouses REFERENCES dbo.Warehouses (WarehouseId);

-- ServiceCenterId: NOT NULL -> NULL (the foreign key has to be dropped and re-added around the change)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.DeliveryChallans') AND name = 'ServiceCenterId' AND is_nullable = 0)
BEGIN
  IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_DeliveryChallans_ServiceCenters')
    ALTER TABLE dbo.DeliveryChallans DROP CONSTRAINT FK_DeliveryChallans_ServiceCenters;
  ALTER TABLE dbo.DeliveryChallans ALTER COLUMN ServiceCenterId uniqueidentifier NULL;
END
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_DeliveryChallans_ServiceCenters')
  ALTER TABLE dbo.DeliveryChallans ADD CONSTRAINT FK_DeliveryChallans_ServiceCenters FOREIGN KEY (ServiceCenterId) REFERENCES dbo.ServiceCenters (ServiceCenterId);

IF OBJECT_ID('dbo.ChallanReceipts') IS NULL
  CREATE TABLE dbo.ChallanReceipts (
    ChallanReceiptId uniqueidentifier NOT NULL CONSTRAINT PK_ChallanReceipts PRIMARY KEY,
    ReceiptNo nvarchar(30) NOT NULL,
    ReceiptDate date NOT NULL,
    DeliveryChallanId uniqueidentifier NOT NULL CONSTRAINT FK_ChallanReceipts_DeliveryChallans REFERENCES dbo.DeliveryChallans (DeliveryChallanId),
    WarehouseId uniqueidentifier NULL CONSTRAINT FK_ChallanReceipts_Warehouses REFERENCES dbo.Warehouses (WarehouseId),
    Remarks nvarchar(500) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_ChallanReceipts_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_ChallanReceipts_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_ChallanReceipts_ReceiptNo' AND object_id = OBJECT_ID('dbo.ChallanReceipts'))
  CREATE UNIQUE INDEX UX_ChallanReceipts_ReceiptNo ON dbo.ChallanReceipts (ReceiptNo);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChallanReceipts_Challan' AND object_id = OBJECT_ID('dbo.ChallanReceipts'))
  CREATE INDEX IX_ChallanReceipts_Challan ON dbo.ChallanReceipts (DeliveryChallanId);

IF OBJECT_ID('dbo.ChallanReceiptItemLns') IS NULL
  CREATE TABLE dbo.ChallanReceiptItemLns (
    ChallanReceiptItemLnId uniqueidentifier NOT NULL CONSTRAINT PK_ChallanReceiptItemLns PRIMARY KEY,
    ChallanReceiptId uniqueidentifier NOT NULL CONSTRAINT FK_ChallanReceiptItemLns_ChallanReceipts REFERENCES dbo.ChallanReceipts (ChallanReceiptId) ON DELETE CASCADE,
    DeliveryChallanItemLnId uniqueidentifier NOT NULL CONSTRAINT FK_ChallanReceiptItemLns_ChallanItems REFERENCES dbo.DeliveryChallanItemLns (DeliveryChallanItemLnId),
    QtyReceived decimal(18, 3) NOT NULL,
    Remarks nvarchar(250) NULL,
    InsertedByUserId uniqueidentifier NULL,
    LastUpdatedByUserId uniqueidentifier NULL,
    InsertedOn datetime2 NOT NULL CONSTRAINT DF_ChallanReceiptItemLns_InsertedOn DEFAULT (SYSUTCDATETIME()),
    LastUpdatedOn datetime2 NOT NULL CONSTRAINT DF_ChallanReceiptItemLns_LastUpdatedOn DEFAULT (SYSUTCDATETIME())
  );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChallanReceiptItemLns_Line' AND object_id = OBJECT_ID('dbo.ChallanReceiptItemLns'))
  CREATE INDEX IX_ChallanReceiptItemLns_Line ON dbo.ChallanReceiptItemLns (DeliveryChallanItemLnId);
GO

/* ---------------------------------------------------------------- STEP 7 of 9: Defective / Fresh Receipt (ChallanReturns, ChallanReturnItemLns)  [2026-11-04-challan-returns.sql] */
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
GO

/* ---------------------------------------------------------------- STEP 8 of 9: Material Issue (MaterialIssues, MaterialIssueItemLns)  [2026-11-04-material-issues.sql] */
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
GO

/* ---------------------------------------------------------------- STEP 9 of 9: warehouse logins — add the suggested warehouse screens (keeps existing ones) */
/* One-off: give existing warehouse logins the suggested warehouse screens.
   Keeps any screens they already have (union), so nothing is taken away. */
DECLARE @defaults nvarchar(400) = N'warranty.search,stock.requests,stock.challans,stock.grn,stock.dcreturn,stock.issue,stock.material-reports,stock.warehouse-stock';

UPDATE u SET
  [FormRights] = (SELECT STRING_AGG(x.[v], ',') FROM (SELECT DISTINCT LTRIM(RTRIM(s.[value])) AS [v] FROM STRING_SPLIT(CONCAT(ISNULL(u.[FormRights], N''), N',', @defaults), ',') s WHERE LTRIM(RTRIM(s.[value])) <> N'') x),
  [LastUpdatedOn] = SYSUTCDATETIME()
FROM dbo.[Users] u
WHERE u.[Role] = 'WAREHOUSE' AND ISNULL(u.[IsAdmin], 0) = 0;
GO

/* Check: the new tables */
SELECT name FROM sys.tables WHERE name IN ('MaterialRequests','MaterialRequestItemLns','TextLists','DeliveryChallans','DeliveryChallanItemLns','Warehouses','ChallanReceipts','ChallanReceiptItemLns','ChallanReturns','ChallanReturnItemLns','MaterialIssues','MaterialIssueItemLns') ORDER BY name;
GO
