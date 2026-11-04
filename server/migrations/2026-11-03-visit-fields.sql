/*
  Visit report parity with the prototype: time in/out, travel km, travel & other expenses, customer rating, from / to.
  Additive and idempotent — every column is optional, so existing visits keep working.

  Run:  node server/run-migration.cjs server/migrations/2026-11-03-visit-fields.sql
*/
IF COL_LENGTH('dbo.VisitReports', 'StartTime') IS NULL ALTER TABLE dbo.VisitReports ADD StartTime nvarchar(5) NULL;
IF COL_LENGTH('dbo.VisitReports', 'EndTime') IS NULL ALTER TABLE dbo.VisitReports ADD EndTime nvarchar(5) NULL;
IF COL_LENGTH('dbo.VisitReports', 'TravelKm') IS NULL ALTER TABLE dbo.VisitReports ADD TravelKm int NULL;
IF COL_LENGTH('dbo.VisitReports', 'TravelExpense') IS NULL ALTER TABLE dbo.VisitReports ADD TravelExpense decimal(18, 2) NULL;
IF COL_LENGTH('dbo.VisitReports', 'OtherExpense') IS NULL ALTER TABLE dbo.VisitReports ADD OtherExpense decimal(18, 2) NULL;
IF COL_LENGTH('dbo.VisitReports', 'CustomerRating') IS NULL ALTER TABLE dbo.VisitReports ADD CustomerRating tinyint NULL;
IF COL_LENGTH('dbo.VisitReports', 'FromLocation') IS NULL ALTER TABLE dbo.VisitReports ADD FromLocation nvarchar(100) NULL;
IF COL_LENGTH('dbo.VisitReports', 'ToLocation') IS NULL ALTER TABLE dbo.VisitReports ADD ToLocation nvarchar(100) NULL;
