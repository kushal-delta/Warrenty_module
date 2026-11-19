-- Spares master now also holds products: ItemType = 'SPARE' (default) or 'PRODUCT'.
-- Products use the same SpareId everywhere (stock, GRN, challans, issues, job cards), so they show up in every item dropdown.
IF COL_LENGTH('dbo.Spares', 'ItemType') IS NULL
  ALTER TABLE dbo.[Spares] ADD [ItemType] NVARCHAR(10) NOT NULL CONSTRAINT DF_Spares_ItemType DEFAULT 'SPARE';
