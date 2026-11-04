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
