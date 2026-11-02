import { pgTable, uuid, varchar, text, boolean, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { Users } from "./users";
import { States, ProductModels, Projects } from "./masters";

// 1. Dealers
export const Dealers = pgTable("Dealers", {
  DealerId: uuid("DealerId").defaultRandom().primaryKey(),
  DealerCode: varchar("DealerCode", { length: 40 }).unique(),
  FirmName: varchar("FirmName", { length: 150 }).notNull(),
  ContactPerson: varchar("ContactPerson", { length: 100 }),
  Mobile: varchar("Mobile", { length: 20 }).notNull(),
  Email: varchar("Email", { length: 120 }),
  Password: varchar("Password", { length: 100 }),
  Address: varchar("Address", { length: 300 }),
  City: varchar("City", { length: 80 }),
  District: varchar("District", { length: 80 }),
  StateId: uuid("StateId").references(() => States.StateId, { onDelete: "restrict" }),
  Pincode: varchar("Pincode", { length: 12 }),
  Gstin: varchar("Gstin", { length: 30 }),
  WarrantyMonths: integer("WarrantyMonths"),
  Status: varchar("Status", { length: 30 }).default("Pending").notNull(), // Pending, Approved, Rejected, Blocked
  SignupOn: timestamp("SignupOn", { withTimezone: true }),
  ApprovedBy: varchar("ApprovedBy", { length: 80 }),
  ApprovedOn: timestamp("ApprovedOn", { withTimezone: true }),
  Remarks: varchar("Remarks", { length: 300 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 2. Customers
export const Customers = pgTable("Customers", {
  CustomerId: uuid("CustomerId").defaultRandom().primaryKey(),
  CustomerName: varchar("CustomerName", { length: 120 }).notNull(),
  Mobile: varchar("Mobile", { length: 20 }).notNull().unique(),
  AltMobile: varchar("AltMobile", { length: 20 }),
  Email: varchar("Email", { length: 120 }),
  Address: varchar("Address", { length: 300 }),
  Village: varchar("Village", { length: 100 }),
  City: varchar("City", { length: 80 }),
  District: varchar("District", { length: 80 }),
  StateId: uuid("StateId").references(() => States.StateId, { onDelete: "restrict" }),
  Pincode: varchar("Pincode", { length: 12 }),
  Language: varchar("Language", { length: 10 }).default("EN").notNull(),
  LastLogin: timestamp("LastLogin", { withTimezone: true }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 3. StickerBatches
export const StickerBatches = pgTable("StickerBatches", {
  StickerBatchId: uuid("StickerBatchId").defaultRandom().primaryKey(),
  BatchNo: varchar("BatchNo", { length: 50 }).notNull().unique(),
  BatchDate: timestamp("BatchDate", { withTimezone: true }).notNull(),
  SupplierName: varchar("SupplierName", { length: 100 }),
  Remarks: varchar("Remarks", { length: 300 }),
  TotalSerials: integer("TotalSerials").default(0).notNull(),
  CreatedBy: varchar("CreatedBy", { length: 80 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 4. Stickers (Serial Register)
export const Stickers = pgTable("Stickers", {
  StickerId: uuid("StickerId").defaultRandom().primaryKey(),
  StickerBatchId: uuid("StickerBatchId").references(() => StickerBatches.StickerBatchId, { onDelete: "restrict" }),
  SerialNo: varchar("SerialNo", { length: 60 }).notNull().unique(),
  ProductModelId: uuid("ProductModelId").references(() => ProductModels.ProductModelId, { onDelete: "restrict" }).notNull(),
  Category: varchar("Category", { length: 20 }).notNull(),
  SupplierName: varchar("SupplierName", { length: 100 }),
  ProductGroup: varchar("ProductGroup", { length: 60 }),
  InvoiceNo: varchar("InvoiceNo", { length: 60 }),
  InvoiceDate: timestamp("InvoiceDate", { withTimezone: true }),
  InvoiceLocation: varchar("InvoiceLocation", { length: 100 }),
  MfgDate: timestamp("MfgDate", { withTimezone: true }),
  Status: varchar("Status", { length: 30 }).default("Generated").notNull(), // Generated, Printed, Registered, Replaced, Scrapped
  PrintCount: integer("PrintCount").default(0).notNull(),
  LastPrintedOn: timestamp("LastPrintedOn", { withTimezone: true }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 5. Installations
export const Installations = pgTable("Installations", {
  InstallationId: uuid("InstallationId").defaultRandom().primaryKey(),
  InstallNo: varchar("InstallNo", { length: 50 }).notNull().unique(),
  CustomerId: uuid("CustomerId").references(() => Customers.CustomerId, { onDelete: "restrict" }).notNull(),
  DealerId: uuid("DealerId").references(() => Dealers.DealerId, { onDelete: "restrict" }),
  InstallDate: timestamp("InstallDate", { withTimezone: true }).notNull(),
  SiteAddress: varchar("SiteAddress", { length: 300 }),
  Village: varchar("Village", { length: 100 }),
  District: varchar("District", { length: 80 }),
  StateId: uuid("StateId").references(() => States.StateId, { onDelete: "restrict" }),
  Pincode: varchar("Pincode", { length: 12 }),
  Latitude: numeric("Latitude", { precision: 10, scale: 6 }),
  Longitude: numeric("Longitude", { precision: 10, scale: 6 }),
  BorewellDepthM: integer("BorewellDepthM"),
  DynamicHeadM: integer("DynamicHeadM"),
  PanelKwp: numeric("PanelKwp", { precision: 6, scale: 2 }),
  ProjectId: uuid("ProjectId").references(() => Projects.ProjectId, { onDelete: "restrict" }),
  InvoiceNo: varchar("InvoiceNo", { length: 60 }),
  InvoiceDate: timestamp("InvoiceDate", { withTimezone: true }),
  RegisteredBy: varchar("RegisteredBy", { length: 40 }),
  RegisteredOn: timestamp("RegisteredOn", { withTimezone: true }),
  Remarks: varchar("Remarks", { length: 300 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 6. Warranties
export const Warranties = pgTable("Warranties", {
  WarrantyId: uuid("WarrantyId").defaultRandom().primaryKey(),
  WarrantyNo: varchar("WarrantyNo", { length: 50 }).notNull().unique(),
  InstallationId: uuid("InstallationId").references(() => Installations.InstallationId, { onDelete: "restrict" }).notNull(),
  SerialNo: varchar("SerialNo", { length: 60 }).notNull().unique(),
  StickerId: uuid("StickerId").references(() => Stickers.StickerId, { onDelete: "restrict" }),
  Category: varchar("Category", { length: 20 }).notNull(),
  ProductModelId: uuid("ProductModelId").references(() => ProductModels.ProductModelId, { onDelete: "restrict" }),
  CustomerId: uuid("CustomerId").references(() => Customers.CustomerId, { onDelete: "restrict" }),
  DealerId: uuid("DealerId").references(() => Dealers.DealerId, { onDelete: "restrict" }),
  StartDate: timestamp("StartDate", { withTimezone: true }).notNull(),
  WarrantyMonths: integer("WarrantyMonths").notNull(),
  ExtendedMonths: integer("ExtendedMonths").default(0).notNull(),
  EndDate: timestamp("EndDate", { withTimezone: true }).notNull(),
  Status: varchar("Status", { length: 30 }).default("Active").notNull(), // Active, Replaced, Void
  ReplacedFromSerial: varchar("ReplacedFromSerial", { length: 60 }),
  RegisteredBy: varchar("RegisteredBy", { length: 40 }),
  RegisteredOn: timestamp("RegisteredOn", { withTimezone: true }),
  WhatsappSent: boolean("WhatsappSent").default(false).notNull(),
  Remarks: varchar("Remarks", { length: 300 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 7. Replacements
export const Replacements = pgTable("Replacements", {
  ReplacementId: uuid("ReplacementId").defaultRandom().primaryKey(),
  ReplNo: varchar("ReplNo", { length: 50 }).notNull().unique(),
  ReplDate: timestamp("ReplDate", { withTimezone: true }).notNull(),
  Source: varchar("Source", { length: 30 }).notNull(), // Dealer, Service
  ComplaintId: uuid("ComplaintId"),
  DealerId: uuid("DealerId").references(() => Dealers.DealerId, { onDelete: "restrict" }),
  VoucherType: varchar("VoucherType", { length: 40 }),
  DealerInvoiceNo: varchar("DealerInvoiceNo", { length: 60 }),
  DealerInvoiceDate: timestamp("DealerInvoiceDate", { withTimezone: true }),
  ReceiptDate: timestamp("ReceiptDate", { withTimezone: true }),
  Transporter: varchar("Transporter", { length: 100 }),
  LrNo: varchar("LrNo", { length: 60 }),
  LrDate: timestamp("LrDate", { withTimezone: true }),
  ReplacementType: varchar("ReplacementType", { length: 30 }),
  MakeSalesInvoice: boolean("MakeSalesInvoice").default(false).notNull(),
  NoOfArticles: integer("NoOfArticles"),
  Reason: varchar("Reason", { length: 300 }),
  Status: varchar("Status", { length: 30 }).default("Open").notNull(), // Open, Received, Closed, Cancelled
  CnNo: varchar("CnNo", { length: 50 }),
  CnAmount: numeric("CnAmount", { precision: 12, scale: 2 }),
  Remarks: varchar("Remarks", { length: 300 }),
  CreatedBy: varchar("CreatedBy", { length: 80 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 8. ReplacementItemLns (Line table per RULES §1)
export const ReplacementItemLns = pgTable("ReplacementItemLns", {
  ReplacementItemLnId: uuid("ReplacementItemLnId").defaultRandom().primaryKey(),
  ReplacementId: uuid("ReplacementId").references(() => Replacements.ReplacementId, { onDelete: "restrict" }).notNull(),
  LineNo: integer("LineNo").notNull(),
  Category: varchar("Category", { length: 20 }),
  InvoiceItem: varchar("InvoiceItem", { length: 150 }),
  ReceivedItem: varchar("ReceivedItem", { length: 150 }),
  OldSerialNo: varchar("OldSerialNo", { length: 60 }),
  NewSerialNo: varchar("NewSerialNo", { length: 60 }),
  Qty: integer("Qty").default(1).notNull(),
  NetValue: numeric("NetValue", { precision: 12, scale: 2 }),
  Location: varchar("Location", { length: 80 }),
  RefInvoiceNo: varchar("RefInvoiceNo", { length: 60 }),
  RefInvoiceDate: timestamp("RefInvoiceDate", { withTimezone: true }),
  WarrantyDaysLeft: integer("WarrantyDaysLeft"),
  Charges: numeric("Charges", { precision: 12, scale: 2 }),
  Remarks: varchar("Remarks", { length: 300 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});
