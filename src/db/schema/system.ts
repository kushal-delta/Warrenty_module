import { pgTable, uuid, varchar, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { Users } from "./users";

export const DocSequences = pgTable("DocSequences", {
  DocSequenceId: uuid("DocSequenceId").defaultRandom().primaryKey(),
  SeqKey: varchar("SeqKey", { length: 40 }).notNull(),
  Prefix: varchar("Prefix", { length: 40 }).notNull(),
  Fy: varchar("Fy", { length: 15 }).notNull(),
  LastNo: integer("LastNo").default(0).notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }),
});

export const AuditLogs = pgTable("AuditLogs", {
  AuditLogId: uuid("AuditLogId").defaultRandom().primaryKey(),
  LogOn: timestamp("LogOn", { withTimezone: true }).defaultNow().notNull(),
  UserId: uuid("UserId").references(() => Users.UserId, { onDelete: "set null" }),
  UserName: varchar("UserName", { length: 100 }),
  Action: varchar("Action", { length: 50 }).notNull(),
  TableName: varchar("TableName", { length: 50 }).notNull(),
  RecordId: varchar("RecordId", { length: 100 }),
  Details: text("Details"),
});

export const NotificationLogs = pgTable("NotificationLogs", {
  NotificationLogId: uuid("NotificationLogId").defaultRandom().primaryKey(),
  Channel: varchar("Channel", { length: 20 }).notNull(),
  ToMobile: varchar("ToMobile", { length: 20 }).notNull(),
  Template: varchar("Template", { length: 60 }),
  Message: text("Message").notNull(),
  RefType: varchar("RefType", { length: 40 }),
  RefNo: varchar("RefNo", { length: 60 }),
  SentOn: timestamp("SentOn", { withTimezone: true }).defaultNow().notNull(),
  Status: varchar("Status", { length: 30 }).default("Sent").notNull(),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }),
});

export const BusinessRules = pgTable("BusinessRules", {
  BusinessRuleId: uuid("BusinessRuleId").defaultRandom().primaryKey(),
  RuleKey: varchar("RuleKey", { length: 60 }).notNull().unique(),
  RuleValue: varchar("RuleValue", { length: 255 }).notNull(),
  AppliesTo: varchar("AppliesTo", { length: 100 }).notNull(),
  IsBlocking: boolean("IsBlocking").default(false).notNull(),
  Description: varchar("Description", { length: 300 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }),
});

export type DocSequence = typeof DocSequences.$inferSelect;
export type NewDocSequence = typeof DocSequences.$inferInsert;

export type AuditLog = typeof AuditLogs.$inferSelect;
export type NewAuditLog = typeof AuditLogs.$inferInsert;

export type NotificationLog = typeof NotificationLogs.$inferSelect;
export type NewNotificationLog = typeof NotificationLogs.$inferInsert;

export type BusinessRule = typeof BusinessRules.$inferSelect;
export type NewBusinessRule = typeof BusinessRules.$inferInsert;
