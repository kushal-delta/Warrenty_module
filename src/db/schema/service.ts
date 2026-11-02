import { pgTable, uuid, varchar, text, boolean, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { Users } from "./users";
import { States, ProductModels, Projects, CallTypes, FaultMasters, ServiceCenters, Spares } from "./masters";
import { Dealers, Customers, Installations } from "./warranty";

// 1. Complaints (Service Calls)
export const Complaints = pgTable("Complaints", {
  ComplaintId: uuid("ComplaintId").defaultRandom().primaryKey(),
  ComplaintNo: varchar("ComplaintNo", { length: 50 }).notNull().unique(),
  CallDate: timestamp("CallDate", { withTimezone: true }).notNull(),
  CallTypeId: uuid("CallTypeId").references(() => CallTypes.CallTypeId, { onDelete: "restrict" }).notNull(),
  ProjectId: uuid("ProjectId").references(() => Projects.ProjectId, { onDelete: "restrict" }),
  Priority: varchar("Priority", { length: 20 }).default("Medium").notNull(),
  Source: varchar("Source", { length: 30 }),
  Status: varchar("Status", { length: 30 }).default("New").notNull(), // New, Assigned, Visited, In Approval, Approved, Resolved, Closed, Cancelled
  InstallationId: uuid("InstallationId").references(() => Installations.InstallationId, { onDelete: "restrict" }),
  CustomerId: uuid("CustomerId").references(() => Customers.CustomerId, { onDelete: "restrict" }),
  CustomerName: varchar("CustomerName", { length: 120 }).notNull(),
  Mobile: varchar("Mobile", { length: 20 }).notNull(),
  Address: varchar("Address", { length: 300 }),
  Village: varchar("Village", { length: 100 }),
  District: varchar("District", { length: 80 }),
  StateId: uuid("StateId").references(() => States.StateId, { onDelete: "restrict" }),
  Pincode: varchar("Pincode", { length: 12 }),
  DealerId: uuid("DealerId").references(() => Dealers.DealerId, { onDelete: "restrict" }),
  WarrantyStatus: varchar("WarrantyStatus", { length: 30 }),
  ComplaintText: text("ComplaintText").notNull(),
  ServiceCenterId: uuid("ServiceCenterId").references(() => ServiceCenters.ServiceCenterId, { onDelete: "restrict" }),
  EngineerUserId: uuid("EngineerUserId").references(() => Users.UserId, { onDelete: "restrict" }),
  AssignedOn: timestamp("AssignedOn", { withTimezone: true }),
  DueDate: timestamp("DueDate", { withTimezone: true }),
  ClosedOn: timestamp("ClosedOn", { withTimezone: true }),
  Resolution: text("Resolution"),
  CreatedBy: varchar("CreatedBy", { length: 80 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 2. ComplaintItemLns (Line table per RULES §1)
export const ComplaintItemLns = pgTable("ComplaintItemLns", {
  ComplaintItemLnId: uuid("ComplaintItemLnId").defaultRandom().primaryKey(),
  ComplaintId: uuid("ComplaintId").references(() => Complaints.ComplaintId, { onDelete: "restrict" }).notNull(),
  Category: varchar("Category", { length: 20 }).notNull(),
  SerialNo: varchar("SerialNo", { length: 60 }),
  ProductModelId: uuid("ProductModelId").references(() => ProductModels.ProductModelId, { onDelete: "restrict" }),
  ReportedFault: varchar("ReportedFault", { length: 250 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 3. ComplaintReminders
export const ComplaintReminders = pgTable("ComplaintReminders", {
  ComplaintReminderId: uuid("ComplaintReminderId").defaultRandom().primaryKey(),
  ComplaintId: uuid("ComplaintId").references(() => Complaints.ComplaintId, { onDelete: "restrict" }).notNull(),
  ReminderDate: timestamp("ReminderDate", { withTimezone: true }).notNull(),
  ReminderText: varchar("ReminderText", { length: 300 }).notNull(),
  Status: varchar("Status", { length: 30 }).default("Pending").notNull(),
  DoneOn: timestamp("DoneOn", { withTimezone: true }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 4. VisitReports
export const VisitReports = pgTable("VisitReports", {
  VisitReportId: uuid("VisitReportId").defaultRandom().primaryKey(),
  VisitNo: varchar("VisitNo", { length: 50 }).notNull().unique(),
  ComplaintId: uuid("ComplaintId").references(() => Complaints.ComplaintId, { onDelete: "restrict" }).notNull(),
  EngineerUserId: uuid("EngineerUserId").references(() => Users.UserId, { onDelete: "restrict" }).notNull(),
  VisitDate: timestamp("VisitDate", { withTimezone: true }).notNull(),
  Observations: text("Observations"),
  ActionTaken: text("ActionTaken"),
  CustomerFeedback: varchar("CustomerFeedback", { length: 250 }),
  Status: varchar("Status", { length: 30 }).default("Completed").notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 5. Attachments
export const Attachments = pgTable("Attachments", {
  AttachmentId: uuid("AttachmentId").defaultRandom().primaryKey(),
  ParentTable: varchar("ParentTable", { length: 50 }).notNull(),
  ParentId: uuid("ParentId").notNull(),
  FileUrl: varchar("FileUrl", { length: 500 }).notNull(),
  FileName: varchar("FileName", { length: 200 }),
  FileType: varchar("FileType", { length: 50 }),
  FileSize: integer("FileSize"),
  Caption: varchar("Caption", { length: 200 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 6. JobCards
export const JobCards = pgTable("JobCards", {
  JobCardId: uuid("JobCardId").defaultRandom().primaryKey(),
  JobCardNo: varchar("JobCardNo", { length: 50 }).notNull().unique(),
  ComplaintId: uuid("ComplaintId").references(() => Complaints.ComplaintId, { onDelete: "restrict" }).notNull(),
  JobCardDate: timestamp("JobCardDate", { withTimezone: true }).notNull(),
  Status: varchar("Status", { length: 30 }).default("Draft").notNull(), // Draft, In Approval, Approved, Closed, Cancelled
  CurrentLevel: integer("CurrentLevel").default(1).notNull(),
  TotalEstimate: numeric("TotalEstimate", { precision: 12, scale: 2 }).default("0.00").notNull(),
  SparesTotal: numeric("SparesTotal", { precision: 12, scale: 2 }).default("0.00").notNull(),
  LabourTotal: numeric("LabourTotal", { precision: 12, scale: 2 }).default("0.00").notNull(),
  Remarks: text("Remarks"),
  ClosedOn: timestamp("ClosedOn", { withTimezone: true }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 7. JobCardItemLns (Line table per RULES §1)
export const JobCardItemLns = pgTable("JobCardItemLns", {
  JobCardItemLnId: uuid("JobCardItemLnId").defaultRandom().primaryKey(),
  JobCardId: uuid("JobCardId").references(() => JobCards.JobCardId, { onDelete: "restrict" }).notNull(),
  SpareId: uuid("SpareId").references(() => Spares.SpareId, { onDelete: "restrict" }).notNull(),
  Qty: integer("Qty").default(1).notNull(),
  Rate: numeric("Rate", { precision: 12, scale: 2 }).notNull(),
  Amount: numeric("Amount", { precision: 12, scale: 2 }).notNull(),
  IsWarranty: boolean("IsWarranty").default(false).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 8. JobCardFaultLns (Line table per RULES §1)
export const JobCardFaultLns = pgTable("JobCardFaultLns", {
  JobCardFaultLnId: uuid("JobCardFaultLnId").defaultRandom().primaryKey(),
  JobCardId: uuid("JobCardId").references(() => JobCards.JobCardId, { onDelete: "restrict" }).notNull(),
  FaultMasterId: uuid("FaultMasterId").references(() => FaultMasters.FaultMasterId, { onDelete: "restrict" }).notNull(),
  Remarks: varchar("Remarks", { length: 250 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

// 9. JobCardApprovalLns (Line table per RULES §1)
export const JobCardApprovalLns = pgTable("JobCardApprovalLns", {
  JobCardApprovalLnId: uuid("JobCardApprovalLnId").defaultRandom().primaryKey(),
  JobCardId: uuid("JobCardId").references(() => JobCards.JobCardId, { onDelete: "restrict" }).notNull(),
  LevelNo: integer("LevelNo").notNull(),
  ApproverUserId: uuid("ApproverUserId").references(() => Users.UserId, { onDelete: "restrict" }).notNull(),
  Action: varchar("Action", { length: 20 }).notNull(), // Approved, Rejected
  ActionDate: timestamp("ActionDate", { withTimezone: true }).defaultNow().notNull(),
  Remarks: varchar("Remarks", { length: 250 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});
