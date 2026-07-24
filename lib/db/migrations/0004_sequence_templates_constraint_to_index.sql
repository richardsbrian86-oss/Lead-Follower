ALTER TABLE "sequence_templates" DROP CONSTRAINT IF EXISTS "sequence_templates_gym_id_step_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sequence_templates_gym_id_step_unique" ON "sequence_templates" ("gym_id","step");
