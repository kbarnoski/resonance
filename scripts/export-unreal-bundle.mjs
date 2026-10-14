#!/usr/bin/env node
// export-unreal-bundle.mjs — one journey → a bundle Unreal Engine 5 can ingest
// with no custom code (docs/unreal-pipeline.md is the UE5 recipe).
//
//   node scripts/export-unreal-bundle.mjs --journey=<id|name> [--set=tramokyo-mix] --out=<dir>
//        [--rate=30] [--pack=<tramokyo-pack dir>] [--no-media] [--with-clips]
//
// Writes <out>/<slug>/ :
//   curves.csv        DataTable CSV, one row per frame (--rate, default 30/s):
//                     shader-drive bands, living-score onsets, beat/bar clock,
//                     phrase swell, harmonic currents, breath, emblem + flight
//   curvetable.csv    the same curves as an Unreal CurveTable (no struct needed)
//   events.json       sections / phrases / cadences / climax (deep analysis),
//                     phase timeline, shader timeline (the real JourneyEngine,
//                     the kiosk's pinned take), particle forms, emblem windows,
//                     onsets, morphs, still schedule
//   palette.json      theme + image palettes per phase (hex, sRGB, linear)
//   notes.csv         the analysis transcription (MIDI note, time, duration, velocity), when present
//   images/           the journey's pack stills, images/depth/ (depth maps),
//                     images/emblems/, images/index.json (when each is shown)
//   audio/            the pack track (.m4a/.mp3) + a 48 kHz 16-bit WAV for Unreal
//   README.md, bundle.json
//
// Deterministic (same pack + same code → byte-identical curves/events), no
// network, no live imagery. Reads the pack READ-ONLY. Node 20 (repo .nvmrc).
// Decoding runs ffmpeg-static under `nice -n 10`.
import { createJiti } from "jiti";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// ── args ────────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const get = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
  const has = (k) => argv.includes(`--${k}`);
  return {
    journey: get("journey") ?? null,
    set: get("set") ?? "tramokyo-mix",
    out: get("out") ?? null,
    rate: Number(get("rate") ?? 30),
    pack: get("pack") ?? (process.env.RESONANCE_PACK || path.join(ROOT, "public/tramokyo-pack")),
    media: !has("no-media"),
    clips: has("with-clips"),
    help: has("help") || has("h"),
  };
}

const USAGE = `usage: node scripts/export-unreal-bundle.mjs --journey=<id|name> [--set=tramokyo-mix] --out=<dir>
       [--rate=30|60] [--pack=<tramokyo-pack dir>] [--no-media] [--with-clips]`;

// ── the clock stub must be in place BEFORE the engine loads ─────────────────
let CLOCK = 1000;
Object.defineProperty(globalThis, "performance", { value: { now: () => CLOCK }, configurable: true, writable: true });
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(ROOT, "src") } });
const load = (p) => jiti.import(path.join(ROOT, p));

