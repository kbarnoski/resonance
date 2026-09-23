#!/usr/bin/env node
// qa-proto.mjs — the dream agent's hard QA gate (Karel, 2026-09-23:
// "sometimes it creates one that isn't working and that is unacceptable
// in all cases — program in a QA check and fix if it's not 100%
// production level quality").
//
// Usage:  node docs/dreams/tools/qa-proto.mjs src/app/dream/<n>-<slug>
//
// Static analysis of one proto folder. FAIL (exit 1) on anything that
// means a broken or below-bar proto; WARN for judgment calls the
// orchestrator must resolve by eye. `npm run build` remains a separate
// absolute gate — this runs BEFORE it and checks what a compiler can't.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
  console.error("usage: node docs/dreams/tools/qa-proto.mjs src/app/dream/<n>-<slug>");
  process.exit(2);
}

const fails = [];
const warns = [];
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = path.join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dir);
const read = (p) => readFileSync(p, "utf8");
const all = files.filter((f) => /\.(tsx?|md|css|jsx?)$/.test(f)).map((f) => [f, read(f)]);
const pages = all.filter(([f]) => f.endsWith("page.tsx"));
const code = all.filter(([f]) => /\.(tsx?|jsx?)$/.test(f));
const joined = all.map(([, c]) => c).join("\n");

// ── 1. Structure ────────────────────────────────────────────────────────────
if (pages.length === 0) fails.push("no page.tsx — not a proto");
if (!files.some((f) => f.endsWith("README.md"))) fails.push("no README.md (required: H1 + **Status** line — the catalog parser needs them)");
const readme = all.find(([f]) => f.endsWith("README.md"))?.[1] ?? "";
if (readme && !/^# /m.test(readme)) fails.push("README.md has no H1");
if (readme && !/\*\*Status\*\*/.test(readme)) fails.push("README.md has no **Status** line");

// ── 2. Audio discipline (ABSOLUTE rule 10 + safeMaster) ─────────────────────
const makesAudio = /new\s+(window\.)?(webkit)?AudioContext|new\s+OfflineAudioContext/i.test(joined);
if (makesAudio) {
  if (!/safeMaster|createSafeMaster/.test(joined))
    fails.push("creates an AudioContext but never routes through createSafeMaster — un-bussed audio path");
  if (/\.connect\(\s*(ctx|context|audioCtx|audioContext|ac)\.destination\s*\)/.test(joined))
    warns.push("direct .connect(<ctx>.destination) found — verify it is only inside safeMaster itself");
  if (!/welcomeHome|loadRealTrackBuffer/.test(joined))
    fails.push("audible proto without the verified catalog (welcomeHome/loadRealTrackBuffer) — rule 10");
}
if (/api\/featured/.test(joined)) fails.push("uses /api/featured — that table is empty and silently falls back to synth");

// ── 3. Camera / embodiment (works-when-shipped gate) ────────────────────────
const usesCamera = /getUserMedia|cameraTracking|createHandTracker|createPoseTracker|createFaceTracker|createGestureTracker/.test(joined);
if (usesCamera) {
  if (!/_shared\/cameraTracking/.test(joined))
    fails.push("camera proto not using _shared/cameraTracking — per-proto loaders are banned");
  if (!/tracking/i.test(joined.replace(/cameraTracking/g, "")))
    fails.push("no visible tracking-status indicator (live vs lost must be shown on screen)");
  if (!/catch/.test(joined))
    fails.push("no error handling anywhere — camera/model failures must degrade visibly");
  if (/visibility\s*[><]=?\s*0?\.[3-9]/.test(joined) && /hip|ankle|knee/i.test(joined))
    warns.push("visibility gate on hips/ankles/knees — laptop webcams don't see them (bodycast lesson); synthesize instead");
}

// ── 4. Immersion (fullscreen + info overlay directive) ──────────────────────
if (!/useImmersive/.test(joined)) fails.push("no useImmersive — fullscreen is required on every proto");
if (!/ImmersiveHud/.test(joined))
  fails.push("no ImmersiveHud — fullscreen must carry the toggleable info overlay (title/description/how-to)");

// ── 5. Language + aesthetic laws ────────────────────────────────────────────
const drugs = joined.match(/\bk-?hole\b|\bdmt\b|\bpsychedelic\b|psychonaut|ketamine|\blsd\b|\bacid\b|psilocybin|\bmdma\b|ayahuasca|\bdxm\b|\btrippy\b|\bcome-?up\b|mescaline|peyote|salvia|entheogen|\bdose\b|\bdosage\b|titrat|microdose/i);
if (drugs) fails.push(`banned language: "${drugs[0]}" — altered-states framing only`);
if (/font-serif/.test(joined)) fails.push("font-serif — Resonance ships no serif font");
for (const [f, c] of code) {
  if (/filmGrain|film-grain|grainAmount|grainIntensity/i.test(c)) fails.push(`film grain in ${path.basename(f)} — banned product-wide`);
  if (/\bgrain\b/i.test(c) && !/filmGrain/i.test(c)) warns.push(`"grain" mentioned in ${path.basename(f)} — confirm it's granular synthesis, not a grain overlay`);
}
if (/text-white\/\d/.test(joined)) warns.push("raw text-white/NN in chrome — run tools/normalize.sh");
if (/\b(text|bg|border)-(amber|emerald|rose|sky|teal|cyan|lime|orange|yellow|pink|fuchsia|indigo|green|blue)-\d/.test(joined))
  warns.push("off-brand hue utilities — run tools/normalize.sh (violet ramp only)");

// ── 6. Layout: viz-first ────────────────────────────────────────────────────
const page = pages[0]?.[1] ?? "";
if (page && !/(h-screen|h-dvh|min-h-screen|min-h-dvh|h-\[100dvh\]|inset-0|fixed inset)/.test(page))
  warns.push("no viewport-filling stage detected — the viz must BE the page, not a small box under content");

// ── 7. API guard ────────────────────────────────────────────────────────────
for (const [f, c] of all.filter(([f]) => /api\/.*route\.tsx?$/.test(f))) {
  if (!/guard\(/.test(c)) fails.push(`${path.basename(path.dirname(f))}/route.ts has no guard() — exposes FAL budget`);
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`QA ${dir}`);
for (const w of warns) console.log(`  WARN ${w}`);
for (const f of fails) console.log(`  FAIL ${f}`);
if (fails.length === 0) {
  console.log(`  PASS (${warns.length} warnings — resolve by eye before shipping)`);
  process.exit(0);
}
console.log(`  ${fails.length} failure(s) — fix them or do not ship. Broken protos are unacceptable in all cases.`);
process.exit(1);
