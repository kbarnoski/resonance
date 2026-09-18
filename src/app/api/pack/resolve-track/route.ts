import { NextResponse } from "next/server";
import {
  isOfflinePack,
  getRecording,
  listRecordings,
  getAnalysis,
  getCueMarkers,
} from "@/lib/offline/pack";
import { VERIFIED_RECORDING_IDS } from "@/components/audio/installation-machine";

// Offline kiosk only — resolves a journey's track from the local pack,
// mirroring the journey selector's Supabase flow: exact recordingId,
// then PAIRED_TRACKS spec ("=Exact" or "%pattern%"), then a random
// library track. Online this 404s and the client uses Supabase.
export async function GET(request: Request) {
  if (!isOfflinePack()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const recordingId = searchParams.get("recordingId");
  const search = searchParams.get("search");

  // ALLOWLIST — every branch of this route, the exact-recordingId one
  // included: it only ever resolves tracks for JOURNEY launches (loop +
  // DJ mode), never for deliberate library playback, so nothing outside
  // Karel's verified catalog may come out of it. Flipped from the
  // quarantine denylist after the 2026-09-18 incident (Joseph's track
  // played under Mycelium Dream); see VERIFIED_RECORDING_IDS.
  let rec = recordingId ? getRecording(recordingId) : null;
  if (rec && !VERIFIED_RECORDING_IDS.has(rec.id as string)) rec = null;

  if (!rec && search) {
    const recordings = listRecordings().filter(
      (r) => VERIFIED_RECORDING_IDS.has(r.id as string),
    );
    if (search.startsWith("=")) {
      const title = search.slice(1);
      rec = recordings.find((r) => r.title === title) ?? null;
    } else {
      const needle = search.replaceAll("%", "").toLowerCase();
      rec =
        recordings.find((r) =>
          ((r.title as string) ?? "").toLowerCase().includes(needle),
        ) ?? null;
    }
  }

  if (!rec) {
    // DETERMINISTIC (Karel 2026-09-18): no random substitution, ever.
    // A journey whose pairing doesn't resolve gets a 404 and the client
    // degrades (skip / no audio) instead of playing a stand-in track.
    return NextResponse.json(
      { error: "No paired track — deterministic mode never substitutes" },
      { status: 404 },
    );
  }

  const id = rec.id as string;
  return NextResponse.json({
    track: {
      id,
      title: rec.title,
      duration: rec.duration ?? null,
      artist: rec.artist ?? null,
    },
    analysis: getAnalysis(id),
    cues: getCueMarkers(id),
  });
}
