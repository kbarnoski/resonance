ALTER TABLE analyses ADD COLUMN IF NOT EXISTS events jsonb DEFAULT '[]'::jsonb;