const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = (x) => Math.round(x * 100) / 100;
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function ffmpeg(args, opts = {}) {
  const r = spawnSync("nice", ["-n", "10", ffmpegPath, "-hide_banner", "-v", "error", ...args], { maxBuffer: 1 << 30, ...opts });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status}): ${String(r.stderr || "").slice(0, 400)}`);
  return r.stdout;
}

/** Decode a track to 48 kHz stereo float32, then down-mix like the AnalyserNode (mean). */
function decodeMono(file, sampleRate, downmix) {
  const buf = ffmpeg(["-i", file, "-vn", "-ac", "2", "-ar", String(sampleRate), "-f", "f32le", "-"]);
  const pcm = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return downmix(new Float32Array(pcm), 2);
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}

// ── main ────────────────────────────────────────────────────────────────────
export async function exportBundle(opts) {
  const J = await load("src/lib/journeys/journeys.ts");
  const ENG = await load("src/lib/journeys/journey-engine.ts");
  const SEQ = await load("src/lib/journeys/installation-sequence.ts");
  const TAKES = await load("src/lib/journeys/pinned-takes.ts");
  const { PARTICLE_PROFILES } = await load("src/lib/journeys/particle-profiles.generated.ts");
  const { PARTICLE_LEADS, JOURNEY_SIGNATURES } = await load("src/lib/journeys/particle-lead.ts");
  const { JOURNEY_IMAGE_PALETTES } = await load("src/lib/particles/journey-palettes.generated.ts");
  const { MASTERED_JOURNEYS } = await load("src/lib/journeys/mastered.ts");
  const { PHRASE_LOCKED_JOURNEYS, emblemWindows } = await load("src/lib/particles/phrase-conductor.ts");
  const { CURRENTS_LOCKED_JOURNEYS } = await load("src/lib/particles/harmonic-currents.ts");
  const { signatureFlightFor, FLIGHT } = await load("src/lib/particles/signature-flight.ts");
  const { fadeMsFor } = await load("src/lib/shaders/shader-fade.ts");
  const GA = await load("src/lib/journeys/ghost-arc.ts");
  const { computeCurves, toDataTableCsv, toCurveTableCsv, CURVE_COLUMNS, CURVE_RANGES } = await load("src/lib/cinematic/curves.ts");
  const { KIOSK_ANALYSER, downmixInterleaved } = await load("src/lib/cinematic/offline-analyser.ts");
  const B = await load("src/lib/cinematic/bundle.ts");

  const PACK = path.resolve(opts.pack);
  if (!existsSync(path.join(PACK, "data/journeys.json"))) throw new Error(`no tramokyo pack at ${PACK} (pass --pack=<dir>)`);
  const rows = readJson(path.join(PACK, "data/journeys.json"));
  const analyses = readJson(path.join(PACK, "data/analyses.json"));
  const manifest = readJson(path.join(PACK, "manifest.json"));
  const localImages = readJson(path.join(PACK, "local-images.json"));
  const localDepth = existsSync(path.join(PACK, "local-depth.json")) ? readJson(path.join(PACK, "local-depth.json")) : {};
  const localClips = existsSync(path.join(PACK, "local-clips.json")) ? readJson(path.join(PACK, "local-clips.json")) : {};
  const localEmblems = existsSync(path.join(PACK, "local-emblems.json")) ? readJson(path.join(PACK, "local-emblems.json")) : {};
  const PROTECTED = readJson(path.join(ROOT, "scripts/deep-analysis-protected.json"));

  // ── resolve the journey (id or exact name) ──
  const q = String(opts.journey ?? "").trim();
  if (!q) throw new Error("--journey is required");
  const ql = q.toLowerCase();
  const builtin = J.JOURNEYS.find((j) => j.id === q) ?? J.JOURNEYS.find((j) => j.name.toLowerCase() === ql);
  const row = rows.find((r) => r.id === q) ?? (!builtin ? rows.find((r) => (r.name ?? "").toLowerCase() === ql) : null);
  if (!builtin && !row) throw new Error(`journey not found: ${q}`);
  const journey = builtin ?? { id: row.id, name: row.name, realmId: row.realm_id, phases: row.phases, ...(row.theme ?? {}) };
  const id = journey.id;
  const name = journey.name;
  const slug = B.slugify(name);
  const profile = PARTICLE_PROFILES[id] ?? null;
  const recordingId = profile?.recordingId ?? row?.recording_id ?? null;
  if (!recordingId) throw new Error(`${name}: no recording`);

  // ── set context ──
  const setDef = SEQ.TRAMOKYO_MAIN.sets.find((s) => s.id === opts.set) ?? null;
  if (!setDef) throw new Error(`unknown set ${opts.set} (one of ${SEQ.TRAMOKYO_MAIN.sets.map((s) => s.id).join(", ")})`);
  const setIndex = setDef.journeyIds.indexOf(id);

  // ── deep analysis (pack first, the frozen sidecar for the protected takes) ──
  const packAn = analyses.find((a) => a.recording_id === recordingId) ?? null;
  const prot = PROTECTED[recordingId] ?? null;
  const summary = prot?.summary?.sections?.[0]?.start != null ? prot.summary : (packAn?.summary?.sections?.[0]?.start != null ? packAn.summary : prot?.summary ?? packAn?.summary ?? null);
  const notes = (packAn?.notes ?? []).filter((n) => Number.isFinite(n.time) && Number.isFinite(n.midi));
  const chords = (packAn?.chords ?? []).filter((c) => Number.isFinite(c.time));
  const analysisEvents = packAn?.events ?? [];

  // ── audio ──
  const audioRel = manifest.audio?.[recordingId]?.file;
  if (!audioRel) throw new Error(`${name}: recording ${recordingId} has no audio in the pack`);
  const audioFile = path.join(PACK, audioRel);
  const SR = KIOSK_ANALYSER.sampleRate;
  const mono = decodeMono(audioFile, SR, downmixInterleaved);
  const D = mono.length / SR;

  // ── phases / bounds ──
  const phases = journey.phases.map((p) => ({ id: p.id, start: p.start, end: p.end }));
  const cast = PARTICLE_LEADS[id] ?? null;
  const phaseBounds = (cast?.phaseBounds ?? profile?.phaseBounds ?? phases.slice(1).map((p) => p.start * D)).map(r2);

  // ── the real JourneyEngine, the kiosk's take (clock stubbed) ──
  const eng = ENG.getJourneyEngine();
  const seed = typeof TAKES.PINNED_TAKES[id] === "number" ? TAKES.PINNED_TAKES[id] : Array.isArray(TAKES.PINNED_TAKES[id]) ? TAKES.PINNED_TAKES[id][0] : 20261013;
  const script = TAKES.SCRIPTED_TAKES[id];
  CLOCK = 1000;
  eng.start(journey, { seed, trackDuration: D, script });
  const STEP = 0.25;
  const samples = [];
  const phaseFrames = new Map();
  for (let t = 0; t <= D + 1e-9; t += STEP) {
    CLOCK = 1000 + t * 1000;
    const f = eng.getFrame(Math.min(1, t / D));
    if (!f) continue;
    samples.push({ t: r3(t), primary: f.shaderMode || null, dual: f.dualShaderMode || null, tertiary: f.tertiaryShaderMode || null, opacity: r3(f.shaderOpacity ?? 0) });
    if (!phaseFrames.has(f.phase) || Math.abs(f.phaseProgress - 0.5) < Math.abs(phaseFrames.get(f.phase).phaseProgress - 0.5)) phaseFrames.set(f.phase, f);
  }
  eng.stop();
  const segments = B.shaderSegments(samples, r3(D));
  const shaderChanges = segments.map((s, i) => {
    const prev = [...segments.slice(0, i)].reverse().find((x) => x.layer === s.layer && x.end <= s.start + 1e-6);
    return { ...s, fadeInMs: Math.round(fadeMsFor(prev?.shader ?? null, s.shader)) };
  });

  // ── curves ──
  const flight = signatureFlightFor(id);
  const curves = computeCurves({
    mono, sampleRate: SR, journeyId: id, profile, phaseBounds,
    formChanges: (cast?.windows ?? []).map((w) => w.start),
    rate: opts.rate, flight,
  });

  // ── images ──
  const urls = localImages[id] ?? [];
  const stillFiles = urls.map((u) => path.posix.basename(u));
  const hasDepth = !!localDepth[id];
  const depthDir = path.join(PACK, "depth/journeys", id);
  const depthFor = (file) => {
    const png = file.replace(/\.(jpe?g|png)$/i, ".png");
    return hasDepth && existsSync(path.join(depthDir, png)) ? png : null;
  };
  const slotPhase = B.slotPhases(phases, urls.length);
  const ghostStages = id === "ghost" ? GA.ghostSlotStages(journey.phases, urls.length) : null;
  const finale = TAKES.TAKE_FINALE_STILLS?.[id] ? path.posix.basename(TAKES.TAKE_FINALE_STILLS[id]) : null;
  const intro = TAKES.TAKE_INTRO_STILLS?.[id] ? path.posix.basename(TAKES.TAKE_INTRO_STILLS[id]) : null;
  const schedule = B.stillSchedule({ phases, files: stillFiles, duration: D, cadence: 10, script: TAKES.TAKE_STILL_SCRIPTS?.[id], introFile: intro, finaleFile: finale });
  const emblemSrc = [localEmblems[id]].flat().filter((e) => typeof e === "string" && e.startsWith("/tramokyo-pack/"));
  const sig = JOURNEY_SIGNATURES?.[id] ?? null;
  const momentImages = (sig?.moments ?? []).flatMap((m) => m.images).filter((u) => u.startsWith("/tramokyo-pack/"));
  const emblemFiles = [...new Set([...emblemSrc, ...momentImages])];

  // ── palette ──
  const ip = JOURNEY_IMAGE_PALETTES[id] ?? null;
  const colorList = (hexes, weights) => hexes.map((h, i) => ({ ...B.bundleColor(h), ...(weights ? { weight: weights[i] } : {}) })).filter((c) => c.hex);
  const palette = {
    journey: { id, name },
    note: "theme = the journey engine's frame palette mid-phase (primary, secondary, accent, glow); image = colours sampled from this phase's pack stills (journey-palettes.generated.ts) — the colours the particles wear. linear = Unreal FLinearColor (sRGB-decoded).",
    phases: journey.phases.map((p, i) => {
      const f = phaseFrames.get(p.id);
      const th = f?.palette ?? p.palette ?? null;
      const img = ip?.phases?.[i] ?? null;
      return {
        index: i, id: p.id, start: r2(p.start * D), end: r2(p.end * D),
        theme: th ? Object.fromEntries(["primary", "secondary", "accent", "glow"].map((k) => [k, B.bundleColor(th[k])])) : null,
        image: img ? { key: B.bundleColor(img.key), colors: colorList(img.colors, img.weights) } : null,
      };
    }),
    journeyImagePalette: ip ? { key: B.bundleColor(ip.key), colors: colorList(ip.colors, ip.weights) } : null,
  };

  // ── events ──
  const deepSections = (summary?.sections ?? []).map((s, i) => ({
    index: i, name: s.name ?? s.label ?? `section ${i + 1}`, start: s.start ?? null, end: s.end ?? null,
    trend: s.trend ?? profile?.sections?.[i]?.trend ?? null,
    intensity: s.intensity ?? profile?.sections?.[i]?.intensity ?? null,
    localKey: s.local_key ?? profile?.sections?.[i]?.localKey ?? null,
    localBpm: s.local_bpm ?? null,
    mood: s.mood_words ?? null, character: s.character ?? null, imagery: s.imagery ?? null,
  }));
  const phraseTl = curves.phrase;
  const breathTl = curves.breath;
  const currentsTl = curves.currents;
  const cadences = (breathTl?.phrases ?? []).filter((p) => p.cadence && p.end < D - 0.5).map((p) => ({ t: r2(p.end), peak: p.peak, label: `cadence at ${fmt(p.end)}` }));
  const locked = MASTERED_JOURNEYS.has(id);
  const events = {
    version: B.BUNDLE_VERSION,
    journey: { id, name, slug, recordingId, set: opts.set, setPresenting: setDef.presenting, setPosition: setIndex >= 0 ? setIndex + 1 : null, mastered: locked },
    duration: r3(D),
    analysis: {
      key: profile?.key ?? summary?.profile?.key?.detected ?? null,
      tempo: profile?.tempo ?? summary?.tempo ?? null,
      mood: profile?.mood ?? summary?.mood ?? null,
      climaxTime: profile?.climaxTime ?? null,
      quietestTime: profile?.quietestTime ?? null,
      overview: summary?.overview ?? null,
      imageryCues: summary?.imagery_cues ?? null,
      dynamicsCurve: profile?.curve ?? null,
      sections: deepSections,
      cadences,
      climax: profile?.climaxTime != null ? { t: profile.climaxTime, label: `climax at ${fmt(profile.climaxTime)}` } : null,
      analysisEvents: analysisEvents.map((e) => ({ t: r3(e.time), type: e.type, label: e.label, intensity: e.intensity })),
      chords: chords.map((c) => ({ t: r3(c.time), chord: c.chord, dur: r3(c.duration ?? 0) })),
    },
    phrases: {
      kioskActive: !PHRASE_LOCKED_JOURNEYS.has(id),
      phraseSec: phraseTl?.phraseSec ?? null,
      events: phraseTl?.events ?? [],
      skipped: phraseTl?.skipped ?? [],
    },
    breath: { phraseSec: breathTl?.phraseSec ?? null, phrases: breathTl?.phrases ?? [] },
    harmonicCurrents: { kioskActive: !CURRENTS_LOCKED_JOURNEYS.has(id), marks: currentsTl?.marks ?? [] },
    onsets: curves.onsets.map((o) => ({ t: r3(o.t), strength: r3(o.strength), pitch: r3(o.pitch) })),
    phases: journey.phases.map((p, i) => ({ index: i, id: p.id, start: r3(p.start * D), end: r3(p.end * D), startFrac: p.start, endFrac: p.end, prompts: p.aiPromptSequence ?? (p.aiPrompt ? [p.aiPrompt] : []) })),
    phaseBounds,
    morphs: phaseBounds.map((t, i) => {
      const c = localClips[id]?.[`t${i}`] ?? null;
      return { index: i, t, intoPhase: journey.phases[i + 1]?.id ?? null, clip: c ? (c.h264 ?? null) : null, kind: c ? "travel-morph" : "crossfade" };
    }),
    shaders: {
      take: { seed, scripted: !!script },
      note: "Primary / dual / tertiary layers from the real JourneyEngine (journey-engine.ts) run over the track with the kiosk's pinned take, sampled every 0.25 s. fadeInMs = the brightness-aware crossfade (shader-fade.ts). Shader names are Resonance GLSL modes — in Unreal, recreate the LOOK (docs/unreal-pipeline.md), not the shader.",
      segments: shaderChanges,
      opacity: samples.filter((s, i) => i === 0 || s.opacity !== samples[i - 1].opacity).map((s) => ({ t: s.t, opacity: s.opacity })),
    },
    particles: cast ? {
      mastered: !!cast.mastered,
      windows: cast.windows.map((w) => ({ kind: w.kind, start: r2(w.start), end: r2(w.end), soul: w.soul, density: r3(w.density), densityEnd: r3(w.densityEnd) })),
      formCycle: cast.formCycle,
      morphSouls: cast.morphSouls,
      souls: cast.souls,
      signature: sig ? { image: sig.image, morphs: sig.morphs, moments: (sig.moments ?? []).map((m) => ({ ...m, images: m.images.map((u) => "images/emblems/" + path.posix.basename(u)) })) } : null,
      phraseForms: (phraseTl?.events ?? []).filter((e) => e.action === "form" || e.action === "refigure").map((e) => ({ t: e.t, action: e.action, label: e.label })),
    } : null,
    emblems: {
      windows: emblemWindows(D).map(([a, b]) => [r2(a), r2(Math.min(D, b))]),
      images: emblemFiles.map((u) => "images/emblems/" + path.posix.basename(u)),
      flights: curves.flights.map((f) => ({ ...f, start: r2(f.start), end: r2(f.start + f.sec) })),
      // the emblem's anatomy (image fractions, x right, y DOWN) + the flight's
      // constants — rig the wing hinge in Unreal from these (signature-flight.ts)
      signatureFlight: flight ? { name: flight.name, dir: flight.dir, wing: flight.wing, image: emblemFiles[0] ? "images/emblems/" + path.posix.basename(emblemFiles[0]) : null, constants: FLIGHT } : null,
    },
    ...(id === "ghost" ? { ghostArc: { law: "room → tunnel entrance → depths → flower pool → light above / emerge → flight to the tree → union → unify with light amidst the cosmos (docs/ghost-journey-spec.md §0)", stages: GA.GHOST_ARC_STAGES, flashes: GA.GHOST_FLASH_PROGRESS.map((p) => r2(p * D)) } } : {}),
    stills: schedule.map((s) => ({ ...s, file: "images/" + s.file })),
  };

  // ── write ──
  if (!opts.out) throw new Error("--out is required");
  const dir = path.join(path.resolve(opts.out), slug);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "images"), { recursive: true });
  const curvesCsv = toDataTableCsv(curves);
  writeFileSync(path.join(dir, "curves.csv"), curvesCsv);
  writeFileSync(path.join(dir, "curvetable.csv"), toCurveTableCsv(curves));
  writeFileSync(path.join(dir, "events.json"), JSON.stringify(events, null, 1) + "\n");
  writeFileSync(path.join(dir, "palette.json"), JSON.stringify(palette, null, 1) + "\n");
  if (notes.length) {
    const ns = [...notes].sort((a, b) => a.time - b.time || a.midi - b.midi);
    writeFileSync(path.join(dir, "notes.csv"), "Name,Time,Midi,Duration,Velocity\n" + ns.map((n, i) => `N${String(i).padStart(6, "0")},${r3(n.time)},${n.midi},${r3(n.duration ?? 0)},${n.velocity ?? 64}`).join("\n") + "\n");
  }

  const imageIndex = {
    note: "slot = the pack's story order (phase slices, arc law). shown = when the kiosk's slot mapping shows it on a 10 s cadence (an edit suggestion, see events.json stills). depth = a depth map (white = near) for 2.5D displacement.",
    stills: stillFiles.map((f, i) => ({
      slot: i, file: "images/" + f, phase: slotPhase[i] ?? null,
      ...(ghostStages ? { arcStage: ghostStages[i], arcStageName: GA.GHOST_ARC_STAGES[ghostStages[i] - 1] } : {}),
      depth: depthFor(f) ? "images/depth/" + depthFor(f) : null,
      shown: schedule.filter((s) => s.slot === i).map((s) => [s.start, s.end]),
    })),
    emblems: emblemFiles.map((u) => "images/emblems/" + path.posix.basename(u)),
  };
  writeFileSync(path.join(dir, "images/index.json"), JSON.stringify(imageIndex, null, 1) + "\n");

  if (opts.media) {
    for (const u of urls) copyFileSync(path.join(PACK, u.replace(/^\/tramokyo-pack\//, "")), path.join(dir, "images", path.posix.basename(u)));
    if (hasDepth) {
      mkdirSync(path.join(dir, "images/depth"), { recursive: true });
      for (const f of stillFiles) { const d = depthFor(f); if (d) copyFileSync(path.join(depthDir, d), path.join(dir, "images/depth", d)); }
    }
    if (emblemFiles.length) {
      mkdirSync(path.join(dir, "images/emblems"), { recursive: true });
      for (const u of emblemFiles) { const src = path.join(PACK, u.replace(/^\/tramokyo-pack\//, "")); if (existsSync(src)) copyFileSync(src, path.join(dir, "images/emblems", path.posix.basename(u))); }
    }
    mkdirSync(path.join(dir, "audio"), { recursive: true });
    copyFileSync(audioFile, path.join(dir, "audio", slug + path.extname(audioFile)));
    ffmpeg(["-y", "-i", audioFile, "-vn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", path.join(dir, "audio", slug + ".wav")]);
    if (opts.clips) {
      const c = localClips[id] ?? {};
      const keys = Object.keys(c).filter((k) => /^t\d$/.test(k)).sort();
      if (keys.length) mkdirSync(path.join(dir, "clips"), { recursive: true });
      for (const k of keys) { const u = c[k]?.h264; if (u) copyFileSync(path.join(PACK, u.replace(/^\/tramokyo-pack\//, "")), path.join(dir, "clips", path.posix.basename(u))); }
    }
  }

  const readme = renderReadme({ name, id, slug, D, rate: curves.rate, rows: curves.rows.length, columns: CURVE_COLUMNS, ranges: CURVE_RANGES, events, media: opts.media, hasDepth, notes: notes.length, locked, flight: !!flight, setDef, setIndex });
  writeFileSync(path.join(dir, "README.md"), readme);

  const files = listFiles(dir).filter((f) => f !== "bundle.json");
  const bundle = {
    version: B.BUNDLE_VERSION,
    generator: "scripts/export-unreal-bundle.mjs",
    journey: { id, name, slug, recordingId },
    set: opts.set,
    duration: r3(D),
    curves: { rate: curves.rate, rows: curves.rows.length, columns: CURVE_COLUMNS.length, analyser: KIOSK_ANALYSER, sha256: sha256(curvesCsv) },
    media: opts.media,
    files: files.map((f) => ({ path: f, bytes: statSync(path.join(dir, f)).size })),
  };
  writeFileSync(path.join(dir, "bundle.json"), JSON.stringify(bundle, null, 1) + "\n");
  const all = listFiles(dir);
  const missing = B.validateBundleLayout(all, { media: opts.media, depth: opts.media && hasDepth });
  if (missing.length) throw new Error(`bundle incomplete: ${missing.join(", ")}`);
  const bytes = all.reduce((s, f) => s + statSync(path.join(dir, f)).size, 0);
  return { dir, slug, files: all, bytes, rows: curves.rows.length, onsets: curves.onsets.length, segments: segments.length, stills: stillFiles.length, depth: hasDepth, duration: D };
}

function renderReadme(o) {
  const ev = o.events;
  const secs = ev.analysis.sections.map((s) => `| ${s.index + 1} | ${s.name} | ${s.start != null ? fmt(s.start) : "?"}–${s.end != null ? fmt(s.end) : "?"} | ${s.trend ?? ""} | ${s.intensity ?? ""} |`).join("\n");
  const ph = ev.phases.map((p) => `| ${p.index} | ${p.id} | ${fmt(p.start)}–${fmt(p.end)} |`).join("\n");
  const cols = o.columns.map((c) => `| \`${c}\` | ${o.ranges[c][0]} … ${o.ranges[c][1] === Infinity ? "∞" : o.ranges[c][1]} |`).join("\n");
  return `# ${o.name} — Resonance → Unreal bundle

Journey \`${o.id}\` · ${fmt(o.D)} (${o.D.toFixed(2)} s) · set **${o.setDef.presenting}** (\`${ev.journey.set}\`${o.setIndex >= 0 ? `, #${o.setIndex + 1}` : ", not in this set"})${o.locked ? " · **mastered on the kiosk** (Snowflake/Ghost lock: the kiosk never conducts phrases/currents for it; this film data is offered for the cinematic only)" : ""}

