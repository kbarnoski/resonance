"use client";

import { useRef, useState, useCallback, useEffect } from "react";

// ════════════════════════════════════════════════════════════════════════════
// Wiki Bells (1024)
//
// THE ONE QUESTION: "What does the whole world thinking out loud sound like —
// every Wikipedia edit, anywhere on Earth, this very second, struck as a bell?"
//
// A live, non-pointer sonification of the global Wikimedia EventStreams feed.
// Each recent change anywhere on Earth strikes an inharmonic bell. The visitor
// does not aim or point — the world's collective editing IS the instrument; you
// only shape the listening (which language wikis, bots on/off, density).
//
// A Resonance-flavored, harmonically richer descendant of Hatnote's
// "Listen to Wikipedia" (Stephen LaPorte & Mahmoud Hashemi, 2013).
//
// FOUR SUBSYSTEMS:
//   1. SSE stream ingestion + filter  — EventSource on the keyless, CORS-open
//      Wikimedia feed, parsed/filtered/throttled into significant events.
//   2. Inharmonic bell / tongue-drum synth — additive detuned partials at
//      metallic ratios with exponential decay; voice-capped.
//   3. Drifting modal-scale state — a pentatonic/Dorian lattice that re-seeds
//      every ~30s so minute 5 never sounds like minute 1.
//   4. Canvas2D bloom viz — one expanding ring/glyph per event, sized by edit
//      magnitude, colored by edit type.
//
// MANDATORY synthetic fallback: if EventSource never connects / errors, a
// built-in Poisson-ish generator emits plausible events so the piece sounds and
// looks identical with ZERO network.
// ════════════════════════════════════════════════════════════════════════════

// ── The shape we care about from a recentchange event ──────────────────────────
interface WikiEvent {
  type: "edit" | "new" | "log" | "categorize" | string;
  wiki: string; // e.g. "enwiki"
  title: string;
  user: string;
  bot: boolean;
  delta: number; // signed byte change
  domain: string; // meta.domain / server_name
  lang: string; // 2-letter-ish language code extracted from wiki
  isNewUser: boolean; // log event creating an account
  ts: number; // arrival time (ms)
}

// ════════════════════════════════════════════════════════════════════════════
// SUBSYSTEM 3 — DRIFTING MODAL SCALE
//
// A bell is snapped to a slowly drifting modal lattice so the texture evolves.
// We keep a small set of pitch-classes (semitone offsets) over a root that
// re-seeds every ~30s, walking through a family of warm pentatonic / Dorian
// shapes. minute 5 ≠ minute 1.
// ════════════════════════════════════════════════════════════════════════════

// Candidate modal scale-degree sets (semitone offsets within an octave).
const SCALE_FAMILIES: number[][] = [
  [0, 3, 5, 7, 10], // minor pentatonic
  [0, 2, 5, 7, 9], // major-ish pentatonic
  [0, 2, 3, 5, 7, 9, 10], // Dorian
  [0, 2, 4, 7, 9], // bright pentatonic
  [0, 3, 5, 7, 9], // suspended/quartal
];

// Roots wander through a gentle set of tonics (semitones above a base A).
const ROOT_WALK = [0, 5, -2, 3, -4, 7, 2];

interface ScaleState {
  baseMidi: number; // current tonic as MIDI note
  degrees: number[]; // active scale-degree offsets
  familyIdx: number;
  rootIdx: number;
  nextDriftAt: number; // ms timestamp for next drift
}

function makeScaleState(now: number): ScaleState {
  return {
    baseMidi: 57, // A3
    degrees: SCALE_FAMILIES[0],
    familyIdx: 0,
    rootIdx: 0,
    nextDriftAt: now + 30_000,
  };
}

