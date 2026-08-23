CREATE INDEX "lead_events_lead_created_at_idx" ON "lead_events" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_gym_created_at_idx" ON "leads" USING btree ("gym_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_gym_status_created_at_idx" ON "leads" USING btree ("gym_id","status","created_at");--> statement-breakpoint
CREATE INDEX "outbound_messages_gym_status_created_at_idx" ON "outbound_messages" USING btree ("gym_id","status","created_at");--> statement-breakpoint
CREATE INDEX "outbound_messages_lead_created_at_idx" ON "outbound_messages" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_sequences_gym_active_next_send_idx" ON "lead_sequences" USING btree ("gym_id","paused","cancelled","next_send_at");