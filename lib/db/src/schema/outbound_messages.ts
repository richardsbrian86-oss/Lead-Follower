import { pgTable, serial, integer, text, timestamp, pgEnum, varchar } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads.js";
import { gymsTable } from "./gyms.js";

export const outboundChannelEnum = pgEnum("outbound_channel", ["email", "sms"]);
export const outboundStatusEnum = pgEnum("outbound_status", ["sent", "failed", "pending"]);

export const outboundMessagesTable = pgTable("outbound_messages", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  gymId: varchar("gym_id").references(() => gymsTable.id),
  channel: outboundChannelEnum("channel").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: outboundStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sequenceStep: integer("sequence_step"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OutboundMessage = typeof outboundMessagesTable.$inferSelect;
export type InsertOutboundMessage = typeof outboundMessagesTable.$inferInsert;
