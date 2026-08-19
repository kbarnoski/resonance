import { NextResponse } from "next/server";
import {
  isOfflinePack,
  getRecording,
  listRecordings,
  getAnalysis,
  getCueMarkers,
} from "@/lib/offline/pack";

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
    const recordings = listRecordings();
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
      (r) => !((r.title as string) ?? "").toLowerCase().includes("without a brightness"),
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
