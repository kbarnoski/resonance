/**
 * Deep analysis v2 backfill (server-side, service key — no per-user rate limit).
 *
 * For every analyses row (or a filtered subset):
 *   1. get the audio (kiosk pack copy if present, else Supabase storage),
 *      decode to 22.05 kHz mono with ffmpeg-static,
 *   2. computeAudioFeatures → buildMusicProfile (real tempo, sections,
 *      dynamics, register, mode balance — src/lib/audio/music-profile.ts),
 *   3. generateDeepSummary (Claude Opus 5.5, v2 schema — deep-summary.ts),
 *   4. write analyses.tempo (real BPM), analyses.key_signature (correctly
 *      rotated Krumhansl key) and analyses.summary (v2).
 *
 * Run (Node 20):
 *   node --env-file=.env.local node_modules/.bin/vite-node --config vitest.config.ts \
 *     scripts/deep-analysis-backfill.ts [--all | --missing] [--titles="A,B"] [--ids=uuid,...]
 *     [--profile-only] [--concurrency=4]
 * Default = rows that are not yet v2.
 */
import { createClient } from "@supabase/supabase-js";
import ffmpegPath from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeAudioFeatures, buildMusicProfile } from "../src/lib/audio/music-profile";
import { generateDeepSummary, isDeepSummaryV2 } from "../src/lib/audio/deep-summary";
import { isAnalysisFrozen } from "../src/lib/audio/analysis-protected";
import { readFileSync } from "node:fs";

// Frozen recordings (Ghost / Snowflake / Realized / Kinetic Lab): NEVER
// written to the DB — their v2 goes to this sidecar instead.
const SIDECAR = "scripts/deep-analysis-protected.json";
let sidecar: Record<string, unknown> = {};
try { sidecar = JSON.parse(readFileSync(SIDECAR, "utf8")); } catch {}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
) as Record<string, string | true>;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const CACHE = path.join(os.tmpdir(), "resonance-audio-cache");
mkdirSync(CACHE, { recursive: true });
const LOG = "scripts/deep-analysis-backfill.log.jsonl";

type Row = {
  id: string;
  recording_id: string;
  key_signature: string | null;
  summary: unknown;
  recordings: { title: string; duration: number | null; aac_file_name: string | null; audio_url: string | null; file_name: string | null } | null;
};

async function audioFile(recId: string, r: NonNullable<Row["recordings"]>): Promise<string | null> {
  const pack = `public/tramokyo-pack/audio/${recId}.m4a`;
  if (existsSync(pack)) return pack;
  const cached = path.join(CACHE, recId);
  if (existsSync(cached)) return cached;
  for (const key of [r.aac_file_name, r.audio_url, r.file_name].filter(Boolean) as string[]) {
    const { data, error } = await supabase.storage.from("recordings").download(key);
    if (!error && data) {
      writeFileSync(cached, Buffer.from(await data.arrayBuffer()));
      return cached;
    }
  }
  return null;
}

function decode(file: string): Float32Array {
  const r = spawnSync(ffmpegPath as unknown as string, ["-nostdin", "-i", file, "-ac", "1", "-ar", "22050", "-f", "f32le", "-"], {
    maxBuffer: 1 << 30,
  });
  if (r.status !== 0) throw new Error(`ffmpeg decode failed: ${r.stderr.toString().slice(-200)}`);
  const b = r.stdout;
  // copy into an aligned buffer (Buffer offsets are not always 4-aligned)
  const out = new Float32Array(b.byteLength / 4);
  new Uint8Array(out.buffer).set(b);
  return out;
}

const { data: rows, error } = await supabase
  .from("analyses")
  .select("id,recording_id,key_signature,summary,recordings(title,duration,aac_file_name,audio_url,file_name)")
  .order("created_at");
if (error) throw error;

