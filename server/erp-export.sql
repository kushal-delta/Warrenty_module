SELECT (
 SELECT CompanyId,Name,AddressLine1,AddressLine2,City,State,PINCode,TelephoneNos,EmailIDs,Website,GSTNo FROM dbo.Company FOR JSON PATH
) companies, (
 SELECT StateId,StateCode,Name FROM dbo.State FOR JSON PATH
) states, (
 SELECT DistrictId,StateId,Name FROM dbo.Districts FOR JSON PATH
) districts, (
 SELECT i.ItmId,i.Name,i.Alias,i.HP,i.kW,i.Voltage,i.HeadRange,i.Discharge,i.InEffectiveOn
 FROM dbo.Itms i JOIN dbo.SubGrps s ON s.SubGrpId=i.SubGrpId
 WHERE s.Name='FINISH GOODS' FOR JSON PATH
) products, (
 SELECT l.LgrId,l.Name,l.Code,l.MobileNo,l.EmailId,l.DisableStatus,l.ServiceCenter,l.FieldService,l.UnderLgrId,
 a.StreetAddress,a.City,a.StateId,a.ZipOrPostalCode,a.GSTNo,a.ContactPerson1Name
 FROM dbo.Lgrs l OUTER APPLY (SELECT TOP 1 * FROM dbo.LgrAddresses a WHERE a.LgrId=l.LgrId ORDER BY a.IsDefault DESC,a.LgrAddressId) a
 WHERE NULLIF(LTRIM(RTRIM(l.ServiceCenter)),'') IS NOT NULL OR NULLIF(LTRIM(RTRIM(l.FieldService)),'') IS NOT NULL
 FOR JSON PATH
) ledgers;
