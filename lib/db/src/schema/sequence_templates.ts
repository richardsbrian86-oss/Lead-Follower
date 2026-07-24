import { pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";
import { gymsTable } from "./gyms.js";

export const sequenceTemplatesTable = pgTable("sequence_templates", {
  id: serial("id").primaryKey(),
  gymId: varchar("gym_id").notNull().references(() => gymsTable.id),
  step: integer("step").notNull(),
  delayDays: integer("delay_days").notNull(),
  toneInstruction: text("tone_instruction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("sequence_templates_gym_id_step_unique").on(table.gymId, table.step),
]);

export type SequenceTemplate = typeof sequenceTemplatesTable.$inferSelect;
export type InsertSequenceTemplate = typeof sequenceTemplatesTable.$inferInsert;
