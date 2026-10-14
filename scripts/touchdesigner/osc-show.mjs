#!/usr/bin/env node
// osc-show.mjs — OSC tooling for the TouchDesigner show (rehearsal without the kiosk).
//
//   synth   a realistic Resonance OSC stream built from REAL journey data: each
//           journey's deep-analysis energy curve, sections (onset rate,
//           brightness, harmony), phase bounds, tempo and its per-phase stills
//           palettes, mapped through the relay's own frame→OSC map
//           (src/lib/vj-bridge/osc-map.mjs), so addresses / types / pulses /
//           keyframes are byte-for-byte what the relay sends.
//             --journeys id,id,...   (default: Snowflake-adjacent mix + one uncatalogued id)
//             --seconds-each 22      --gap 4  (title hold + silence between journeys)
//             --out log.jsonl        write the log (rehearsal_log format) instead of / as well as
//             --send                 stream it live to --host/--port (default 127.0.0.1:7000)
//             --loop                 keep streaming
//   record  listen on udp --port (default 7000) and write every message as JSONL
//             --seconds N --out file
//   replay  send a JSONL log to --host/--port in real time (--loop)
//
// Log format (one message per line, the same file TD's rehearsal mode plays):
//   {"t": 1.234, "a": "/resonance/audio/bass", "v": [0.31]}

import dgram from "node:dgram";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMapState, frameToOsc, encodePackets } from "../../src/lib/vj-bridge/osc-map.mjs";
import { decodePacket, encodeMessage } from "../../src/lib/vj-bridge/osc.mjs";
import { extractConst } from "./build-looks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
const HOST = opt("--host", "127.0.0.1");
const PORT = Number(opt("--port", 7000));
const HZ = 20;

// deterministic PRNG (a log is reproducible)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function loadData() {
  const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
  return {
    profiles: extractConst(read("src/lib/journeys/particle-profiles.generated.ts"), "PARTICLE_PROFILES"),
    palettes: extractConst(read("src/lib/particles/journey-palettes.generated.ts"), "JOURNEY_IMAGE_PALETTES"),
  };
}

const lerpCurve = (curve, t) => {
  if (!curve?.length) return 0.5;
  if (t <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (t <= curve[i][0]) {
      const [t0, v0] = curve[i - 1]; const [t1, v1] = curve[i];
      return v0 + (v1 - v0) * ((t - t0) / Math.max(1e-6, t1 - t0));
    }
  }
  return curve[curve.length - 1][1];
};
const PHASES = ["threshold", "expansion", "transcendence", "illumination", "return", "integration"];

