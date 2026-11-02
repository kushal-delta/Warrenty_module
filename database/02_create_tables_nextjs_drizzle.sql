-- ============================================================================
-- Delta iERP - Warranty & Service Module (Next.js 2.0 Pure Architecture)
-- Database Target: PostgreSQL 13+
-- Database Name: Warrenty_Module_Nextjs
-- Conforms strictly to RULES 1 (1).md:
--   - PascalCase Plural table names
--   - UUID Primary Keys (gen_random_uuid())
--   - Line/Detail tables end with 'Lns'
--   - Mandatory audit columns on EVERY table (UTC with timezone):
--       InsertedOn (defaultNow)
--       LastUpdatedOn (defaultNow)
--       InsertedByUserId (references Users.UserId, onDelete: "set null")
--       LastUpdatedByUserId (references Users.UserId, onDelete: "set null")
--   - Foreign Key Delete Rule: ALL business FKs use onDelete: "restrict", NEVER cascade
--   - 1-based SortOrder
-- ============================================================================

BEGIN;

-- ------------------------------------------------------------------ 1. USERS
-- Initial anchor table for all audit references
CREATE TABLE IF NOT EXISTS "Users" (
    "UserId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Username" VARCHAR(50) NOT NULL CONSTRAINT "uq_Users_Username" UNIQUE,
    "Password" VARCHAR(255) NOT NULL,
    "FirstName" VARCHAR(80) NOT NULL,
    "LastName" VARCHAR(80),
    "Email" VARCHAR(120),
    "Phone" VARCHAR(20),
    "Address" VARCHAR(255),
    "Role" VARCHAR(30) NOT NULL, -- SUPER, HO, MANAGER, ENGINEER, DEALER, CUSTOMER
    "StateRights" TEXT,
    "DistrictRights" TEXT,
    "FormRights" TEXT,
    "ServiceCenterId" UUID, -- FK resolved below
    "IsActive" BOOLEAN DEFAULT true NOT NULL,
    "IsAdmin" BOOLEAN DEFAULT false NOT NULL,
    "LastLogin" TIMESTAMP WITH TIME ZONE,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID,
    "LastUpdatedByUserId" UUID
);

-- Self-referential audit FKs for Users
ALTER TABLE "Users" ADD CONSTRAINT "fk_Users_InsertedBy" FOREIGN KEY ("InsertedByUserId") REFERENCES "Users"("UserId") ON DELETE SET NULL;
ALTER TABLE "Users" ADD CONSTRAINT "fk_Users_LastUpdatedBy" FOREIGN KEY ("LastUpdatedByUserId") REFERENCES "Users"("UserId") ON DELETE SET NULL;

