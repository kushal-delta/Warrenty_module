/*
  Data fix — warranties linked to the wrong installation (warranty database).

  Symptom: Serial No. Search Report → "Pump set" listed 78 components for one installation. The seed / import of
  02-Nov-2026 pointed almost every warranty at one installation (INS/26-27/0014), although the warranties belong to many
  different customers, each with their own installation.

  Fix: each warranty is linked to the installation of ITS OWN customer — the one installed on the warranty's start date,
  else that customer's nearest installation by date. Only rows whose link is wrong are touched:
    - the current installation belongs to a different customer, or
    - the customer has another installation dated exactly on the warranty start date.
  Nothing is changed when the customer has no installation at all. Safe to run more than once (second run changes 0 rows).

  The old links are kept in dbo.WarrantyInstallationLinkBackup (WarrantyId, OldInstallationId, FixedOn) for reference.

  Run:  node server/run-migration.cjs server/migrations/2026-11-18-fix-warranty-installation-links.sql
*/

IF OBJECT_ID('dbo.WarrantyInstallationLinkBackup') IS NULL
  CREATE TABLE dbo.WarrantyInstallationLinkBackup (
    WarrantyId uniqueidentifier NOT NULL,
    OldInstallationId uniqueidentifier NULL,
    NewInstallationId uniqueidentifier NULL,
    FixedOn datetime2 NOT NULL CONSTRAINT DF_WarrantyInstallationLinkBackup_FixedOn DEFAULT (SYSUTCDATETIME())
  );

DECLARE @fix TABLE (WarrantyId uniqueidentifier PRIMARY KEY, OldInstallationId uniqueidentifier NULL, NewInstallationId uniqueidentifier NOT NULL);

INSERT INTO @fix (WarrantyId, OldInstallationId, NewInstallationId)
SELECT w.WarrantyId, w.InstallationId, best.InstallationId
FROM dbo.Warranties w
LEFT JOIN dbo.Installations cur ON cur.InstallationId = w.InstallationId
CROSS APPLY (
  SELECT TOP 1 i.InstallationId, CASE WHEN CONVERT(date, i.InstallDate) = CONVERT(date, w.StartDate) THEN 1 ELSE 0 END AS ExactDate
  FROM dbo.Installations i
  WHERE i.CustomerId = w.CustomerId
  ORDER BY CASE WHEN CONVERT(date, i.InstallDate) = CONVERT(date, w.StartDate) THEN 0 ELSE 1 END,
           ABS(DATEDIFF(day, i.InstallDate, w.StartDate)), i.InstallNo
) best
WHERE w.CustomerId IS NOT NULL
  AND (w.InstallationId IS NULL OR best.InstallationId <> w.InstallationId)
  AND (cur.InstallationId IS NULL OR cur.CustomerId <> w.CustomerId OR best.ExactDate = 1);

INSERT INTO dbo.WarrantyInstallationLinkBackup (WarrantyId, OldInstallationId, NewInstallationId)
SELECT WarrantyId, OldInstallationId, NewInstallationId FROM @fix;

UPDATE w SET w.InstallationId = f.NewInstallationId
FROM dbo.Warranties w JOIN @fix f ON f.WarrantyId = w.WarrantyId;

SELECT COUNT(*) AS WarrantiesRelinked FROM @fix;
