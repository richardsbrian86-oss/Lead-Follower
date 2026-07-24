import { pgTable, text, serial, integer, varchar, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gymsTable } from "./gyms.js";

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "interested",
  "won",
  "lost",
]);

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  gymId: varchar("gym_id").notNull().references(() => gymsTable.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  visitDate: timestamp("visit_date", { withTimezone: true }).notNull(),
  status: leadStatusEnum("status").notNull().default("new"),
  notes: text("notes"),
  score: integer("score").notNull().default(0),
  scoreFactors: jsonb("score_factors"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leadEventsTable = pgTable("lead_events", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable, {
  email: z.email(),
  phone: z.string().min(7),
  name: z.string().min(1),
  visitDate: z.string(),
}).omit({ id: true, gymId: true, createdAt: true, updatedAt: true });

export const updateLeadSchema = createSelectSchema(leadsTable, {
  visitDate: z.string(),
})
  .pick({ status: true, notes: true, name: true, email: true, phone: true, visitDate: true })
  .partial();

export const insertLeadEventSchema = createInsertSchema(leadEventsTable).omit({
  id: true,
  createdAt: true,
});

export type Lead = typeof leadsTable.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type UpdateLead = z.infer<typeof updateLeadSchema>;
export type LeadEvent = typeof leadEventsTable.$inferSelect;
export type InsertLeadEvent = z.infer<typeof insertLeadEventSchema>;
