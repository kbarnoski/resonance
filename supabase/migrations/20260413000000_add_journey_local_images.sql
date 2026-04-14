-- Local images for journeys — when populated, the journey renders these
-- (cycled in phase order) instead of generating AI imagery at playback.
-- Used for the photographer collaboration path: bring your own photos.
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS local_image_urls text[];

-- Storage bucket for user-uploaded journey imagery.
-- Public-read so playback (including shared journeys) can render without signed URLs.
-- Writes are restricted to the authenticated user's own folder.
INSERT INTO storage.buckets (id, name, public)
VALUES ('journey-images', 'journey-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'journey_images_user_upload'
  ) THEN
    CREATE POLICY "journey_images_user_upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'journey-images' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'journey_images_public_read'
  ) THEN
    CREATE POLICY "journey_images_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'journey-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'journey_images_user_delete'
  ) THEN
    CREATE POLICY "journey_images_user_delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'journey-images' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;
