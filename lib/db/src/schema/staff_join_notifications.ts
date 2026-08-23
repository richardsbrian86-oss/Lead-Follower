import { sql } from "drizzle-orm";
import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { gymsTable } from "./gyms.js";
import { usersTable } from "./auth.js";

export const staffJoinNotificationsTable = pgTable("staff_join_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerUserId: varchar("owner_user_id")
    .references(() => usersTable.id)
    .notNull(),
  gymId: varchar("gym_id")
    .references(() => gymsTable.id)
    .notNull(),
  memberEmail: varchar("member_email").notNull(),
  gymName: varchar("gym_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  seenAt: timestamp("seen_at", { withTimezone: true }),
});

export type StaffJoinNotification = typeof staffJoinNotificationsTable.$inferSelect;
export type InsertStaffJoinNotification = typeof staffJoinNotificationsTable.$inferInsert;