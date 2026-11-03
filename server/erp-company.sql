SELECT CompanyId, Name AS CompanyName,
 LTRIM(RTRIM(CONCAT(AddressLine1, CASE WHEN NULLIF(AddressLine2,'') IS NOT NULL THEN ', ' ELSE '' END, AddressLine2))) AS Address,
 City, State, PINCode AS Pincode, TelephoneNos AS Phone, MobileNo AS Mobile,
 EmailIDs AS Email, ServiceEmailId AS ServiceEmail, Website, GSTNo AS Gstin,
 Country, CINNO AS Cin, LastUpdatedOn
FROM dbo.Company ORDER BY CompanyId;
