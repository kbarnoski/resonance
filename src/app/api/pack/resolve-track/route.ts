import { NextResponse } from "next/server";
import {
  isOfflinePack,
  getRecording,
  listRecordings,
  getAnalysis,
  getCueMarkers,
} from "@/lib/offline/pack";
import { QUARANTINED_RECORDING_IDS } from "@/components/audio/installation-machine";

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

  let rec = recordingId ? getRecording(recordingId) : null;

  if (!rec && search) {
    // QUARANTINE (same ruling as the loop's pairing filter in
    // room/installation/page.tsx): the pack physically contains the
    // quarantined 17th St / Folsom St files — several are ALAC, which
    // Chrome cannot decode, and a pairing that resolves to one stalls
    // the journey (the-tempest pattern). DJ-mode launches route through
    // here, so filter them out of search resolution too; those journeys
    // draw a verified track from the random pool below instead.
    const recordings = listRecordings().filter(
      (r) => !QUARANTINED_RECORDING_IDS.has(r.id as string),
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
    const pool = listRecordings().filter(
      (r) =>
        !QUARANTINED_RECORDING_IDS.has(r.id as string) &&
        !((r.title as string) ?? "").toLowerCase().includes("without a brightness"),
    );
    if (pool.length === 0) {
      return NextResponse.json({ error: "No recordings in pack" }, { status: 404 });
    }
    rec = pool[Math.floor(Math.random() * pool.length)];
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
