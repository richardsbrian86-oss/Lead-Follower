import { pgTable, serial, integer, text, timestamp, pgEnum, varchar, index } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads.js";
import { gymsTable } from "./gyms.js";

export const outboundChannelEnum = pgEnum("outbound_channel", ["email", "sms"]);
export const outboundStatusEnum = pgEnum("outbound_status", ["sent", "failed", "pending"]);

export const outboundMessagesTable = pgTable("outbound_messages", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  gymId: varchar("gym_id").notNull().references(() => gymsTable.id),
  channel: outboundChannelEnum("channel").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: outboundStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sequenceStep: integer("sequence_step"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("outbound_messages_gym_status_created_at_idx").on(table.gymId, table.status, table.createdAt),
  index("outbound_messages_lead_created_at_idx").on(table.leadId, table.createdAt),
]);

export type OutboundMessage = typeof outboundMessagesTable.$inferSelect;
export type InsertOutboundMessage = typeof outboundMessagesTable.$inferInsert;