/** Frames (the page's VjFrame schema) for one segment of one journey, played at 1x. */
function* journeyFrames({ id, prof, pal, start, seconds, rand, seq0, t0, label }) {
  const dur = prof?.duration || 200;
  const bpm = prof?.tempo?.bpm || 72;
  const bounds = prof?.phaseBounds || [dur / 6, dur / 3, dur / 2, (2 * dur) / 3, (5 * dur) / 6];
  const theme = prof?.palette ? [prof.palette.primary, prof.palette.secondary, prof.palette.accent, prof.palette.glow] : ["#101820", "#2a3b55", "#c9a46a", "#f2e2c0"];
  let sb = 0, sm = 0, st = 0, sl = 0; // shader-drive smoothing (0.06 @ 60 fps ≈ 0.27 s)
  let lastPi = -1;
  const k = 1 - Math.exp(-(1 / HZ) / 0.27);
  for (let i = 0; i < seconds * HZ; i++) {
    const tau = start + i / HZ; // track time
    const sec = (prof?.sections || []).find((s) => tau >= s.start && tau < s.end) || { onsetRate: 2.5, brightnessHz: 500, minor: 0.2, diminished: 0, intensity: 0.5 };
    const e = Math.min(1, Math.max(0, lerpCurve(prof?.curve, tau)));
    const wob = (f, p) => 0.5 + 0.5 * Math.sin(tau * f + p);
    const bright = Math.min(1, Math.max(0, (sec.brightnessHz - 300) / 700));
    const rb = Math.min(1, e * (0.45 + 0.25 * wob(1.3, 0)) + 0.06 * (rand() - 0.5));
    const rm = Math.min(1, e * (0.38 + 0.2 * wob(2.1, 1)) + 0.05 * (rand() - 0.5));
    const rt = Math.min(1, e * (0.12 + 0.25 * bright) * (0.8 + 0.4 * wob(3.7, 2)) + 0.04 * (rand() - 0.5));
    const rl = (rb + rm + rt) / 3;
    sb += (Math.max(0, rb) - sb) * k; sm += (Math.max(0, rm) - sm) * k; st += (Math.max(0, rt) - st) * k; sl += (Math.max(0, rl) - sl) * k;
    let pi = bounds.findIndex((b) => tau < b); if (pi < 0) pi = 5;
    const p0 = pi === 0 ? 0 : bounds[pi - 1]; const p1 = pi < bounds.length ? bounds[pi] : dur;
    const phPal = pal?.phases?.[pi]?.colors || pal?.colors || [];
    const ev = [];
    if (i === 0) ev.push(["journey", id, label]);
    if (pi !== lastPi) { ev.push(["phase", PHASES[pi], pi]); lastPi = pi; }
    if (rand() < (sec.onsetRate / HZ) * (0.4 + 0.8 * e)) ev.push(["onset", Math.min(1, 0.3 + 0.7 * e * rand() + 0.2 * rand()), rand(), tau * 1000]);
    const beat = (tau * bpm) / 60;
    if (Math.floor(beat) !== Math.floor(beat - bpm / 60 / HZ)) ev.push(["beat", Math.floor(beat)]);
    if (prof?.sections?.some((s) => Math.abs(s.start - tau) < 0.5 / HZ && s.start > 0)) ev.push(["phrase", "section", "form", 0.8, "section"]);
    yield {
      t: t0 + i / HZ,
      frame: {
        v: 1, seq: seq0 + i, ms: Math.round((t0 + i / HZ) * 1000),
        au: { b: sb, m: sm, t: st, l: sl, rb, rm, rt, rl, sil: 0 },
        ck: { bpm, beat, bph: beat % 1, bar: Math.floor(beat / 4), barph: (beat / 4) % 1 },
        pr: { play: 1, hold: 0, time: tau, dur, vol: 0.8, label: "" },
        jn: { id, name: label, phase: PHASES[pi], pi, pn: 6, pp: (tau - p0) / Math.max(1, p1 - p0), prog: tau / dur, theme, pal: phPal, img: "motif", emb: 0 },
        sh: { mode: "cosmos", dual: "", op: 1 },
        pt: { soul: "drift", on: 1, sw: [1 + 0.15 * e, 1, 1], cur: [0.5, Math.min(1, (sec.minor || 0) + 2 * (sec.diminished || 0)), 0.5], br: [0.6, Math.sin((tau * 2 * Math.PI) / 8), 0.2] },
        mo: { on: 0, prog: 0 },
        ev,
      },
    };
  }
}

/** Silence / title hold between journeys (the kiosk's breath). */
function* gapFrames({ t0, seconds, seq0, label }) {
  for (let i = 0; i < seconds * HZ; i++) {
    yield { t: t0 + i / HZ, frame: { v: 1, seq: seq0 + i, ms: Math.round((t0 + i / HZ) * 1000), au: { b: 0, m: 0, t: 0, l: 0, rb: 0, rm: 0, rt: 0, rl: 0, sil: 1 }, ck: { bpm: 0, beat: 0, bph: 0, bar: 0, barph: 0 }, pr: { play: 0, hold: 1, time: 0, dur: 0, vol: 0.8, label }, jn: {}, sh: {}, pt: { on: 0 }, mo: {}, ev: [] } };
  }
}

