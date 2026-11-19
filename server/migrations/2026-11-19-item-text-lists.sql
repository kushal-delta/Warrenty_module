-- Unit and Category of the Spares & Products master now come from Text Lists (ListGroup ItemUnit / ItemCategory).
-- Seed them from the values already used on the master plus common units.
INSERT INTO dbo.TextLists (TextListId, ListGroup, Value, SortOrder)
SELECT NEWID(), v.ListGroup, MIN(v.Value), MIN(v.SortOrder)
FROM (
  SELECT 'ItemUnit' AS ListGroup, LTRIM(RTRIM([Uom])) AS Value, 100 AS SortOrder FROM dbo.[Spares] WHERE [Uom] IS NOT NULL AND LTRIM(RTRIM([Uom])) <> ''
  UNION SELECT 'ItemCategory', LTRIM(RTRIM([Category])), 100 FROM dbo.[Spares] WHERE [Category] IS NOT NULL AND LTRIM(RTRIM([Category])) <> ''
  UNION SELECT 'ItemUnit', 'Nos', 1 UNION SELECT 'ItemUnit', 'Pcs', 2 UNION SELECT 'ItemUnit', 'Set', 3 UNION SELECT 'ItemUnit', 'Pair', 4
  UNION SELECT 'ItemUnit', 'Kg', 5 UNION SELECT 'ItemUnit', 'Mtr', 6 UNION SELECT 'ItemUnit', 'Ltr', 7 UNION SELECT 'ItemUnit', 'Box', 8
  UNION SELECT 'ItemCategory', 'Pump', 1 UNION SELECT 'ItemCategory', 'Motor', 2 UNION SELECT 'ItemCategory', 'Controller', 3
) v
WHERE NOT EXISTS (SELECT 1 FROM dbo.TextLists t WHERE t.ListGroup = v.ListGroup AND LOWER(t.Value) = LOWER(v.Value))
GROUP BY v.ListGroup, LOWER(v.Value);
