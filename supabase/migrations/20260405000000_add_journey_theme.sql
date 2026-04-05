-- Add theme JSONB column for AI-generated journey themes.
-- Nullable: only populated for new custom journeys (not realm-based built-in journeys).
-- Existing rows keep realm_id and theme = NULL.
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS theme jsonb;
