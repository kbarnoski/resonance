-- Add featured flag to recordings
ALTER TABLE recordings ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;

-- Featured albums table
CREATE TABLE IF NOT EXISTS featured_albums (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  artist text,
  description text,
  cover_url text,
  position integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Junction table for album tracks
CREATE TABLE IF NOT EXISTS featured_album_tracks (
  album_id uuid REFERENCES featured_albums(id) ON DELETE CASCADE,
  recording_id uuid REFERENCES recordings(id) ON DELETE CASCADE,
  position integer DEFAULT 0,
  PRIMARY KEY (album_id, recording_id)
);

-- RLS policies

-- Anyone can view featured recordings
CREATE POLICY "Anyone can view featured recordings"
  ON recordings FOR SELECT
  USING (is_featured = true);

-- Anyone can view analyses of featured recordings
CREATE POLICY "Anyone can view analyses of featured recordings"
  ON analyses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM recordings
      WHERE recordings.id = analyses.recording_id
      AND recordings.is_featured = true
    )
  );

-- Anyone can view active featured albums
ALTER TABLE featured_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active featured albums"
  ON featured_albums FOR SELECT
  USING (is_active = true);

CREATE POLICY "Owner can manage featured albums"
  ON featured_albums FOR ALL
  USING (auth.uid() = user_id);

-- Anyone can view featured album tracks
ALTER TABLE featured_album_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view featured album tracks"
  ON featured_album_tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM featured_albums
      WHERE featured_albums.id = featured_album_tracks.album_id
      AND featured_albums.is_active = true
    )
  );

CREATE POLICY "Owner can manage featured album tracks"
  ON featured_album_tracks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM featured_albums
      WHERE featured_albums.id = featured_album_tracks.album_id
      AND featured_albums.user_id = auth.uid()
    )
  );
