import { pgTable, uuid, varchar, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { Users } from "./users";
import { Spares } from "./masters";
import { JobCardItemLns } from "./service";

// 1. StockTxns (Stock Ledger & Movements)
export const StockTxns = pgTable("StockTxns", {
  StockTxnId: uuid("StockTxnId").defaultRandom().primaryKey(),
  TxnDate: timestamp("TxnDate", { withTimezone: true }).notNull(),
  TxnType: varchar("TxnType", { length: 30 }).notNull(), // Receipt, Transfer, Consumption, Adjustment
  SpareId: uuid("SpareId").references(() => Spares.SpareId, { onDelete: "restrict" }).notNull(),
  Qty: integer("Qty").notNull(),
  Rate: numeric("Rate", { precision: 12, scale: 2 }).default("0.00").notNull(),
  Amount: numeric("Amount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  FromLocType: varchar("FromLocType", { length: 30 }), // HO, ServiceCenter, Engineer
  FromLocId: uuid("FromLocId"),
  ToLocType: varchar("ToLocType", { length: 30 }),
  ToLocId: uuid("ToLocId"),
  JobCardItemLnId: uuid("JobCardItemLnId").references(() => JobCardItemLns.JobCardItemLnId, { onDelete: "restrict" }),
  Remarks: varchar("Remarks", { length: 300 }),

  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references(() => Users.UserId, { onDelete: "set null" }).notNull(),
});

export type StockTxn = typeof StockTxns.$inferSelect;
export type NewStockTxn = typeof StockTxns.$inferInsert;
