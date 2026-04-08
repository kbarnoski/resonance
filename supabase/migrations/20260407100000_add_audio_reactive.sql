-- Add audio_reactive flag to journeys table
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS audio_reactive boolean NOT NULL DEFAULT false;