let todo = (rows as unknown as Row[]).filter((r) => r.recordings);
if (typeof args.titles === "string") {
  const want = new Set(args.titles.split(",").map((t) => t.trim().toLowerCase()));
  todo = todo.filter((r) => want.has(r.recordings!.title.trim().toLowerCase()));
}
if (typeof args.ids === "string") {
  const want = new Set(args.ids.split(","));
  todo = todo.filter((r) => want.has(r.recording_id) || want.has(r.id));
}
if (!args.all && !args.titles && !args.ids) todo = todo.filter((r) => isAnalysisFrozen(r.recording_id) ? !sidecar[r.recording_id] : !isDeepSummaryV2(r.summary));
if (args.missing) todo = todo.filter((r) => !r.summary);
if (typeof args.exclude === "string") {
  const ex = new Set(args.exclude.split(","));
  todo = todo.filter((r) => !ex.has(r.recording_id) && !ex.has(r.id));
}
console.log(`${todo.length} analyses to process${args["profile-only"] ? " (profile only, no writes)" : ""}`);

const conc = Number(args.concurrency ?? 4);
let inTok = 0, outTok = 0, done = 0, failed = 0;
async function work(r: Row) {
  const rec = r.recordings!;
  const t0 = Date.now();
  try {
    const { data: full, error: e2 } = await supabase.from("analyses").select("notes,chords,events").eq("id", r.id).single();
    if (e2) throw e2;
    const file = await audioFile(r.recording_id, rec);
    const audio = file ? computeAudioFeatures(decode(file), 22050) : null;
    const profile = buildMusicProfile({ notes: full.notes ?? [], chords: full.chords ?? [], duration: rec.duration, keySignature: r.key_signature, audio });
    const t = profile.tempo;
    const line = `${rec.title.padEnd(28)} ${String(t ? Math.round(t.bpm) : "?").padStart(3)} BPM ${(t?.feel ?? "?").padEnd(9)} ${(t?.pulse ?? "").padEnd(14)} key ${profile.key.detected} (was ${r.key_signature}) | ${profile.modeBalance.verdict} | ${profile.dynamics.shape} climax ${profile.dynamics.climaxTime}s | ${profile.sections.length} sections${audio ? "" : " [NO AUDIO]"}`;
    if (args["profile-only"]) { console.log(line); done++; return; }
    const res = await generateDeepSummary({ title: rec.title, notes: full.notes ?? [], chords: full.chords ?? [], events: full.events ?? [], profile });
    inTok += res.usage.input_tokens; outTok += res.usage.output_tokens;
    if (isAnalysisFrozen(r.recording_id)) {
      sidecar[r.recording_id] = { title: rec.title, analysis_id: r.id, tempo: t ? Math.round(t.bpm) : null, key_signature: profile.key.detected, summary: res.summary };
      writeFileSync(SIDECAR, JSON.stringify(sidecar, null, 1));
      done++;
      console.log(`❄ FROZEN (sidecar only, DB untouched) ${line}`);
      return;
    }
    const { error: upErr } = await supabase
      .from("analyses")
      .update({ summary: res.summary, tempo: t ? Math.round(t.bpm) : null, key_signature: profile.key.detected ?? r.key_signature })
      .eq("id", r.id);
    if (upErr) throw upErr;
    done++;
    console.log(`✓ ${line} | ${res.usage.input_tokens}+${res.usage.output_tokens} tok, ${Math.round((Date.now() - t0) / 1000)}s`);
    appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), analysis: r.id, title: rec.title, bpm: t?.bpm, feel: t?.feel, key: profile.key.detected, was: r.key_signature, usage: res.usage }) + "\n");
  } catch (e) {
    failed++;
    console.log(`✗ ${rec.title}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
const queue = [...todo];
await Promise.all(Array.from({ length: conc }, async () => { while (queue.length) await work(queue.shift()!); }));
const cost = (inTok * 4 + outTok * 20) / 1e6;
console.log(`\ndone ${done}, failed ${failed}; tokens in ${inTok} out ${outTok} ≈ $${cost.toFixed(2)} (Opus 5.5 list price)`);
