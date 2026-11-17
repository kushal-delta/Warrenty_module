/**
 * SQL for a list query's [ItemNames] column: the document's item names in line order, joined with " || "
 * (item names may contain commas). FOR XML PATH keeps it working on older SQL Server compatibility levels.
 *   from  — line table(s) with alias `l` providing [ItemName] and [LineNo], e.g. "dbo.[MaterialRequestItemLns] l"
 *   where — join to the header row, e.g. "l.[MaterialRequestId] = r.[MaterialRequestId]"
 */
export const itemNamesSql = (from: string, where: string) =>
  `STUFF((SELECT N' || ' + l.[ItemName] FROM ${from} WHERE ${where} ORDER BY l.[LineNo] FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 4, N'') AS [ItemNames]`;