Generated by \`scripts/export-unreal-bundle.mjs\`. The full UE5 recipe is in the
Resonance repo: \`docs/unreal-pipeline.md\`. Everything here is plain CSV / JSON /
JPG / PNG / WAV: Unreal ingests it with no custom code.

## Files

| File | What | Unreal import |
|---|---|---|
| \`curves.csv\` | ${o.rows} rows at ${o.rate}/s, ${o.columns.length} columns (below) | **DataTable** with row struct \`S_ResonanceFrame\` (one float field per column, same names) |
| \`curvetable.csv\` | the same curves, one row per curve, key times in the header | **CurveTable** (Linear interpolation) — no struct needed |
| \`events.json\` | sections, phrases, cadences, climax, phases, shader timeline, particle forms, emblem windows, onsets, morphs, still schedule | read in a Blueprint (JSON Blueprint Utilities plugin) or by eye to place Sequencer keys / markers |
| \`palette.json\` | per phase: theme + image palettes (hex, sRGB, **linear** for FLinearColor) | copy into a Material Parameter Collection / Niagara colour curves |
| ${o.notes ? "`notes.csv`" : "(no `notes.csv`)"} | ${o.notes ? `${o.notes} transcribed notes (Time s, MIDI, Duration, Velocity)` : "no transcription in the pack for this recording"} | DataTable (\`S_ResonanceNote\`) → Niagara spawn bursts per note |
| \`images/*.jpg\` | the journey's pack stills in story order | Texture2D (sRGB) |
| \`images/depth/*.png\` | ${o.hasDepth ? "depth maps (white = near)" : "**none in the pack for this journey** — make them in UE (or later offline) before 2.5D displacement"} | Texture2D, **sRGB off**, compression Grayscale/Alpha |
| \`images/emblems/\` | the journey's emblem / signature-moment images | Texture2D |
| \`images/index.json\` | each still's slot, phase${o.id === "ghost" ? ", Ghost arc stage" : ""}, depth map and when it is shown | reference |
| \`audio/${o.slug}.wav\` | 48 kHz 16-bit PCM | Sound Wave → Sequencer Audio track at frame 0 |
| \`audio/${o.slug}.m4a\` | the pack's original track | reference / final mux |
${o.media ? "" : "\n**This bundle was exported with `--no-media`: images/audio are indexed but not copied.**\n"}
## Curves (\`curves.csv\` columns)

Time base: \`Time\` = seconds from the first sample of \`audio/${o.slug}.wav\`.
Row \`F000000\` is t = 0; row *n* is t = n / ${o.rate}. In Sequencer, at ${o.rate} fps
the row index IS the frame number; at another frame rate evaluate the CurveTable
at \`Time\` (seconds).

| Column | Range |
|---|---|
${cols}

- **Bass/Mid/Treble/Level** — the shaders' FFT drive (kiosk analyser fftSize 256,
  smoothing 0.8, read at 60 Hz; bins 0-5 / 6-30 / 31-63; 0.06 @ 60 fps; frozen in
  silence) = OSC \`/resonance/audio/*\`. **…Kinetic** — the kinetic layers'
  faster drive (0.3 @ 60 fps) after the visible velocity limit. Solo piano
  has almost nothing above ~5.5 kHz at the analyser's -100 dB floor, so
  \`Treble\` (5.8-12 kHz) barely leaves 0 — exactly as on the kiosk. For
  sparkle use \`Mid\`, \`OnsetPitch\` (high register) and \`OnsetEnv\`.
- **Onset / OnsetPitch / OnsetEnv** — the living-score detector: \`Onset\` holds a
  note's strength on the row it fired (else 0), \`OnsetPitch\` the last note's
  register (0 low … 1 high), \`OnsetEnv\` the swirl envelope (smooth rise, 1-3 s
  decay) — drive Niagara with \`OnsetEnv\`, never a brightness.
- **Swell\*** phrase conductor (1 = neutral), **Current\*** harmonic currents
  (tension 0 = laminar release … 1 = gathering vortices), **Breath\*** phrasing
  breath (−1 exhaled … +1 inhaled; settle as a phrase lands on a cadence).
- **Emblem\*** the emblem envelope; **Flight\* / Wing\* / TailSpread** ${o.flight ? "the Yellow Bird songbird's flap-bounding flight (opening + closing), x/y in screen half-extents, angles in radians" : "zero (this journey has no signature flight)"}.

## Musical map

| # | Section | Time | Trend | Intensity |
|---|---|---|---|---|
${secs || "| | (no deep sections) | | | |"}

Climax: ${ev.analysis.climax ? ev.analysis.climax.label : "—"} · cadences: ${ev.analysis.cadences.map((c) => fmt(c.t)).join(" ") || "—"}

| Phase | Id | Time |
|---|---|---|
${ph}

## Laws the film inherits (non-negotiable)

- **Seizure law**: no flashes, no full-screen washes, ≤ 3 luminance changes a
  second, never saturated red flashes. Drive MOTION, scale and density from
  these curves — never exposure, emissive intensity or light brightness directly.
- **Motion, not brightness**; **no film grain**; **dark floor** (the frame rests near black).
- **No literal humans or faces**; ${o.id === "ghost" ? "Ghost: no halos, no faces; the arc law in events.json `ghostArc` must hold in order." : "abstract or nature only."}
- **Transitions never abrupt** — every cut is a dissolve or a camera move.
`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.journey || !opts.out) {
    console.log(USAGE);
    process.exit(opts.help ? 0 : 1);
  }
  try {
    const r = await exportBundle(opts);
    const mb = (r.bytes / 1048576).toFixed(1);
    console.log(`${r.dir}\n  ${r.duration.toFixed(1)} s · ${r.rows} curve rows · ${r.onsets} onsets · ${r.segments} shader segments · ${r.stills} stills${r.depth ? " + depth" : ""} · ${r.files.length} files · ${mb} MB`);
  } catch (e) {
    console.error(String(e?.stack ?? e));
    process.exit(1);
  }
}