function driftScale(s: ScaleState, now: number): ScaleState {
  if (now < s.nextDriftAt) return s;
  const familyIdx = (s.familyIdx + 1) % SCALE_FAMILIES.length;
  const rootIdx = (s.rootIdx + 1) % ROOT_WALK.length;
  return {
    baseMidi: 57 + ROOT_WALK[rootIdx],
    degrees: SCALE_FAMILIES[familyIdx],
    familyIdx,
    rootIdx,
    nextDriftAt: now + 30_000,
  };
}

// Snap a continuous "pitch wish" (0..1, where 0 = low/weighty, 1 = high/tinkly)
// onto the current scale across ~3 octaves, returning a MIDI note.
function snapToScale(s: ScaleState, wish: number): number {
  const octaves = 3;
  const slots = s.degrees.length * octaves;
  const idx = Math.min(slots - 1, Math.max(0, Math.round(wish * (slots - 1))));
  const oct = Math.floor(idx / s.degrees.length);
  const deg = s.degrees[idx % s.degrees.length];
  return s.baseMidi + oct * 12 + deg;
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ════════════════════════════════════════════════════════════════════════════
// SUBSYSTEM 2 — INHARMONIC BELL / TONGUE-DRUM SYNTH
//
// Each event strikes a bell built from a few detuned sine partials at metallic
// (inharmonic) ratios with exponential decay. Timbre varies by event type:
//   edit       → struck bell (bright metallic ratios)
//   new article→ warm swelling chime/pad (slow attack, softer ratios, violet)
//   new user   → rising sparkle (quick upward glide, high)
//   bot edit   → woodier / quieter (fewer, closer partials, low gain) or muted
// ════════════════════════════════════════════════════════════════════════════

// Metallic partial ratios (roughly bell-like, inharmonic).
const BELL_PARTIALS = [1.0, 2.01, 2.71, 3.93, 5.18];
const BELL_GAINS = [1.0, 0.55, 0.42, 0.28, 0.18];
// Woodier (bot): fewer, closer partials.
const WOOD_PARTIALS = [1.0, 1.51, 2.0];
const WOOD_GAINS = [1.0, 0.4, 0.22];

interface VoiceHandle {
  endsAt: number; // when this voice fully decays (ms)
  nodes: AudioNode[];
}

interface SynthCtx {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  voices: VoiceHandle[];
  maxVoices: number;
}

function buildSynth(ctx: AudioContext): SynthCtx {
  const master = ctx.createGain();
  master.gain.value = 0.32; // modest master — a busy day must not clip
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  // gentle reverb-ish tail via a short feedback delay
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.21;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  master.connect(comp);
  comp.connect(ctx.destination);
  master.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(comp);
  return { ctx, master, comp, voices: [], maxVoices: 12 };
}

// Strike one bell. Returns the chosen pitch (for sharing with the viz) or null
// if the voice was dropped (voice cap reached).
function strikeBell(
  s: SynthCtx,
  scale: ScaleState,
  ev: WikiEvent,
  pan: number,
): number {
  const now = s.ctx.currentTime;
  const nowMs = performance.now();

  // Reap finished voices.
  s.voices = s.voices.filter((v) => v.endsAt > nowMs);
  if (s.voices.length >= s.maxVoices) {
    // steal the oldest voice rather than refuse — keeps the flow alive
    const oldest = s.voices.shift();
    oldest?.nodes.forEach((n) => {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* already stopped */
      }
    });
  }

  // Map byte-delta magnitude → pitch wish. Bigger change = lower, weightier;
  // small copyedits = high tinkle. Log-scale the magnitude.
  const mag = Math.min(1, Math.log10(1 + Math.abs(ev.delta)) / 4); // 0..1
  let wish = 1 - mag; // big delta → low wish
  let baseMidi = snapToScale(scale, wish);

  // Voice / timbre selection by event type.
  const isNew = ev.type === "new";
  const isNewUser = ev.isNewUser;
  const isBot = ev.bot;

  let partials = BELL_PARTIALS;
  let gains = BELL_GAINS;
  let attack = 0.002;
  let decay = 2.4 + mag * 2.5; // weightier bells ring longer
  let peak = 0.5 + mag * 0.35;
  let glide = 0;

  if (isBot) {
    partials = WOOD_PARTIALS;
    gains = WOOD_GAINS;
    decay = 0.9 + mag * 0.8;
    peak *= 0.45; // quieter, woodier
  }
  if (isNew) {
    // warm swelling chime — slow attack, softer ratios, lower & longer
    attack = 0.08;
    decay = 3.6;
    baseMidi -= 5;
    peak *= 0.85;
  }
  if (isNewUser) {
    // rising sparkle — high and short with an upward glide
    wish = 0.95;
    baseMidi = snapToScale(scale, wish) + 12;
    attack = 0.002;
    decay = 1.2;
    glide = 7; // semitones up
    partials = BELL_PARTIALS;
    gains = BELL_GAINS;
  }

  const f0 = midiToFreq(baseMidi);
  const env = s.ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(Math.max(0.02, peak), now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

  // stereo pan by wiki language
  const panner = s.ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));

  env.connect(panner);
  panner.connect(s.master);

  const nodes: AudioNode[] = [env, panner];
  for (let i = 0; i < partials.length; i++) {
    const osc = s.ctx.createOscillator();
    osc.type = isNew ? "triangle" : "sine";
    const pf = f0 * partials[i];
    osc.frequency.setValueAtTime(pf, now);
    if (glide) {
      osc.frequency.exponentialRampToValueAtTime(
        pf * Math.pow(2, glide / 12),
        now + attack + decay * 0.5,
      );
    }
    const pg = s.ctx.createGain();
    pg.gain.value = gains[i];
    osc.connect(pg);
    pg.connect(env);
    osc.start(now);
    osc.stop(now + attack + decay + 0.05);
    nodes.push(osc, pg);
  }

  s.voices.push({ endsAt: nowMs + (attack + decay + 0.1) * 1000, nodes });
  return baseMidi;
}

