import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { gymsTable } from "./gyms.js";

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
    gymId: varchar("gym_id").references(() => gymsTable.id),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  name: varchar("name"),
  role: varchar("role").notNull().default("staff"),
  gymId: varchar("gym_id").references(() => gymsTable.id),
  passwordHash: varchar("password_hash"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verifyToken: varchar("verify_token"),
  verifyTokenExpiry: timestamp("verify_token_expiry", { withTimezone: true }),
  resetToken: varchar("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry", { withTimezone: true }),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;
