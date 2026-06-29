import { pgTable, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads.js";

export const leadSequencesTable = pgTable("lead_sequences", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .notNull()
    .unique()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  currentStep: integer("current_step").notNull().default(0),
  paused: boolean("paused").notNull().default(false),
  cancelled: boolean("cancelled").notNull().default(false),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeadSequence = typeof leadSequencesTable.$inferSelect;
export type InsertLeadSequence = typeof leadSequencesTable.$inferInsert;