// ════════════════════════════════════════════════════════════════════════════
// SUBSYSTEM 1 — STREAM INGESTION + FILTER + THROTTLE
//
// EventSource on the keyless, CORS-open Wikimedia feed. We parse each message,
// derive language, classify type, and rate-limit: at most one *audible* strike
// per ~140ms, choosing the most "significant" pending event when flooded.
// ════════════════════════════════════════════════════════════════════════════

const STREAM_URL = "https://stream.wikimedia.org/v2/stream/recentchange";

interface RawChange {
  type?: string;
  wiki?: string;
  title?: string;
  user?: string;
  bot?: boolean;
  length?: { old?: number; new?: number };
  log_type?: string;
  log_action?: string;
  meta?: { domain?: string };
  server_name?: string;
}

function langFromWiki(wiki: string): string {
  // enwiki → en, commonswiki → commons, wikidatawiki → wikidata, etc.
  const m = wiki.match(/^([a-z-]+)wiki/);
  return m ? m[1] : wiki;
}

function parseChange(raw: RawChange, now: number): WikiEvent | null {
  if (!raw || !raw.type) return null;
  const wiki = raw.wiki ?? "";
  const oldL = raw.length?.old ?? 0;
  const newL = raw.length?.new ?? oldL;
  const delta = newL - oldL;
  const isNewUser =
    raw.type === "log" &&
    (raw.log_type === "newusers" || raw.log_action === "create");
  return {
    type: raw.type,
    wiki,
    title: raw.title ?? "",
    user: raw.user ?? "",
    bot: !!raw.bot,
    delta,
    domain: raw.meta?.domain ?? raw.server_name ?? wiki,
    lang: langFromWiki(wiki),
    isNewUser,
    ts: now,
  };
}

