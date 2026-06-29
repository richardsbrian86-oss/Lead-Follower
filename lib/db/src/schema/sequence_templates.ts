import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const sequenceTemplatesTable = pgTable("sequence_templates", {
  id: serial("id").primaryKey(),
  step: integer("step").notNull().unique(),
  delayDays: integer("delay_days").notNull(),
  toneInstruction: text("tone_instruction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SequenceTemplate = typeof sequenceTemplatesTable.$inferSelect;
export type InsertSequenceTemplate = typeof sequenceTemplatesTable.$inferInsert;
