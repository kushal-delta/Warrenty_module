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