export function synthLog({ journeys, secondsEach = 22, gap = 4, seed = 7 } = {}) {
  const { profiles, palettes } = loadData();
  const rand = rng(seed);
  const ids = journeys?.length ? journeys : ["first-snow", "c80a89bc-2c88-4bde-bec8-4be6916acb62", "6ee9f014-8203-437c-b05c-9d8bd0de9d3e", "uncatalogued-test"];
  const st = createMapState();
  const rows = [];
  let t = 0, seq = 1;
  const emit = (it) => {
    for (const { t: ft, frame } of it) {
      for (const m of frameToOsc(frame, st, ft * 1000, { keyframeMs: 2000 })) rows.push({ t: Math.round(ft * 1000) / 1000, a: m.address, v: m.args, y: m.types });
      seq++;
    }
  };
  for (const id of ids) {
    const prof = profiles[id];
    // an uncatalogued journey borrows a real palette (tests the live-palette fallback)
    const pal = palettes[id] || palettes["9eb3df10-7835-4107-b995-4c9ad6f2edf1"];
    const label = prof?.name || "Uncatalogued Test";
    const dur = prof?.duration || 200;
    // start a few seconds before a phase boundary near the climax: a phase change + peak energy in the window
    const target = prof?.climaxTime ?? dur * 0.6;
    const b = (prof?.phaseBounds || []).reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best), target);
    const start = Math.max(0, Math.min(dur - secondsEach, b - secondsEach * 0.4));
    emit(gapFrames({ t0: t, seconds: gap, seq0: seq, label: `${label}` }));
    t += gap;
    emit(journeyFrames({ id, prof, pal, start, seconds: secondsEach, rand, seq0: seq, t0: t, label }));
    t += secondsEach;
  }
  return rows;
}

const toJsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

function sendRows(rows, { loop = false } = {}) {
  const udp = dgram.createSocket("udp4");
  const types = (r) => r.y || r.v.map((x) => (typeof x === "string" ? "s" : Number.isInteger(x) && !String(r.a).match(/audio|palette|clock\/beat$|phase$|progress|bpm|tension|breath|swell|harmony|pulse|opacity|volume|time|duration/) ? "i" : "f")).join("");
  let i = 0, t0 = Date.now();
  const len = rows.length ? rows[rows.length - 1].t + 0.5 : 0;
  const tick = () => {
    const el = (Date.now() - t0) / 1000;
    const batch = [];
    while (i < rows.length && rows[i].t <= el) batch.push(rows[i++]);
    if (batch.length) {
      const msgs = batch.map((r) => ({ address: r.a, types: types(r), args: r.v }));
      for (const p of encodePackets(msgs, { bundle: true, maxBytes: 1400 })) udp.send(p, PORT, HOST);
    }
    if (i >= rows.length) {
      if (!loop) { clearInterval(timer); setTimeout(() => udp.close(), 200); console.log(`[osc-show] sent ${rows.length} messages`); return; }
      i = 0; t0 = Date.now();
    }
    if (el > len + 1 && !loop) clearInterval(timer);
  };
  const timer = setInterval(tick, 1000 / 60);
  console.log(`[osc-show] → udp ${HOST}:${PORT}, ${rows.length} messages over ${len.toFixed(1)} s${loop ? " (loop)" : ""}`);
}

function record({ seconds, out }) {
  const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const rows = [];
  let t0 = null;
  sock.on("message", (buf) => {
    const now = Date.now();
    if (t0 === null) t0 = now;
    try {
      for (const m of decodePacket(new Uint8Array(buf))) rows.push({ t: (now - t0) / 1000, a: m.address, v: m.args, y: m.types });
    } catch { /* not OSC */ }
  });
  sock.bind(PORT, HOST === "0.0.0.0" ? undefined : HOST, () => console.log(`[osc-show] recording udp ${HOST}:${PORT} for ${seconds} s → ${out}`));
  setTimeout(() => { sock.close(); writeFileSync(out, toJsonl(rows)); console.log(`[osc-show] ${rows.length} messages → ${out}`); }, seconds * 1000);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (cmd === "synth") {
    const rows = synthLog({ journeys: opt("--journeys", "") ? opt("--journeys").split(",") : null, secondsEach: Number(opt("--seconds-each", 22)), gap: Number(opt("--gap", 4)), seed: Number(opt("--seed", 7)) });
    const out = opt("--out", null);
    if (out) { writeFileSync(out, toJsonl(rows)); console.log(`[osc-show] ${rows.length} messages, ${rows[rows.length - 1].t.toFixed(1)} s → ${out}`); }
    if (flag("--send") || !out) sendRows(rows, { loop: flag("--loop") });
  } else if (cmd === "record") {
    record({ seconds: Number(opt("--seconds", 60)), out: opt("--out", "rehearsal.oscl.jsonl") });
  } else if (cmd === "replay") {
    const file = args[1];
    const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    sendRows(rows, { loop: flag("--loop") });
  } else {
    console.log("usage: node scripts/touchdesigner/osc-show.mjs synth|record|replay [options]   (see the header)");
  }
}
