ALTER TABLE "sequence_templates" DROP CONSTRAINT IF EXISTS "sequence_templates_gym_step_unique";
--> statement-breakpoint
ALTER TABLE "sequence_templates" DROP CONSTRAINT IF EXISTS "sequence_templates_gym_id_step_unique";
--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD CONSTRAINT "sequence_templates_gym_id_step_unique" UNIQUE("gym_id","step");
