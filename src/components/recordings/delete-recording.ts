"use client";

import { createClient } from "@/lib/supabase/client";
import { useAudioStore } from "@/lib/audio/audio-store";
import { clearCachedUrl } from "@/lib/audio/resolve-audio-url";
import { toast } from "sonner";

/**
 * Shared delete flow for recordings — used by both the library card and
 * the recording detail page so the two can't drift apart.
 *
 * Policy:
 * 1. If this recording is the globally loaded track (playing or paused),
 *    pause via the store and clear it, so the engine never keeps playing
 *    audio that no longer exists.
 * 2. Purge the sessionStorage URL cache entry for the recording.
 * 3. Attempt storage removal, but proceed to the DB delete either way —
 *    an orphaned storage object is quietly recoverable; blocking the
 *    delete on a storage hiccup is not.
 * 4. If the DB delete fails, surface the error and report failure.
 * 5. If storage failed but the DB delete succeeded, surface a
 *    partial-failure toast.
 *
 * Returns true when the recording row is gone (even if storage cleanup
 * partially failed), false when the delete did not happen.
 */
export async function deleteRecording(id: string, fileName: string): Promise<boolean> {
  const store = useAudioStore.getState();
  if (store.currentTrack?.id === id) {
    store.pause();
    store.clear();
  }
  clearCachedUrl(id);

  const supabase = createClient();

  const { error: storageError } = await supabase.storage
    .from("recordings")
    .remove([fileName]);

  const { error: dbError } = await supabase
    .from("recordings")
    .delete()
    .eq("id", id);

  if (dbError) {
    toast.error(`Failed to delete recording: ${dbError.message}`);
    return false;
  }

  if (storageError) {
    toast.warning(
      `Recording deleted, but its audio file could not be removed: ${storageError.message}`,
    );
  } else {
    toast.success("Recording deleted");
  }
  return true;
}
