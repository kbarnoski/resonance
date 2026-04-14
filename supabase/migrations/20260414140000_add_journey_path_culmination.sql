-- Adds an optional culmination journey to a user path. When set, the
-- culmination is unveiled after every journey in journey_ids is
-- completed. First use case: Welcome Home album — a 14th bonus
-- journey that plays a random track from the 13 at playback time.

ALTER TABLE journey_paths
  ADD COLUMN IF NOT EXISTS culmination_journey_id uuid REFERENCES journeys(id) ON DELETE SET NULL;
