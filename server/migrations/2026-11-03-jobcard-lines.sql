/*
  Job card form parity with the prototype (labour lines, GST, other charges, line serial, own centre / engineer).
  Additive and idempotent — safe to run more than once. Existing rows keep working:
  every old line becomes ItemType = 'Spare' with 0 % GST.

  Run:  node server/run-migration.cjs server/migrations/2026-11-03-jobcard-lines.sql
*/

-- Job card lines: a line is a Spare (SpareId) or Labour (LabourMasterId)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.JobCardItemLns') AND name = 'SpareId' AND is_nullable = 0)
  ALTER TABLE dbo.JobCardItemLns ALTER COLUMN SpareId uniqueidentifier NULL;
IF COL_LENGTH('dbo.JobCardItemLns', 'ItemType') IS NULL
  ALTER TABLE dbo.JobCardItemLns ADD ItemType nvarchar(10) NOT NULL CONSTRAINT DF_JobCardItemLns_ItemType DEFAULT ('Spare');
IF COL_LENGTH('dbo.JobCardItemLns', 'LabourMasterId') IS NULL
  ALTER TABLE dbo.JobCardItemLns ADD LabourMasterId uniqueidentifier NULL CONSTRAINT FK_JobCardItemLns_LabourMasters REFERENCES dbo.LabourMasters (LabourMasterId);
IF COL_LENGTH('dbo.JobCardItemLns', 'LineNo') IS NULL
  ALTER TABLE dbo.JobCardItemLns ADD [LineNo] int NULL;
IF COL_LENGTH('dbo.JobCardItemLns', 'SerialNo') IS NULL
  ALTER TABLE dbo.JobCardItemLns ADD SerialNo nvarchar(60) NULL;
IF COL_LENGTH('dbo.JobCardItemLns', 'GstPct') IS NULL
  ALTER TABLE dbo.JobCardItemLns ADD GstPct decimal(5, 2) NOT NULL CONSTRAINT DF_JobCardItemLns_GstPct DEFAULT (0);
IF COL_LENGTH('dbo.JobCardItemLns', 'GstAmount') IS NULL
  ALTER TABLE dbo.JobCardItemLns ADD GstAmount decimal(18, 2) NOT NULL CONSTRAINT DF_JobCardItemLns_GstAmount DEFAULT (0);
IF COL_LENGTH('dbo.JobCardItemLns', 'Remarks') IS NULL
  ALTER TABLE dbo.JobCardItemLns ADD Remarks nvarchar(250) NULL;

-- Job card header: GST total, other charges, its own service centre and engineer
IF COL_LENGTH('dbo.JobCards', 'GstTotal') IS NULL
  ALTER TABLE dbo.JobCards ADD GstTotal decimal(18, 2) NOT NULL CONSTRAINT DF_JobCards_GstTotal DEFAULT (0);
IF COL_LENGTH('dbo.JobCards', 'OtherCharges') IS NULL
  ALTER TABLE dbo.JobCards ADD OtherCharges decimal(18, 2) NOT NULL CONSTRAINT DF_JobCards_OtherCharges DEFAULT (0);
IF COL_LENGTH('dbo.JobCards', 'ServiceCenterId') IS NULL
  ALTER TABLE dbo.JobCards ADD ServiceCenterId uniqueidentifier NULL CONSTRAINT FK_JobCards_ServiceCenters REFERENCES dbo.ServiceCenters (ServiceCenterId);
IF COL_LENGTH('dbo.JobCards', 'EngineerUserId') IS NULL
  ALTER TABLE dbo.JobCards ADD EngineerUserId uniqueidentifier NULL CONSTRAINT FK_JobCards_Engineer REFERENCES dbo.Users (UserId);

-- Default GST % on the masters (copied onto each line, editable there)
IF COL_LENGTH('dbo.Spares', 'GstPct') IS NULL
  ALTER TABLE dbo.Spares ADD GstPct decimal(5, 2) NOT NULL CONSTRAINT DF_Spares_GstPct DEFAULT (18);
IF COL_LENGTH('dbo.LabourMasters', 'GstPct') IS NULL
  ALTER TABLE dbo.LabourMasters ADD GstPct decimal(5, 2) NOT NULL CONSTRAINT DF_LabourMasters_GstPct DEFAULT (18);
