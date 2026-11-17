/*
  Warehouses: State (dropdown, like service centers) — warranty database.
  The warehouse manager is still dbo.Warehouses.LoginUserId: it now points to a User Management user of role
  WAREHOUSE ("Warehouse Manager") picked in the warehouse form, instead of a login created by the form.
  Additive and idempotent — safe to run more than once.

  Run:  node server/run-migration.cjs server/migrations/2026-11-16-warehouse-state.sql
*/

IF COL_LENGTH('dbo.Warehouses', 'StateId') IS NULL
BEGIN
  -- Same data type as dbo.States.StateId.
  DECLARE @type sysname;
  SELECT @type = TYPE_NAME(user_type_id) FROM sys.columns WHERE object_id = OBJECT_ID('dbo.States') AND name = 'StateId';
  IF @type IN ('uniqueidentifier', 'int', 'bigint', 'smallint')
    EXEC('ALTER TABLE dbo.Warehouses ADD StateId ' + @type + ' NULL');
  ELSE
    EXEC('ALTER TABLE dbo.Warehouses ADD StateId nvarchar(50) NULL');
END
