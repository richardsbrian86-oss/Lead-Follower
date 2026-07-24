-- Seed script: insert the default gym and backfill all tenant-scoped tables.
-- Safe to run multiple times (idempotent via ON CONFLICT / WHERE conditions).

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

-- 7. Add nullable gym_id column to sessions (safe if already exists)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS gym_id varchar REFERENCES gyms(id);

-- 8. Backfill sessions.gym_id from JSONB session data
UPDATE sessions
   SET gym_id = sess->'user'->>'gymId'
 WHERE gym_id IS NULL
   AND sess->'user'->>'gymId' IS NOT NULL;

-- 9. Auto-populate sessions.gym_id on future inserts/updates via trigger
CREATE OR REPLACE FUNCTION sessions_set_gym_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.gym_id := NEW.sess->'user'->>'gymId';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sessions_gym_id_trigger ON sessions;
CREATE TRIGGER sessions_gym_id_trigger
  BEFORE INSERT OR UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION sessions_set_gym_id();

-- 10. Enforce NOT NULL on fully-backfilled tenant business tables
--     (run only after all rows have been backfilled above)
ALTER TABLE leads              ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE lead_sequences     ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE sequence_templates ALTER COLUMN gym_id SET NOT NULL;
ALTER TABLE outbound_messages  ALTER COLUMN gym_id SET NOT NULL;

-- 11. Ensure composite unique index on sequence_templates (step, gym_id)
ALTER TABLE sequence_templates DROP CONSTRAINT IF EXISTS sequence_templates_step_key;
ALTER TABLE sequence_templates DROP CONSTRAINT IF EXISTS sequence_templates_gym_step_unique;
ALTER TABLE sequence_templates ADD CONSTRAINT sequence_templates_gym_step_unique UNIQUE (gym_id, step);
