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
