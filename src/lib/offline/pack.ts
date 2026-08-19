import { readFileSync } from "fs";
import path from "path";

/**
 * Tramokyo offline content pack — server-side reader.
 *
 * When OFFLINE_PACK=1 the app serves all journey/path/recording data
 * from a local snapshot at public/tramokyo-pack/ (built by
 * scripts/build-tramokyo-pack.mjs) instead of Supabase, so the whole
 * experience runs with zero network. Audio and images inside the pack
 * are served statically by Next at /tramokyo-pack/... — range requests
 * included.
 *
 * Never enable on Vercel: it also relaxes auth (kiosk laptop = trusted
 * operator).
 */

export function isOfflinePack(): boolean {
  return process.env.OFFLINE_PACK === "1";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PackRow = Record<string, any>;

interface PackManifest {
  exportedAt: string;
  counts: Record<string, number>;
  audio: Record<string, { file: string; codec: string | null; hasAac: boolean }>;
  journeyImages: Record<string, string[]>;
}

interface Pack {
  manifest: PackManifest;
  recordings: Map<string, PackRow>;
  recordingsList: PackRow[];
  analysesByRecording: Map<string, PackRow>;
  markersByRecording: Map<string, PackRow[]>;
  journeysById: Map<string, PackRow>;
  journeysByShareToken: Map<string, PackRow>;
  pathsByShareToken: Map<string, PackRow>;
}

let cached: Pack | null = null;

function packDir(): string {
  return path.join(process.cwd(), "public", "tramokyo-pack");
}

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(packDir(), rel), "utf8")) as T;
}

export function loadPack(): Pack {
  if (cached) return cached;

  const manifest = readJson<PackManifest>("manifest.json");
  const recordings = readJson<PackRow[]>("data/recordings.json");
  const analyses = readJson<PackRow[]>("data/analyses.json");
  const markers = readJson<PackRow[]>("data/markers.json");
  const journeys = readJson<PackRow[]>("data/journeys.json");
  const journeyPaths = readJson<PackRow[]>("data/journey_paths.json");

  const pack: Pack = {
    manifest,
    recordings: new Map(recordings.map((r) => [r.id as string, r])),
    recordingsList: recordings,
    analysesByRecording: new Map(analyses.map((a) => [a.recording_id as string, a])),
    markersByRecording: new Map(),
    journeysById: new Map(journeys.map((j) => [j.id as string, j])),
    journeysByShareToken: new Map(
      journeys.filter((j) => j.share_token).map((j) => [j.share_token as string, j]),
    ),
    pathsByShareToken: new Map(
      journeyPaths.filter((p) => p.share_token).map((p) => [p.share_token as string, p]),
    ),
  };

  for (const m of markers) {
    const rid = m.recording_id as string;
    const list = pack.markersByRecording.get(rid) ?? [];
    list.push(m);
    pack.markersByRecording.set(rid, list);
  }
  for (const list of pack.markersByRecording.values()) {
    list.sort((a, b) => (a.time as number) - (b.time as number));
  }

  cached = pack;
  return pack;
}

export function getRecording(id: string): PackRow | null {
  return loadPack().recordings.get(id) ?? null;
}

export function listRecordings(): PackRow[] {
  return loadPack().recordingsList;
}

export function getAnalysis(recordingId: string): PackRow | null {
  return loadPack().analysesByRecording.get(recordingId) ?? null;
}

export function getCueMarkers(recordingId: string): Array<{ time: number; label: string }> {
  return (loadPack().markersByRecording.get(recordingId) ?? [])
    .filter((m) => m.type === "cue")
    .map((m) => ({ time: m.time as number, label: m.label as string }));
}

export function getJourneyByShareToken(token: string): PackRow | null {
  return loadPack().journeysByShareToken.get(token) ?? null;
}

export function getJourneysByIds(ids: string[]): PackRow[] {
  const pack = loadPack();
  return ids
    .map((id) => pack.journeysById.get(id))
    .filter((j): j is PackRow => !!j);
}

export function getPathByShareToken(token: string): PackRow | null {
  return loadPack().pathsByShareToken.get(token) ?? null;
}

/** Static URL + codec info for a recording's packed audio, or null if absent. */
export function getAudioInfo(
  id: string,
): { url: string; codec: string | null; hasAac: boolean } | null {
  const entry = loadPack().manifest.audio[id];
  if (!entry) return null;
  return {
    url: `/tramokyo-pack/${entry.file}`,
    codec: entry.codec,
    hasAac: entry.hasAac,
  };
}
