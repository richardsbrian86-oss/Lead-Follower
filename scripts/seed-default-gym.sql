-- Seed script: insert the default gym and backfill all tenant-scoped tables.
-- Safe to run multiple times (idempotent via ON CONFLICT DO NOTHING / WHERE IS NULL).

-- 1. Insert default gym
INSERT INTO gyms (id, name, slug, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Gym', 'default', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 2. Backfill users
UPDATE users
   SET gym_id = '00000000-0000-0000-0000-000000000001'
 WHERE gym_id IS NULL;

-- 3. Backfill leads
UPDATE leads
   SET gym_id = '00000000-0000-0000-0000-000000000001'
 WHERE gym_id IS NULL;

-- 4. Backfill sequence_templates (global → default gym)
UPDATE sequence_templates
   SET gym_id = '00000000-0000-0000-0000-000000000001'
 WHERE gym_id IS NULL;

-- 5. Backfill lead_sequences via their lead's gym
UPDATE lead_sequences ls
   SET gym_id = l.gym_id
  FROM leads l
 WHERE ls.lead_id = l.id
   AND ls.gym_id IS NULL;

-- 6. Backfill outbound_messages via their lead's gym
UPDATE outbound_messages om
   SET gym_id = l.gym_id
  FROM leads l
 WHERE om.lead_id = l.id
   AND om.gym_id IS NULL;
