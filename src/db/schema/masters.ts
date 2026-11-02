import { pgTable, uuid, varchar, text, boolean, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { Users } from "./users";

// 1. Companies (Company Profile)
export const Companies = pgTable("Companies", {
  CompanyId: uuid("CompanyId").defaultRandom().primaryKey(),
  CompanyName: varchar("CompanyName", { length: 150 }).notNull(),
  Tagline: varchar("Tagline", { length: 200 }),
  Address: varchar("Address", { length: 300 }),
  City: varchar("City", { length: 80 }),
  State: varchar("State", { length: 80 }),
  Pincode: varchar("Pincode", { length: 12 }),
  Phone: varchar("Phone", { length: 30 }),
  TollFree: varchar("TollFree", { length: 30 }),
  Email: varchar("Email", { length: 120 }),
  Website: varchar("Website", { length: 120 }),
  Gstin: varchar("Gstin", { length: 30 }),
  WhatsappSender: varchar("WhatsappSender", { length: 30 }),
  WarrantyTerms: text("WarrantyTerms"),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 2. States
export const States = pgTable("States", {
  StateId: uuid("StateId").defaultRandom().primaryKey(),
  StateCode: varchar("StateCode", { length: 10 }).notNull().unique(),
  StateName: varchar("StateName", { length: 80 }).notNull(),
  ShortName: varchar("ShortName", { length: 10 }),
  SortOrder: integer("SortOrder").default(1).notNull(), // 1-based per RULES §1

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 3. Districts
export const Districts = pgTable("Districts", {
  DistrictId: uuid("DistrictId").defaultRandom().primaryKey(),
  StateId: uuid("StateId").references(() => States.StateId, { onDelete: "restrict" }).notNull(),
  DistrictName: varchar("DistrictName", { length: 80 }).notNull(),
  SortOrder: integer("SortOrder").default(1).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 4. ProductModels
export const ProductModels = pgTable("ProductModels", {
  ProductModelId: uuid("ProductModelId").defaultRandom().primaryKey(),
  ModelCode: varchar("ModelCode", { length: 40 }).notNull().unique(),
  ModelName: varchar("ModelName", { length: 150 }).notNull(),
  Category: varchar("Category", { length: 20 }).notNull(), // PUMP, MOTOR, CONTROLLER
  Hp: numeric("Hp", { precision: 5, scale: 2 }),
  Kw: numeric("Kw", { precision: 6, scale: 3 }),
  Technology: varchar("Technology", { length: 50 }),
  VoltageRange: varchar("VoltageRange", { length: 50 }),
  HeadRange: varchar("HeadRange", { length: 50 }),
  Discharge: varchar("Discharge", { length: 50 }),
  SizeInch: varchar("SizeInch", { length: 30 }),
  WarrantyMonths: integer("WarrantyMonths").default(24).notNull(),
  Description: varchar("Description", { length: 300 }),
  IsActive: boolean("IsActive").default(true).notNull(),
  SortOrder: integer("SortOrder").default(1).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 5. Projects (Schemes e.g. PM-KUSUM)
export const Projects = pgTable("Projects", {
  ProjectId: uuid("ProjectId").defaultRandom().primaryKey(),
  ProjectNo: varchar("ProjectNo", { length: 40 }).notNull().unique(),
  ProjectName: varchar("ProjectName", { length: 150 }).notNull(),
  Scheme: varchar("Scheme", { length: 80 }),
  StateId: uuid("StateId").references(() => States.StateId, { onDelete: "restrict" }),
  StartDate: timestamp("StartDate", { withTimezone: true }),
  EndDate: timestamp("EndDate", { withTimezone: true }),
  Status: varchar("Status", { length: 30 }).default("Active").notNull(),
  Remarks: varchar("Remarks", { length: 300 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 6. CallTypes (Service Call SLAs)
export const CallTypes = pgTable("CallTypes", {
  CallTypeId: uuid("CallTypeId").defaultRandom().primaryKey(),
  CallTypeName: varchar("CallTypeName", { length: 80 }).notNull().unique(),
  ValidDays: integer("ValidDays").notNull(),
  IsWarranty: boolean("IsWarranty").default(false).notNull(),
  Description: varchar("Description", { length: 300 }),
  IsActive: boolean("IsActive").default(true).notNull(),
  SortOrder: integer("SortOrder").default(1).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 7. FaultMasters
export const FaultMasters = pgTable("FaultMasters", {
  FaultMasterId: uuid("FaultMasterId").defaultRandom().primaryKey(),
  Category: varchar("Category", { length: 20 }).notNull(),
  FaultName: varchar("FaultName", { length: 120 }).notNull(),
  DefaultNature: varchar("DefaultNature", { length: 300 }),
  IsActive: boolean("IsActive").default(true).notNull(),
  SortOrder: integer("SortOrder").default(1).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 8. ServiceCenters
export const ServiceCenters = pgTable("ServiceCenters", {
  ServiceCenterId: uuid("ServiceCenterId").defaultRandom().primaryKey(),
  ServiceCenterCode: varchar("ServiceCenterCode", { length: 30 }).unique(),
  ServiceCenterName: varchar("ServiceCenterName", { length: 150 }).notNull(),
  ContactPerson: varchar("ContactPerson", { length: 100 }),
  Mobile: varchar("Mobile", { length: 20 }),
  Email: varchar("Email", { length: 120 }),
  Address: varchar("Address", { length: 300 }),
  City: varchar("City", { length: 80 }),
  District: varchar("District", { length: 80 }),
  StateId: uuid("StateId").references(() => States.StateId, { onDelete: "restrict" }),
  Pincode: varchar("Pincode", { length: 12 }),
  Gstin: varchar("Gstin", { length: 30 }),
  IsActive: boolean("IsActive").default(true).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 9. ApprovalRules
export const ApprovalRules = pgTable("ApprovalRules", {
  ApprovalRuleId: uuid("ApprovalRuleId").defaultRandom().primaryKey(),
  LevelNo: integer("LevelNo").notNull().unique(),
  RoleName: varchar("RoleName", { length: 50 }).notNull(),
  ApproverUserId: uuid("ApproverUserId").references(() => Users.UserId, { onDelete: "restrict" }),
  MinAmount: numeric("MinAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  MaxAmount: numeric("MaxAmount", { precision: 12, scale: 2 }),
  Description: varchar("Description", { length: 250 }),
  IsActive: boolean("IsActive").default(true).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 10. Spares
export const Spares = pgTable("Spares", {
  SpareId: uuid("SpareId").defaultRandom().primaryKey(),
  SpareCode: varchar("SpareCode", { length: 40 }).notNull().unique(),
  SpareName: varchar("SpareName", { length: 150 }).notNull(),
  Category: varchar("Category", { length: 20 }),
  Uom: varchar("Uom", { length: 20 }).default("NOS").notNull(),
  CurrentRate: numeric("CurrentRate", { precision: 12, scale: 2 }).default("0.00").notNull(),
  MinStock: integer("MinStock").default(0).notNull(),
  IsActive: boolean("IsActive").default(true).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 11. SpareRateHistoryLns (Line/detail table per RULES §1)
export const SpareRateHistoryLns = pgTable("SpareRateHistoryLns", {
  SpareRateHistoryLnId: uuid("SpareRateHistoryLnId").defaultRandom().primaryKey(),
  SpareId: uuid("SpareId").references(() => Spares.SpareId, { onDelete: "restrict" }).notNull(),
  Rate: numeric("Rate", { precision: 12, scale: 2 }).notNull(),
  EffectiveFrom: timestamp("EffectiveFrom", { withTimezone: true }).notNull(),
  EffectiveTo: timestamp("EffectiveTo", { withTimezone: true }),
  Remarks: varchar("Remarks", { length: 250 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 12. LabourMasters
export const LabourMasters = pgTable("LabourMasters", {
  LabourMasterId: uuid("LabourMasterId").defaultRandom().primaryKey(),
  LabourCode: varchar("LabourCode", { length: 40 }).notNull().unique(),
  LabourName: varchar("LabourName", { length: 150 }).notNull(),
  StandardRate: numeric("StandardRate", { precision: 12, scale: 2 }).default("0.00").notNull(),
  SkillLevel: varchar("SkillLevel", { length: 40 }),
  IsActive: boolean("IsActive").default(true).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});
