import { pgTable, serial, integer, boolean, timestamp, varchar, text, pgEnum } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads.js";
import { gymsTable } from "./gyms.js";

export const leadSequenceStatusEnum = pgEnum("lead_sequence_status", ["active", "processing", "failed"]);

export const leadSequencesTable = pgTable("lead_sequences", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .notNull()
    .unique()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  gymId: varchar("gym_id").notNull().references(() => gymsTable.id),
  currentStep: integer("current_step").notNull().default(0),
  paused: boolean("paused").notNull().default(false),
  cancelled: boolean("cancelled").notNull().default(false),
  status: leadSequenceStatusEnum("status").notNull().default("active"),
  failureReason: text("failure_reason"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeadSequence = typeof leadSequencesTable.$inferSelect;
export type InsertLeadSequence = typeof leadSequencesTable.$inferInsert;