-- ------------------------------------------------------------------ 2. COMPANIES
CREATE TABLE IF NOT EXISTS "Companies" (
    "CompanyId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "CompanyName" VARCHAR(150) NOT NULL,
    "Tagline" VARCHAR(200),
    "Address" VARCHAR(300),
    "City" VARCHAR(80),
    "State" VARCHAR(80),
    "Pincode" VARCHAR(12),
    "Phone" VARCHAR(30),
    "TollFree" VARCHAR(30),
    "Email" VARCHAR(120),
    "Website" VARCHAR(120),
    "Gstin" VARCHAR(30),
    "WhatsappSender" VARCHAR(30),
    "WarrantyTerms" TEXT,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 3. STATES
CREATE TABLE IF NOT EXISTS "States" (
    "StateId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "StateCode" VARCHAR(10) NOT NULL CONSTRAINT "uq_States_StateCode" UNIQUE,
    "StateName" VARCHAR(80) NOT NULL,
    "ShortName" VARCHAR(10),
    "SortOrder" INTEGER DEFAULT 1 NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 4. DISTRICTS
CREATE TABLE IF NOT EXISTS "Districts" (
    "DistrictId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "StateId" UUID NOT NULL REFERENCES "States"("StateId") ON DELETE RESTRICT,
    "DistrictName" VARCHAR(80) NOT NULL,
    "SortOrder" INTEGER DEFAULT 1 NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 5. PRODUCT MODELS
CREATE TABLE IF NOT EXISTS "ProductModels" (
    "ProductModelId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ModelCode" VARCHAR(40) NOT NULL CONSTRAINT "uq_ProductModels_ModelCode" UNIQUE,
    "ModelName" VARCHAR(150) NOT NULL,
    "Category" VARCHAR(20) NOT NULL, -- PUMP, MOTOR, CONTROLLER
    "Hp" NUMERIC(5,2),
    "Kw" NUMERIC(6,3),
    "Technology" VARCHAR(50),
    "VoltageRange" VARCHAR(50),
    "HeadRange" VARCHAR(50),
    "Discharge" VARCHAR(50),
    "SizeInch" VARCHAR(30),
    "WarrantyMonths" INTEGER DEFAULT 24 NOT NULL,
    "Description" VARCHAR(300),
    "IsActive" BOOLEAN DEFAULT true NOT NULL,
    "SortOrder" INTEGER DEFAULT 1 NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 6. PROJECTS (SCHEMES)
CREATE TABLE IF NOT EXISTS "Projects" (
    "ProjectId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ProjectNo" VARCHAR(40) NOT NULL CONSTRAINT "uq_Projects_ProjectNo" UNIQUE,
    "ProjectName" VARCHAR(150) NOT NULL,
    "Scheme" VARCHAR(80),
    "StateId" UUID REFERENCES "States"("StateId") ON DELETE RESTRICT,
    "StartDate" TIMESTAMP WITH TIME ZONE,
    "EndDate" TIMESTAMP WITH TIME ZONE,
    "Status" VARCHAR(30) DEFAULT 'Active' NOT NULL,
    "Remarks" VARCHAR(300),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 7. CALL TYPES (SLAs)
CREATE TABLE IF NOT EXISTS "CallTypes" (
    "CallTypeId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "CallTypeName" VARCHAR(80) NOT NULL CONSTRAINT "uq_CallTypes_CallTypeName" UNIQUE,
    "ValidDays" INTEGER NOT NULL,
    "IsWarranty" BOOLEAN DEFAULT false NOT NULL,
    "Description" VARCHAR(300),
    "IsActive" BOOLEAN DEFAULT true NOT NULL,
    "SortOrder" INTEGER DEFAULT 1 NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 8. FAULT MASTERS
CREATE TABLE IF NOT EXISTS "FaultMasters" (
    "FaultMasterId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Category" VARCHAR(20) NOT NULL,
    "FaultName" VARCHAR(120) NOT NULL,
    "DefaultNature" VARCHAR(300),
    "IsActive" BOOLEAN DEFAULT true NOT NULL,
    "SortOrder" INTEGER DEFAULT 1 NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 9. SERVICE CENTERS
CREATE TABLE IF NOT EXISTS "ServiceCenters" (
    "ServiceCenterId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ServiceCenterCode" VARCHAR(30) CONSTRAINT "uq_ServiceCenters_Code" UNIQUE,
    "ServiceCenterName" VARCHAR(150) NOT NULL,
    "ContactPerson" VARCHAR(100),
    "Mobile" VARCHAR(20),
    "Email" VARCHAR(120),
    "Address" VARCHAR(300),
    "City" VARCHAR(80),
    "District" VARCHAR(80),
    "StateId" UUID REFERENCES "States"("StateId") ON DELETE RESTRICT,
    "Pincode" VARCHAR(12),
    "Gstin" VARCHAR(30),
    "IsActive" BOOLEAN DEFAULT true NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- Add deferred FK from Users to ServiceCenters
ALTER TABLE "Users" ADD CONSTRAINT "fk_Users_ServiceCenter" FOREIGN KEY ("ServiceCenterId") REFERENCES "ServiceCenters"("ServiceCenterId") ON DELETE RESTRICT;

-- ------------------------------------------------------------------ 10. APPROVAL RULES
CREATE TABLE IF NOT EXISTS "ApprovalRules" (
    "ApprovalRuleId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "LevelNo" INTEGER NOT NULL CONSTRAINT "uq_ApprovalRules_LevelNo" UNIQUE,
    "RoleName" VARCHAR(50) NOT NULL,
    "ApproverUserId" UUID REFERENCES "Users"("UserId") ON DELETE RESTRICT,
    "MinAmount" NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
    "MaxAmount" NUMERIC(12,2),
    "Description" VARCHAR(250),
    "IsActive" BOOLEAN DEFAULT true NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 11. SPARES & RATE HISTORY
CREATE TABLE IF NOT EXISTS "Spares" (
    "SpareId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "SpareCode" VARCHAR(40) NOT NULL CONSTRAINT "uq_Spares_SpareCode" UNIQUE,
    "SpareName" VARCHAR(150) NOT NULL,
    "Category" VARCHAR(20),
    "Uom" VARCHAR(20) DEFAULT 'NOS' NOT NULL,
    "CurrentRate" NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
    "MinStock" INTEGER DEFAULT 0 NOT NULL,
    "IsActive" BOOLEAN DEFAULT true NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "SpareRateHistoryLns" (
    "SpareRateHistoryLnId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "SpareId" UUID NOT NULL REFERENCES "Spares"("SpareId") ON DELETE RESTRICT,
    "Rate" NUMERIC(12,2) NOT NULL,
    "EffectiveFrom" TIMESTAMP WITH TIME ZONE NOT NULL,
    "EffectiveTo" TIMESTAMP WITH TIME ZONE,
    "Remarks" VARCHAR(250),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 12. LABOUR MASTERS
CREATE TABLE IF NOT EXISTS "LabourMasters" (
    "LabourMasterId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "LabourCode" VARCHAR(40) NOT NULL CONSTRAINT "uq_LabourMasters_LabourCode" UNIQUE,
    "LabourName" VARCHAR(150) NOT NULL,
    "StandardRate" NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
    "SkillLevel" VARCHAR(40),
    "IsActive" BOOLEAN DEFAULT true NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 13. DEALERS
CREATE TABLE IF NOT EXISTS "Dealers" (
    "DealerId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "DealerCode" VARCHAR(40) CONSTRAINT "uq_Dealers_DealerCode" UNIQUE,
    "FirmName" VARCHAR(150) NOT NULL,
    "ContactPerson" VARCHAR(100),
    "Mobile" VARCHAR(20) NOT NULL,
    "Email" VARCHAR(120),
    "Password" VARCHAR(100),
    "Address" VARCHAR(300),
    "City" VARCHAR(80),
    "District" VARCHAR(80),
    "StateId" UUID REFERENCES "States"("StateId") ON DELETE RESTRICT,
    "Pincode" VARCHAR(12),
    "Gstin" VARCHAR(30),
    "WarrantyMonths" INTEGER,
    "Status" VARCHAR(30) DEFAULT 'Pending' NOT NULL, -- Pending, Approved, Rejected, Blocked
    "SignupOn" TIMESTAMP WITH TIME ZONE,
    "ApprovedBy" VARCHAR(80),
    "ApprovedOn" TIMESTAMP WITH TIME ZONE,
    "Remarks" VARCHAR(300),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 14. CUSTOMERS
CREATE TABLE IF NOT EXISTS "Customers" (
    "CustomerId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "CustomerName" VARCHAR(120) NOT NULL,
    "Mobile" VARCHAR(20) NOT NULL CONSTRAINT "uq_Customers_Mobile" UNIQUE,
    "AltMobile" VARCHAR(20),
    "Email" VARCHAR(120),
    "Address" VARCHAR(300),
    "Village" VARCHAR(100),
    "City" VARCHAR(80),
    "District" VARCHAR(80),
    "StateId" UUID REFERENCES "States"("StateId") ON DELETE RESTRICT,
    "Pincode" VARCHAR(12),
    "Language" VARCHAR(10) DEFAULT 'EN' NOT NULL,
    "LastLogin" TIMESTAMP WITH TIME ZONE,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 15. STICKER BATCHES
CREATE TABLE IF NOT EXISTS "StickerBatches" (
    "StickerBatchId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "BatchNo" VARCHAR(50) NOT NULL CONSTRAINT "uq_StickerBatches_BatchNo" UNIQUE,
    "BatchDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "SupplierName" VARCHAR(100),
    "Remarks" VARCHAR(300),
    "TotalSerials" INTEGER DEFAULT 0 NOT NULL,
    "CreatedBy" VARCHAR(80),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 16. STICKERS (SERIAL REGISTER)
CREATE TABLE IF NOT EXISTS "Stickers" (
    "StickerId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "StickerBatchId" UUID REFERENCES "StickerBatches"("StickerBatchId") ON DELETE RESTRICT,
    "SerialNo" VARCHAR(60) NOT NULL CONSTRAINT "uq_Stickers_SerialNo" UNIQUE,
    "ProductModelId" UUID NOT NULL REFERENCES "ProductModels"("ProductModelId") ON DELETE RESTRICT,
    "Category" VARCHAR(20) NOT NULL,
    "SupplierName" VARCHAR(100),
    "ProductGroup" VARCHAR(60),
    "InvoiceNo" VARCHAR(60),
    "InvoiceDate" TIMESTAMP WITH TIME ZONE,
    "InvoiceLocation" VARCHAR(100),
    "MfgDate" TIMESTAMP WITH TIME ZONE,
    "Status" VARCHAR(30) DEFAULT 'Generated' NOT NULL, -- Generated, Printed, Registered, Replaced, Scrapped
    "PrintCount" INTEGER DEFAULT 0 NOT NULL,
    "LastPrintedOn" TIMESTAMP WITH TIME ZONE,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 17. INSTALLATIONS
CREATE TABLE IF NOT EXISTS "Installations" (
    "InstallationId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "InstallNo" VARCHAR(50) NOT NULL CONSTRAINT "uq_Installations_InstallNo" UNIQUE,
    "CustomerId" UUID NOT NULL REFERENCES "Customers"("CustomerId") ON DELETE RESTRICT,
    "DealerId" UUID REFERENCES "Dealers"("DealerId") ON DELETE RESTRICT,
    "InstallDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "SiteAddress" VARCHAR(300),
    "Village" VARCHAR(100),
    "District" VARCHAR(80),
    "StateId" UUID REFERENCES "States"("StateId") ON DELETE RESTRICT,
    "Pincode" VARCHAR(12),
    "Latitude" NUMERIC(10,6),
    "Longitude" NUMERIC(10,6),
    "BorewellDepthM" INTEGER,
    "DynamicHeadM" INTEGER,
    "PanelKwp" NUMERIC(6,2),
    "ProjectId" UUID REFERENCES "Projects"("ProjectId") ON DELETE RESTRICT,
    "InvoiceNo" VARCHAR(60),
    "InvoiceDate" TIMESTAMP WITH TIME ZONE,
    "RegisteredBy" VARCHAR(40),
    "RegisteredOn" TIMESTAMP WITH TIME ZONE,
    "Remarks" VARCHAR(300),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 18. WARRANTIES
CREATE TABLE IF NOT EXISTS "Warranties" (
    "WarrantyId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "WarrantyNo" VARCHAR(50) NOT NULL CONSTRAINT "uq_Warranties_WarrantyNo" UNIQUE,
    "InstallationId" UUID NOT NULL REFERENCES "Installations"("InstallationId") ON DELETE RESTRICT,
    "SerialNo" VARCHAR(60) NOT NULL CONSTRAINT "uq_Warranties_SerialNo" UNIQUE,
    "StickerId" UUID REFERENCES "Stickers"("StickerId") ON DELETE RESTRICT,
    "Category" VARCHAR(20) NOT NULL,
    "ProductModelId" UUID REFERENCES "ProductModels"("ProductModelId") ON DELETE RESTRICT,
    "CustomerId" UUID REFERENCES "Customers"("CustomerId") ON DELETE RESTRICT,
    "DealerId" UUID REFERENCES "Dealers"("DealerId") ON DELETE RESTRICT,
    "StartDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "WarrantyMonths" INTEGER NOT NULL,
    "ExtendedMonths" INTEGER DEFAULT 0 NOT NULL,
    "EndDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "Status" VARCHAR(30) DEFAULT 'Active' NOT NULL, -- Active, Replaced, Void
    "ReplacedFromSerial" VARCHAR(60),
    "RegisteredBy" VARCHAR(40),
    "RegisteredOn" TIMESTAMP WITH TIME ZONE,
    "WhatsappSent" BOOLEAN DEFAULT false NOT NULL,
    "Remarks" VARCHAR(300),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 19. REPLACEMENTS & LINES
CREATE TABLE IF NOT EXISTS "Replacements" (
    "ReplacementId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ReplNo" VARCHAR(50) NOT NULL CONSTRAINT "uq_Replacements_ReplNo" UNIQUE,
    "ReplDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "Source" VARCHAR(30) NOT NULL,
    "ComplaintId" UUID, -- deferred reference to Complaints
    "DealerId" UUID REFERENCES "Dealers"("DealerId") ON DELETE RESTRICT,
    "VoucherType" VARCHAR(40),
    "DealerInvoiceNo" VARCHAR(60),
    "DealerInvoiceDate" TIMESTAMP WITH TIME ZONE,
    "ReceiptDate" TIMESTAMP WITH TIME ZONE,
    "Transporter" VARCHAR(100),
    "LrNo" VARCHAR(60),
    "LrDate" TIMESTAMP WITH TIME ZONE,
    "ReplacementType" VARCHAR(30),
    "MakeSalesInvoice" BOOLEAN DEFAULT false NOT NULL,
    "NoOfArticles" INTEGER,
    "Reason" VARCHAR(300),
    "Status" VARCHAR(30) DEFAULT 'Open' NOT NULL,
    "CnNo" VARCHAR(50),
    "CnAmount" NUMERIC(12,2),
    "Remarks" VARCHAR(300),
    "CreatedBy" VARCHAR(80),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "ReplacementItemLns" (
    "ReplacementItemLnId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ReplacementId" UUID NOT NULL REFERENCES "Replacements"("ReplacementId") ON DELETE RESTRICT,
    "LineNo" INTEGER NOT NULL,
    "Category" VARCHAR(20),
    "InvoiceItem" VARCHAR(150),
    "ReceivedItem" VARCHAR(150),
    "OldSerialNo" VARCHAR(60),
    "NewSerialNo" VARCHAR(60),
    "Qty" INTEGER DEFAULT 1 NOT NULL,
    "NetValue" NUMERIC(12,2),
    "Location" VARCHAR(80),
    "RefInvoiceNo" VARCHAR(60),
    "RefInvoiceDate" TIMESTAMP WITH TIME ZONE,
    "WarrantyDaysLeft" INTEGER,
    "Charges" NUMERIC(12,2),
    "Remarks" VARCHAR(300),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 20. COMPLAINTS & LINES
CREATE TABLE IF NOT EXISTS "Complaints" (
    "ComplaintId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ComplaintNo" VARCHAR(50) NOT NULL CONSTRAINT "uq_Complaints_ComplaintNo" UNIQUE,
    "CallDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "CallTypeId" UUID NOT NULL REFERENCES "CallTypes"("CallTypeId") ON DELETE RESTRICT,
    "ProjectId" UUID REFERENCES "Projects"("ProjectId") ON DELETE RESTRICT,
    "Priority" VARCHAR(20) DEFAULT 'Medium' NOT NULL,
    "Source" VARCHAR(30),
    "Status" VARCHAR(30) DEFAULT 'New' NOT NULL, -- New, Assigned, Visited, In Approval, Approved, Resolved, Closed, Cancelled
    "InstallationId" UUID REFERENCES "Installations"("InstallationId") ON DELETE RESTRICT,
    "CustomerId" UUID REFERENCES "Customers"("CustomerId") ON DELETE RESTRICT,
    "CustomerName" VARCHAR(120) NOT NULL,
    "Mobile" VARCHAR(20) NOT NULL,
    "Address" VARCHAR(300),
    "Village" VARCHAR(100),
    "District" VARCHAR(80),
    "StateId" UUID REFERENCES "States"("StateId") ON DELETE RESTRICT,
    "Pincode" VARCHAR(12),
    "DealerId" UUID REFERENCES "Dealers"("DealerId") ON DELETE RESTRICT,
    "WarrantyStatus" VARCHAR(30),
    "ComplaintText" TEXT NOT NULL,
    "ServiceCenterId" UUID REFERENCES "ServiceCenters"("ServiceCenterId") ON DELETE RESTRICT,
    "EngineerUserId" UUID REFERENCES "Users"("UserId") ON DELETE RESTRICT,
    "AssignedOn" TIMESTAMP WITH TIME ZONE,
    "DueDate" TIMESTAMP WITH TIME ZONE,
    "ClosedOn" TIMESTAMP WITH TIME ZONE,
    "Resolution" TEXT,
    "CreatedBy" VARCHAR(80),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- Add deferred FK to Replacements
ALTER TABLE "Replacements" ADD CONSTRAINT "fk_Replacements_Complaint" FOREIGN KEY ("ComplaintId") REFERENCES "Complaints"("ComplaintId") ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS "ComplaintItemLns" (
    "ComplaintItemLnId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ComplaintId" UUID NOT NULL REFERENCES "Complaints"("ComplaintId") ON DELETE RESTRICT,
    "Category" VARCHAR(20) NOT NULL,
    "SerialNo" VARCHAR(60),
    "ProductModelId" UUID REFERENCES "ProductModels"("ProductModelId") ON DELETE RESTRICT,
    "ReportedFault" VARCHAR(250),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "ComplaintReminders" (
    "ComplaintReminderId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ComplaintId" UUID NOT NULL REFERENCES "Complaints"("ComplaintId") ON DELETE RESTRICT,
    "ReminderDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "ReminderText" VARCHAR(300) NOT NULL,
    "Status" VARCHAR(30) DEFAULT 'Pending' NOT NULL,
    "DoneOn" TIMESTAMP WITH TIME ZONE,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 21. VISIT REPORTS & ATTACHMENTS
CREATE TABLE IF NOT EXISTS "VisitReports" (
    "VisitReportId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "VisitNo" VARCHAR(50) NOT NULL CONSTRAINT "uq_VisitReports_VisitNo" UNIQUE,
    "ComplaintId" UUID NOT NULL REFERENCES "Complaints"("ComplaintId") ON DELETE RESTRICT,
    "EngineerUserId" UUID NOT NULL REFERENCES "Users"("UserId") ON DELETE RESTRICT,
    "VisitDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "Observations" TEXT,
    "ActionTaken" TEXT,
    "CustomerFeedback" VARCHAR(250),
    "Status" VARCHAR(30) DEFAULT 'Completed' NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "Attachments" (
    "AttachmentId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "ParentTable" VARCHAR(50) NOT NULL,
    "ParentId" UUID NOT NULL,
    "FileUrl" VARCHAR(500) NOT NULL,
    "FileName" VARCHAR(200),
    "FileType" VARCHAR(50),
    "FileSize" INTEGER,
    "Caption" VARCHAR(200),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 22. JOBCARDS & LINES
CREATE TABLE IF NOT EXISTS "JobCards" (
    "JobCardId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "JobCardNo" VARCHAR(50) NOT NULL CONSTRAINT "uq_JobCards_JobCardNo" UNIQUE,
    "ComplaintId" UUID NOT NULL REFERENCES "Complaints"("ComplaintId") ON DELETE RESTRICT,
    "JobCardDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "Status" VARCHAR(30) DEFAULT 'Draft' NOT NULL, -- Draft, In Approval, Approved, Closed, Cancelled
    "CurrentLevel" INTEGER DEFAULT 1 NOT NULL,
    "TotalEstimate" NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
    "SparesTotal" NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
    "LabourTotal" NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
    "Remarks" TEXT,
    "ClosedOn" TIMESTAMP WITH TIME ZONE,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "JobCardItemLns" (
    "JobCardItemLnId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "JobCardId" UUID NOT NULL REFERENCES "JobCards"("JobCardId") ON DELETE RESTRICT,
    "SpareId" UUID NOT NULL REFERENCES "Spares"("SpareId") ON DELETE RESTRICT,
    "Qty" INTEGER DEFAULT 1 NOT NULL,
    "Rate" NUMERIC(12,2) NOT NULL,
    "Amount" NUMERIC(12,2) NOT NULL,
    "IsWarranty" BOOLEAN DEFAULT false NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "JobCardFaultLns" (
    "JobCardFaultLnId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "JobCardId" UUID NOT NULL REFERENCES "JobCards"("JobCardId") ON DELETE RESTRICT,
    "FaultMasterId" UUID NOT NULL REFERENCES "FaultMasters"("FaultMasterId") ON DELETE RESTRICT,
    "Remarks" VARCHAR(250),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "JobCardApprovalLns" (
    "JobCardApprovalLnId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "JobCardId" UUID NOT NULL REFERENCES "JobCards"("JobCardId") ON DELETE RESTRICT,
    "LevelNo" INTEGER NOT NULL,
    "ApproverUserId" UUID NOT NULL REFERENCES "Users"("UserId") ON DELETE RESTRICT,
    "Action" VARCHAR(20) NOT NULL, -- Approved, Rejected
    "ActionDate" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "Remarks" VARCHAR(250),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 23. STOCK TRANSACTIONS
CREATE TABLE IF NOT EXISTS "StockTxns" (
    "StockTxnId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "TxnDate" TIMESTAMP WITH TIME ZONE NOT NULL,
    "TxnType" VARCHAR(30) NOT NULL, -- Receipt, Transfer, Consumption, Adjustment
    "SpareId" UUID NOT NULL REFERENCES "Spares"("SpareId") ON DELETE RESTRICT,
    "Qty" INTEGER NOT NULL,
    "Rate" NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
    "Amount" NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
    "FromLocType" VARCHAR(30),
    "FromLocId" UUID,
    "ToLocType" VARCHAR(30),
    "ToLocId" UUID,
    "JobCardItemLnId" UUID REFERENCES "JobCardItemLns"("JobCardItemLnId") ON DELETE RESTRICT,
    "Remarks" VARCHAR(300),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 24. DOCUMENT SEQUENCES
CREATE TABLE IF NOT EXISTS "DocSequences" (
    "DocSequenceId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "SeqKey" VARCHAR(40) NOT NULL,
    "Prefix" VARCHAR(40) NOT NULL,
    "Fy" VARCHAR(15) NOT NULL,
    "LastNo" INTEGER DEFAULT 0 NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 25. AUDIT LOGS
CREATE TABLE IF NOT EXISTS "AuditLogs" (
    "AuditLogId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "LogOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "UserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "UserName" VARCHAR(100),
    "Action" VARCHAR(50) NOT NULL,
    "TableName" VARCHAR(50) NOT NULL,
    "RecordId" VARCHAR(100),
    "Details" TEXT
);

-- ------------------------------------------------------------------ 26. NOTIFICATION LOGS
CREATE TABLE IF NOT EXISTS "NotificationLogs" (
    "NotificationLogId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "Channel" VARCHAR(20) NOT NULL, -- WhatsApp, SMS, Email
    "ToMobile" VARCHAR(20) NOT NULL,
    "Template" VARCHAR(60),
    "Message" TEXT NOT NULL,
    "RefType" VARCHAR(40),
    "RefNo" VARCHAR(60),
    "SentOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "Status" VARCHAR(30) DEFAULT 'Sent' NOT NULL,
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 27. BUSINESS RULES
CREATE TABLE IF NOT EXISTS "BusinessRules" (
    "BusinessRuleId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "RuleKey" VARCHAR(60) NOT NULL CONSTRAINT "uq_BusinessRules_RuleKey" UNIQUE,
    "RuleValue" VARCHAR(255) NOT NULL,
    "AppliesTo" VARCHAR(100) NOT NULL,
    "IsBlocking" BOOLEAN DEFAULT false NOT NULL,
    "Description" VARCHAR(300),
    "InsertedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "LastUpdatedOn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    "InsertedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL,
    "LastUpdatedByUserId" UUID REFERENCES "Users"("UserId") ON DELETE SET NULL
);

-- ------------------------------------------------------------------ 28. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS "ix_Warranties_SerialNo" ON "Warranties" ("SerialNo");
CREATE INDEX IF NOT EXISTS "ix_Warranties_InstallationId" ON "Warranties" ("InstallationId");
CREATE INDEX IF NOT EXISTS "ix_Warranties_EndDate" ON "Warranties" ("EndDate");
CREATE INDEX IF NOT EXISTS "ix_Warranties_DealerId" ON "Warranties" ("DealerId");
CREATE INDEX IF NOT EXISTS "ix_Stickers_Status" ON "Stickers" ("Status");
CREATE INDEX IF NOT EXISTS "ix_Stickers_ProductModelId" ON "Stickers" ("ProductModelId");
CREATE INDEX IF NOT EXISTS "ix_Installations_CustomerId" ON "Installations" ("CustomerId");
CREATE INDEX IF NOT EXISTS "ix_Complaints_Status" ON "Complaints" ("Status");
CREATE INDEX IF NOT EXISTS "ix_Complaints_CallDate" ON "Complaints" ("CallDate");
CREATE INDEX IF NOT EXISTS "ix_Complaints_ServiceCenterId" ON "Complaints" ("ServiceCenterId");
CREATE INDEX IF NOT EXISTS "ix_Complaints_EngineerUserId" ON "Complaints" ("EngineerUserId");
CREATE INDEX IF NOT EXISTS "ix_ComplaintItemLns_SerialNo" ON "ComplaintItemLns" ("SerialNo");
CREATE INDEX IF NOT EXISTS "ix_JobCards_ComplaintId" ON "JobCards" ("ComplaintId");
CREATE INDEX IF NOT EXISTS "ix_JobCardItemLns_JobCardId" ON "JobCardItemLns" ("JobCardId");
CREATE INDEX IF NOT EXISTS "ix_StockTxns_SpareId" ON "StockTxns" ("SpareId");
CREATE INDEX IF NOT EXISTS "ix_StockTxns_TxnDate" ON "StockTxns" ("TxnDate");
CREATE INDEX IF NOT EXISTS "ix_AuditLogs_TableName" ON "AuditLogs" ("TableName");
CREATE INDEX IF NOT EXISTS "ix_AuditLogs_LogOn" ON "AuditLogs" ("LogOn");
CREATE INDEX IF NOT EXISTS "ix_NotificationLogs_SentOn" ON "NotificationLogs" ("SentOn");

COMMIT;