// "Significance" score for flood-time selection: prefer new articles & new
// users, then large edits, then anything human over bots.
function significance(ev: WikiEvent): number {
  let s = Math.log10(1 + Math.abs(ev.delta));
  if (ev.type === "new") s += 6;
  if (ev.isNewUser) s += 8;
  if (ev.bot) s -= 3;
  return s;
}

// Pan a language to a stereo position deterministically (subtle).
function panForLang(lang: string): number {
  let h = 0;
  for (let i = 0; i < lang.length; i++) h = (h * 31 + lang.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000) * 1.4 - 0.7; // -0.7..0.7
}

// ── Synthetic generator (mandatory zero-network fallback) ──────────────────────
const SYNTH_LANGS = ["en", "de", "fr", "es", "ja", "ru", "it", "zh", "pt", "nl"];
const SYNTH_TITLES = [
  "Quantum entanglement",
  "List of lighthouses",
  "Migration of birds",
  "History of tea",
  "Aurora borealis",
  "Coral reef",
  "Typewriter",
  "Glacier",
  "Murmuration",
  "Bioluminescence",
];

function makeSyntheticEvent(now: number): WikiEvent {
  const r = Math.random();
  const lang = SYNTH_LANGS[(Math.random() * SYNTH_LANGS.length) | 0];
  const bot = Math.random() < 0.45;
  let type = "edit";
  let isNewUser = false;
  if (r < 0.06) {
    type = "log";
    isNewUser = true;
  } else if (r < 0.18) {
    type = "new";
  }
  // byte-delta: usually small copyedits, sometimes big additions/removals
  const big = Math.random() < 0.25;
  const sign = Math.random() < 0.55 ? 1 : -1;
  const mag = big
    ? 200 + Math.random() * 9000
    : Math.random() * 220;
  const delta = type === "new" ? Math.round(300 + Math.random() * 8000) : Math.round(sign * mag);
  return {
    type,
    wiki: `${lang}wiki`,
    title: SYNTH_TITLES[(Math.random() * SYNTH_TITLES.length) | 0],
    user: isNewUser ? "NewEditor" + ((Math.random() * 9999) | 0) : "Editor",
    bot: type === "edit" ? bot : false,
    delta,
    domain: `${lang}.wikipedia.org`,
    lang,
    isNewUser,
    ts: now,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SUBSYSTEM 4 — CANVAS2D BLOOM VISUALIZATION
//
// One expanding ring per audible event. Radius/size by edit magnitude, hue by
// type: warm gold/ivory bells, cool violet for new articles, bright sparkle for
// new users. Deep near-black backdrop, soft additive glow. A quiet observatory
// of human attention.
// ════════════════════════════════════════════════════════════════════════════

interface Bloom {
  x: number;
  y: number;
  r: number; // current radius
  maxR: number;
  born: number;
  life: number; // ms
  hue: number; // 0..360
  sat: number;
  light: number;
  label: string;
  isNew: boolean;
  isUser: boolean;
}

function colorForEvent(ev: WikiEvent): { hue: number; sat: number; light: number } {
  if (ev.isNewUser) return { hue: 150, sat: 70, light: 72 }; // mint sparkle
  if (ev.type === "new") return { hue: 268, sat: 62, light: 66 }; // cool violet
  // edits: warm gold → ivory, slightly bluer when negative (removal)
  if (ev.delta < 0) return { hue: 44, sat: 24, light: 80 }; // pale ivory removal
  return { hue: 42, sat: 70, light: 64 }; // warm gold addition
}

function makeBloom(ev: WikiEvent, w: number, h: number, midi: number): Bloom {
  const mag = Math.min(1, Math.log10(1 + Math.abs(ev.delta)) / 4);
  const c = colorForEvent(ev);
  // place by pan-x (language) and pitch-y (so weighty low bells sit lower)
  const px = (panForLang(ev.lang) / 1.4 + 0.5) * w;
  const py = h - ((midi - 45) / 50) * h; // higher pitch → higher on screen
  const jitter = 26;
  return {
    x: Math.max(20, Math.min(w - 20, px + (Math.random() - 0.5) * jitter * 2)),
    y: Math.max(20, Math.min(h - 20, py + (Math.random() - 0.5) * jitter)),
    r: 2,
    maxR: 16 + mag * 90 + (ev.type === "new" ? 30 : 0),
    born: performance.now(),
    life: ev.type === "new" ? 3600 : ev.isNewUser ? 1600 : 1800 + mag * 1400,
    hue: c.hue,
    sat: c.sat,
    light: c.light,
    label: ev.title,
    isNew: ev.type === "new",
    isUser: ev.isNewUser,
  };
}

function drawScene(
  cx: CanvasRenderingContext2D,
  w: number,
  h: number,
  blooms: Bloom[],
  now: number,
) {
  // deep near-black wash with a faint trail
  cx.globalCompositeOperation = "source-over";
  cx.fillStyle = "rgba(6, 6, 10, 0.30)";
  cx.fillRect(0, 0, w, h);

  cx.globalCompositeOperation = "lighter";
  for (const b of blooms) {
    const age = (now - b.born) / b.life;
    if (age >= 1) continue;
    const ease = 1 - Math.pow(1 - age, 2.2); // expand fast, settle
    b.r = 2 + (b.maxR - 2) * ease;
    const alpha = (1 - age) * 0.9;

    // soft radial glow
    const g = cx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, `hsla(${b.hue}, ${b.sat}%, ${b.light}%, ${alpha * 0.5})`);
    g.addColorStop(0.6, `hsla(${b.hue}, ${b.sat}%, ${b.light}%, ${alpha * 0.18})`);
    g.addColorStop(1, `hsla(${b.hue}, ${b.sat}%, ${b.light}%, 0)`);
    cx.fillStyle = g;
    cx.beginPath();
    cx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    cx.fill();

    // crisp ring
    cx.strokeStyle = `hsla(${b.hue}, ${b.sat}%, ${Math.min(92, b.light + 14)}%, ${alpha * 0.7})`;
    cx.lineWidth = b.isNew ? 2 : 1;
    cx.beginPath();
    cx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    cx.stroke();

    // bright core dot at birth
    if (age < 0.18) {
      cx.fillStyle = `hsla(${b.hue}, ${b.sat}%, 92%, ${(1 - age / 0.18) * 0.9})`;
      cx.beginPath();
      cx.arc(b.x, b.y, 2.2, 0, Math.PI * 2);
      cx.fill();
    }
  }

  // label the most prominent recent new-article / new-user near it
  cx.globalCompositeOperation = "source-over";
  for (const b of blooms) {
    if (!(b.isNew || b.isUser)) continue;
    const age = (now - b.born) / b.life;
    if (age >= 1) continue;
    const alpha = (1 - age) * 0.85;
    cx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    cx.fillStyle = `hsla(${b.hue}, ${Math.max(30, b.sat - 20)}%, 88%, ${alpha})`;
    const txt = (b.isUser ? "+ new editor" : b.label).slice(0, 36);
    cx.fillText(txt, b.x + b.r * 0.5 + 6, b.y - 4);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ════════════════════════════════════════════════════════════════════════════

type Source = "connecting" | "live" | "simulated";

export default function WikiBellsPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<Source>("connecting");
  const [muteBots, setMuteBots] = useState(false);
  const [onlyLang, setOnlyLang] = useState<string>("all"); // "all" | "en" | ...
  const [showNotes, setShowNotes] = useState(false);
  const [stats, setStats] = useState({ rate: 0, total: 0, last: "" });

  // refs that the render/event loops read without re-rendering
  const synthRef = useRef<SynthCtx | null>(null);
  const scaleRef = useRef<ScaleState>(makeScaleState(performance.now()));
  const bloomsRef = useRef<Bloom[]>([]);
  const pendingRef = useRef<WikiEvent[]>([]); // events awaiting an audible slot
  const esRef = useRef<EventSource | null>(null);
  const rafRef = useRef<number>(0);
  const synthTimerRef = useRef<number | null>(null);
  const lastStrikeRef = useRef<number>(0);
  const audibleCountRef = useRef<number>(0);
  const rateWindowRef = useRef<number[]>([]);

  // keep the live filters readable from the non-React loops
  const muteBotsRef = useRef(muteBots);
  const onlyLangRef = useRef(onlyLang);
  const runningRef = useRef(running);
  useEffect(() => {
    muteBotsRef.current = muteBots;
  }, [muteBots]);
  useEffect(() => {
    onlyLangRef.current = onlyLang;
  }, [onlyLang]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // Accept a parsed event: apply filters, push to pending queue.
  const ingest = useCallback((ev: WikiEvent) => {
    if (onlyLangRef.current !== "all" && ev.lang !== onlyLangRef.current) return;
    if (muteBotsRef.current && ev.bot) return;
    const q = pendingRef.current;
    q.push(ev);
    if (q.length > 60) q.splice(0, q.length - 60); // bound memory on floods
  }, []);

  // ── The audible/visual heartbeat: every ~140ms emit the most significant
  //    pending event as a bell + bloom; rate-limited so floods don't roar. ──
  useEffect(() => {
    if (!running) return;
    let alive = true;

    const tick = () => {
      if (!alive) return;
      const now = performance.now();
      scaleRef.current = driftScale(scaleRef.current, now);

      const q = pendingRef.current;
      if (q.length && now - lastStrikeRef.current >= 135) {
        // pick the most significant pending event, drop the rest of the burst
        let bestIdx = 0;
        let bestScore = -Infinity;
        for (let i = 0; i < q.length; i++) {
          const sc = significance(q[i]);
          if (sc > bestScore) {
            bestScore = sc;
            bestIdx = i;
          }
        }
        const ev = q[bestIdx];
        // drop everything older than the chosen one to stay current
        pendingRef.current = q.slice(bestIdx + 1);
        lastStrikeRef.current = now;

        const synth = synthRef.current;
        const canvas = canvasRef.current;
        if (synth) {
          const midi = strikeBell(synth, scaleRef.current, ev, panForLang(ev.lang));
          if (canvas) {
            const b = makeBloom(ev, canvas.width, canvas.height, midi);
            bloomsRef.current.push(b);
            if (bloomsRef.current.length > 140) bloomsRef.current.shift();
          }
          audibleCountRef.current++;
          rateWindowRef.current.push(now);
        }
      }

      // prune rate window to last second
      const cutoff = now - 1000;
      while (rateWindowRef.current.length && rateWindowRef.current[0] < cutoff) {
        rateWindowRef.current.shift();
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // stats updater (cheap, off the RAF path)
    const statsTimer = window.setInterval(() => {
      const last = bloomsRef.current[bloomsRef.current.length - 1];
      setStats({
        rate: rateWindowRef.current.length,
        total: audibleCountRef.current,
        last: last ? last.label : "",
      });
    }, 500);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(statsTimer);
    };
  }, [running]);

  // ── Pure render loop (always on once running) ──
  useEffect(() => {
    if (!running) return;
    let alive = true;
    let raf = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.getContext("2d");
    if (!cx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      if (!alive) return;
      const now = performance.now();
      // prune dead blooms
      bloomsRef.current = bloomsRef.current.filter(
        (b) => now - b.born < b.life,
      );
      drawScene(cx, canvas.width, canvas.height, bloomsRef.current, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [running]);

  // ── Connect the stream (with synthetic fallback) ──
  const connectStream = useCallback(() => {
    setSource("connecting");
    let settledLive = false;

    const startSynthetic = () => {
      setSource("simulated");
      // Poisson-ish arrivals: schedule next event after an exponential gap.
      const schedule = () => {
        const meanGap = 90; // ms — a lively but not deafening world
        const gap = -Math.log(1 - Math.random()) * meanGap;
        synthTimerRef.current = window.setTimeout(() => {
          if (!runningRef.current) {
            schedule();
            return;
          }
          // sometimes a small burst
          const burst = Math.random() < 0.12 ? 2 + ((Math.random() * 3) | 0) : 1;
          for (let i = 0; i < burst; i++) {
            ingest(makeSyntheticEvent(performance.now()));
          }
          schedule();
        }, gap);
      };
      schedule();
    };

    // Try the live feed first.
    if (typeof window !== "undefined" && "EventSource" in window) {
      try {
        const es = new EventSource(STREAM_URL);
        esRef.current = es;

        // If we don't get a message within 6s, fall back to synthetic.
        const fallbackTimer = window.setTimeout(() => {
          if (!settledLive) {
            try {
              es.close();
            } catch {
              /* noop */
            }
            esRef.current = null;
            startSynthetic();
          }
        }, 6000);

        es.onopen = () => {
          // opened, but wait for an actual message to call it live
        };
        es.onmessage = (msg) => {
          if (!settledLive) {
            settledLive = true;
            window.clearTimeout(fallbackTimer);
            setSource("live");
          }
          try {
            const raw = JSON.parse(msg.data) as RawChange;
            // recentchange feed carries many wikis & categorize spam; keep the
            // musically interesting kinds.
            if (
              raw.type === "edit" ||
              raw.type === "new" ||
              (raw.type === "log" &&
                (raw.log_type === "newusers" || raw.log_action === "create"))
            ) {
              const parsed = parseChange(raw, performance.now());
              if (parsed) ingest(parsed);
            }
          } catch {
            /* malformed line — ignore */
          }
        };
        es.onerror = () => {
          if (!settledLive) {
            window.clearTimeout(fallbackTimer);
            try {
              es.close();
            } catch {
              /* noop */
            }
            esRef.current = null;
            startSynthetic();
          }
          // if already live, EventSource auto-reconnects; leave it.
        };
      } catch {
        startSynthetic();
      }
    } else {
      startSynthetic();
    }
  }, [ingest]);

  // ── Start: resume audio on the user gesture, build synth, connect. ──
  const handleStart = useCallback(async () => {
    if (runningRef.current) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    try {
      await ctx.resume();
    } catch {
      /* will resume on gesture anyway */
    }
    synthRef.current = buildSynth(ctx);
    scaleRef.current = makeScaleState(performance.now());
    setRunning(true);
    runningRef.current = true;
    connectStream();
  }, [connectStream]);

  // teardown on unmount
  useEffect(() => {
    return () => {
      if (esRef.current) {
        try {
          esRef.current.close();
        } catch {
          /* noop */
        }
      }
      if (synthTimerRef.current) window.clearTimeout(synthTimerRef.current);
      const s = synthRef.current;
      if (s) {
        try {
          s.ctx.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  const langChoices = ["all", "en", "de", "fr", "es", "ja", "ru", "zh"];

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06060a] text-foreground">
      {/* canvas backdrop */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* gradient vignette for legibility */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.55))]" />

      {/* ── Header ── */}
      <header className="relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-semibold text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Wiki Bells
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Every Wikipedia edit on Earth, this very second, struck as a bell. The
          world&apos;s collective editing is the instrument — you only shape the
          listening.
        </p>
        {source === "simulated" && (
          <p className="mt-3 font-mono text-base text-violet-300/95">
            simulated edit stream — live feed unavailable
          </p>
        )}
      </header>

      {/* ── Pre-start overlay ── */}
      {!running && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-5 px-6 text-center">
            <p className="max-w-md text-base text-muted-foreground">
              A live sonification of the global Wikimedia stream. Press play and
              listen to the whole world think out loud.
            </p>
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-violet-200/90 px-6 py-2.5 text-base font-medium text-[#1a140a] shadow-lg transition-colors hover:bg-violet-100"
            >
              Listen to the world edit
            </button>
            <p className="text-base text-muted-foreground">
              Audio starts on this click. No account, no pointing — just the
              stream.
            </p>
          </div>
        </div>
      )}

      {/* ── Live controls ── */}
      {running && (
        <div className="absolute bottom-16 left-1/2 z-10 w-[min(92vw,720px)] -translate-x-1/2">
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-black/55 px-4 py-3 backdrop-blur-md">
            <span className="mr-1 font-mono text-base text-muted-foreground">
              {source === "live"
                ? "live"
                : source === "connecting"
                  ? "connecting…"
                  : "simulated"}
            </span>

            <button
              onClick={() => setMuteBots((b) => !b)}
              className={`min-h-[44px] rounded-full px-4 py-2.5 text-base font-medium transition-colors ${
                muteBots
                  ? "bg-muted text-muted-foreground hover:bg-accent"
                  : "bg-violet-200/20 text-violet-100 hover:bg-violet-200/30"
              }`}
              title="Bot edits are woodier/quieter; toggle to silence them."
            >
              {muteBots ? "bots: muted" : "bots: on"}
            </button>

            <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-1">
              {langChoices.map((l) => (
                <button
                  key={l}
                  onClick={() => setOnlyLang(l)}
                  className={`min-h-[44px] rounded-full px-3 py-2 font-mono text-base transition-colors ${
                    onlyLang === l
                      ? "bg-violet-200/85 text-[#1a140a]"
                      : "text-muted-foreground hover:bg-accent"
                  }`}
                  title={l === "all" ? "all language wikis" : `${l} wiki only`}
                >
                  {l}
                </button>
              ))}
            </div>

            <span className="ml-1 font-mono text-base text-muted-foreground">
              {stats.rate}/s · {stats.total} struck
            </span>
          </div>
        </div>
      )}

      {/* ── Design notes button ── */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-5 top-8 z-10 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base text-muted-foreground backdrop-blur-md transition-colors hover:bg-black/60 hover:text-foreground"
      >
        Design notes
      </button>

      {/* ── Design notes panel (surfaces README) ── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82vh] w-[min(92vw,640px)] overflow-y-auto rounded-2xl border border-border bg-[#0b0b12] p-6 text-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-xl text-foreground">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-full px-4 py-2.5 text-base text-muted-foreground hover:text-foreground"
              >
                close
              </button>
            </div>
            <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what does
                the whole world thinking out loud sound like — every Wikipedia
                edit, anywhere on Earth, this very second, struck as a bell?
              </p>
              <p>
                A Resonance-flavored, harmonically richer descendant of{" "}
                <span className="text-foreground">
                  Hatnote&apos;s &ldquo;Listen to Wikipedia&rdquo;
                </span>{" "}
                (Stephen LaPorte &amp; Mahmoud Hashemi, 2013), which first turned
                the edit feed into bells and swells. Credit and thanks to them.
              </p>
              <p>
                <span className="text-foreground">Four subsystems:</span> live SSE
                ingestion + filter (Wikimedia EventStreams), inharmonic bell /
                tongue-drum synthesis, a modal scale that drifts every ~30s, and
                a Canvas2D bloom field.
              </p>
              <div>
                <p className="mb-1 text-foreground">Event → sound:</p>
                <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                  <li>byte-delta → pitch (big change = low, weighty bell)</li>
                  <li>edit → struck gold bell · new article → warm violet chime</li>
                  <li>new user → rising mint sparkle · bot → woodier / mutable</li>
                  <li>language → subtle stereo pan</li>
                </ul>
              </div>
              <p>
                <span className="text-foreground">No network?</span> A built-in
                synthetic generator (Poisson-ish arrivals) plays an identical-
                feeling stream, flagged in amber. Up to 12 voices; floods are
                throttled to the most significant events so a busy day never
                clips or roars.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
