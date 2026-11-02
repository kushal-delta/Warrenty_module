import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const Users = pgTable("Users", {
  UserId: uuid("UserId").defaultRandom().primaryKey(),
  Username: varchar("Username", { length: 50 }).notNull().unique(),
  Password: varchar("Password", { length: 255 }).notNull(),
  FirstName: varchar("FirstName", { length: 80 }).notNull(),
  LastName: varchar("LastName", { length: 80 }),
  Email: varchar("Email", { length: 120 }),
  Phone: varchar("Phone", { length: 20 }),
  Address: varchar("Address", { length: 255 }),
  Role: varchar("Role", { length: 30 }).notNull(), // SUPER, HO, MANAGER, ENGINEER, DEALER, CUSTOMER
  StateRights: text("StateRights"),
  DistrictRights: text("DistrictRights"),
  FormRights: text("FormRights"),
  ServiceCenterId: uuid("ServiceCenterId"),
  IsActive: boolean("IsActive").default(true).notNull(),
  IsAdmin: boolean("IsAdmin").default(false).notNull(),
  LastLogin: timestamp("LastLogin", { withTimezone: true }),

  // Mandatory audit columns per RULES §1
  InsertedOn: timestamp("InsertedOn", { withTimezone: true }).defaultNow().notNull(),
  LastUpdatedOn: timestamp("LastUpdatedOn", { withTimezone: true }).defaultNow().notNull(),
  InsertedByUserId: uuid("InsertedByUserId").references((): any => Users.UserId, { onDelete: "set null" }),
  LastUpdatedByUserId: uuid("LastUpdatedByUserId").references((): any => Users.UserId, { onDelete: "set null" }),
});

export type User = typeof Users.$inferSelect;
export type NewUser = typeof Users.$inferInsert;
