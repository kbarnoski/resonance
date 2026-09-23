"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17792-scriptorium — "What if the live, worldwide stream of Wikipedia edits
// happening RIGHT NOW — every person, in every language, editing the encyclopedia
// this second — conducted one of Karel's real piano takes, each edit sounding a
// grain of his recording?"
//
//   This DEEPENS Hatnote's *Listen to Wikipedia* (Stephen LaPorte & Mahmoud
//   Hashemi, 2013, listen.hatnote.com), which sonified the same live edit feed
//   with synthesized bells. Here the synth is gone: every edit instead plays a
//   GRAIN — a short slice of Karel's real recorded piano (concatenative granular
//   scrub) — and the feed is rendered as a living 3D typographic constellation.
//
//   THE FEED — Wikimedia EventStreams `recentchange`, the real worldwide edit
//   firehose, over the browser's native EventSource (keyless, CORS-open). Each
//   event is one edit: its wiki/language, byte-delta, type, and whether a human
//   or a bot made it. If the stream is blocked or errors, a bundled synthetic
//   generator emits realistic recentchange-shaped events with NO network, so the
//   piece works instantly on a muted phone before Begin AND survives any drop.
//   A mono status line ALWAYS states which source is live; never demo-as-live.
//
//   THE SONIFICATION — one of Karel's real takes is loaded into an AudioBuffer.
//   Every edit triggers a grain reading a short slice of it:
//     · byte-delta magnitude → register + length (big edit = lower & longer,
//       tiny edit = higher & shorter) via playbackRate.
//     · language/wiki        → which region of the take the grain reads + stereo
//       pan, so each language sings from its own place and its own phrase.
//     · human vs bot         → humans are the warm foreground; bots are a quieter,
//       low-passed background layer of ghost-grains.
//     · edit type            → grain length / envelope shape.
//   A very quiet continuous loop of the take runs underneath so it stays musical,
//   not merely pointillist. Polyphony is capped so a burst can't overload. Every
//   audible node is a slice of Karel's decoded take through one createSafeMaster —
//   zero synthesis (house rule 10).
//
//   THE VISUAL (three.js) — each edit spawns a warm typographic glyph (the article
//   title) into a near-black warm space; hue encodes language, size encodes
//   byte-delta, humans glow bright and bots drift as dim ghosts. Glyphs rise and
//   fade over a few seconds under a slow camera drift; overall bloom pulses with
//   the master analyser. It should feel like watching the encyclopedia written by
//   thousands of hands at once. If WebGL is unavailable the audio keeps playing
//   and a scrolling DOM list of the current edits stands in.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveToggle } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── constants ────────────────────────────────────────────────────────────────
const STREAM_URL = "https://stream.wikimedia.org/v2/stream/recentchange";
const DEFAULT_TRACK_ID = "eba95845-cdbf-41d8-9c5d-8679686811ad"; // "Bath" — warm gold

const GLYPH_POOL = 72; // max concurrent title glyphs on screen
const MAX_GRAINS = 24; // hard polyphony cap so a burst never overloads
const TITLE_MAX = 40; // truncate untrusted titles for display
const RECENT_MAX = 14; // rows kept for the DOM ticker / WebGL fallback

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ── the normalized edit our whole piece speaks in ─────────────────────────────
interface EditEvent {
  type: string; // edit | new | categorize | log
  namespace: number; // 0 = article, 14 = category, 2/3 = user, …
  title: string; // UNTRUSTED external text — only ever rendered as text
  user: string; // UNTRUSTED
  bot: boolean;
  minor: boolean;
  delta: number; // byte delta (new-old), 0 when absent
  wiki: string; // e.g. "enwiki"
  domain: string; // e.g. "en.wikipedia.org"
}

// ── the wikis we colour / place explicitly; everything else hashes in ─────────
// Hues stay in the warm-human band (amber → rose → violet); no cold blue/green.
interface WikiSpec {
  wiki: string;
  domain: string;
  hue: number; // 0..1
  region: number; // which slice of the take this language reads (0..1)
  pan: number; // stereo placement (-1..1)
  weight: number; // synthetic-mix likelihood
}
const WIKIS: WikiSpec[] = [
  { wiki: "enwiki", domain: "en.wikipedia.org", hue: 0.09, region: 0.1, pan: -0.15, weight: 30 },
  { wiki: "dewiki", domain: "de.wikipedia.org", hue: 0.06, region: 0.24, pan: -0.55, weight: 12 },
  { wiki: "frwiki", domain: "fr.wikipedia.org", hue: 0.97, region: 0.38, pan: 0.5, weight: 11 },
  { wiki: "eswiki", domain: "es.wikipedia.org", hue: 0.12, region: 0.52, pan: 0.65, weight: 10 },
  { wiki: "jawiki", domain: "ja.wikipedia.org", hue: 0.88, region: 0.66, pan: 0.3, weight: 9 },
  { wiki: "ruwiki", domain: "ru.wikipedia.org", hue: 0.78, region: 0.8, pan: -0.65, weight: 8 },
  { wiki: "commonswiki", domain: "commons.wikimedia.org", hue: 0.04, region: 0.45, pan: 0.0, weight: 12 },
  { wiki: "wikidatawiki", domain: "www.wikidata.org", hue: 0.75, region: 0.6, pan: -0.35, weight: 14 },
];
const WIKI_BY_KEY = new Map(WIKIS.map((w) => [w.wiki, w]));

/** Stable specifier for any wiki, hashing unknown ones into the warm band. */
function specForWiki(wiki: string): WikiSpec {
  const known = WIKI_BY_KEY.get(wiki);
  if (known) return known;
  let h = 0;
  for (let i = 0; i < wiki.length; i++) h = (h * 31 + wiki.charCodeAt(i)) >>> 0;
  const f = (h % 1000) / 1000;
  // Keep hashed hues in amber→violet: 0.02..0.14 (amber/gold) or 0.72..0.98 (violet/rose).
  const hue = f < 0.5 ? 0.02 + (f / 0.5) * 0.12 : 0.72 + ((f - 0.5) / 0.5) * 0.26;
  return {
    wiki,
    domain: wiki,
    hue,
    region: (h % 997) / 997,
    pan: ((h % 200) / 100 - 1) * 0.8,
    weight: 1,
  };
}

/** Byte-delta magnitude → 0 (tiny) .. 1 (huge), log-scaled. */
function deltaNorm(delta: number): number {
  const mag = clamp(Math.abs(delta), 1, 4000);
  return Math.log2(mag) / Math.log2(4000);
}

// ── the synthetic feed — realistic recentchange with zero network ─────────────
const SYNTH_WORDS = [
  "History", "Bridge", "Sonata", "Coastline", "Meridian", "Lantern", "Archive",
  "Migration", "Cathedral", "Harvest", "Observatory", "Ceramic", "Estuary",
  "Typeface", "Glacier", "Orchard", "Manuscript", "Foundry", "Almanac",
  "Cartography", "Vineyard", "Telegraph", "Marble", "Aqueduct", "Solstice",
  "Pigment", "Compass", "Ledger", "Meadow", "Belfry", "Delta", "Prairie",
];
const SYNTH_USERS = [
  "Aria", "Tomas", "Yuki", "Nadia", "Olof", "Priya", "Mateo", "Wen", "Ingrid",
  "Diego", "Sana", "Lukas", "Amara", "Rin", "Pavel", "Noor",
];
const SYNTH_BOTS = ["ClueBot NG", "InternetArchiveBot", "AnomieBOT", "Cewbot", "KrinkleBot"];
const SYNTH_TYPES: { type: string; w: number }[] = [
  { type: "edit", w: 62 },
  { type: "new", w: 18 },
  { type: "categorize", w: 14 },
  { type: "log", w: 6 },
];

function pickWeighted<T extends { weight?: number; w?: number }>(arr: T[]): T {
  let total = 0;
  for (const a of arr) total += a.weight ?? a.w ?? 1;
  let r = Math.random() * total;
  for (const a of arr) {
    r -= a.weight ?? a.w ?? 1;
    if (r <= 0) return a;
  }
  return arr[arr.length - 1];
}

function makeSyntheticEvent(): EditEvent {
  const spec = pickWeighted(WIKIS);
  const type = pickWeighted(SYNTH_TYPES).type;
  const bot = Math.random() < 0.15;
  const minor = Math.random() < 0.1;
  // byte delta: usually small, occasionally large; both signs.
  const big = Math.random() < 0.12;
  const mag = big
    ? 200 + Math.floor(Math.random() * 3200)
    : 1 + Math.floor(Math.random() * 180);
  const delta = (Math.random() < 0.4 ? -1 : 1) * mag;
  const w1 = SYNTH_WORDS[(Math.random() * SYNTH_WORDS.length) | 0];
  const w2 = SYNTH_WORDS[(Math.random() * SYNTH_WORDS.length) | 0];
  const title =
    type === "categorize"
      ? `Category:${w1}`
      : Math.random() < 0.5
        ? `${w1} of ${w2}`
        : `${w1} ${w2}`;
  const user = bot
    ? SYNTH_BOTS[(Math.random() * SYNTH_BOTS.length) | 0]
    : SYNTH_USERS[(Math.random() * SYNTH_USERS.length) | 0];
  const namespace = type === "categorize" ? 14 : Math.random() < 0.82 ? 0 : 2;
  return {
    type,
    namespace,
    title,
    user,
    bot,
    minor,
    delta,
    wiki: spec.wiki,
    domain: spec.domain,
  };
}

/** Parse one raw recentchange payload into our EditEvent, defensively. */
function parseRecentChange(raw: unknown): EditEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.title !== "string") return null;
  const len = d.length as { old?: unknown; new?: unknown } | undefined;
  let delta = 0;
  if (len && typeof len.old === "number" && typeof len.new === "number") {
    delta = len.new - len.old;
  }
  const meta = d.meta as { domain?: unknown } | undefined;
  return {
    type: typeof d.type === "string" ? d.type : "edit",
    namespace: typeof d.namespace === "number" ? d.namespace : 0,
    title: d.title,
    user: typeof d.user === "string" ? d.user : "",
    bot: d.bot === true,
    minor: d.minor === true,
    delta,
    wiki: typeof d.wiki === "string" ? d.wiki : "",
    domain:
      typeof d.server_name === "string"
        ? d.server_name
        : meta && typeof meta.domain === "string"
          ? meta.domain
          : "",
  };
}

function truncateTitle(t: string): string {
  const s = t.replace(/_/g, " ");
  return s.length > TITLE_MAX ? s.slice(0, TITLE_MAX - 1) + "…" : s;
}

type FeedState = "demo" | "live" | "error";

export default function ScriptoriumPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const { immersive, toggle } = useImmersive();

  // ── audio graph refs ────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const humanBusRef = useRef<GainNode | null>(null);
  const botBusRef = useRef<GainNode | null>(null);
  const bedSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const bedGainRef = useRef<GainNode | null>(null);
  const activeGrainsRef = useRef(0);
  const ampDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ampRef = useRef(0);
  const audioOnRef = useRef(false);

  // ── feed refs ───────────────────────────────────────────────────────────────
  const esRef = useRef<EventSource | null>(null);
  const genTimerRef = useRef<number | null>(null);
  const genRunningRef = useRef(true); // demo generator emits while true
  const mountedRef = useRef(true);
  const feedRef = useRef<FeedState>("demo");
  const eventCountRef = useRef(0);

  // bridges into the render-loop closures
  const spawnGlyphRef = useRef<((e: EditEvent) => void) | null>(null);
  const recentRef = useRef<EditEvent[]>([]);

  // ── discrete UI state ───────────────────────────────────────────────────────
  const [started, setStarted] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [feed, setFeed] = useState<FeedState>("demo");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK_ID);
  const [trackTitle, setTrackTitle] = useState<string>(
    REAL_TRACKS.find((t) => t.id === DEFAULT_TRACK_ID)?.title ?? "Bath",
  );
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [glError, setGlError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [recent, setRecent] = useState<EditEvent[]>([]);
  const [rate, setRate] = useState(0); // events/sec, throttled readout

  // ── one grain = a short slice of Karel's take (concatenative granular) ────────
  const triggerGrain = useCallback((edit: EditEvent) => {
    const ctx = ctxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;
    if (activeGrainsRef.current >= MAX_GRAINS) return; // bounded polyphony

    const spec = specForWiki(edit.wiki);
    const dn = deltaNorm(edit.delta);

    // big edit → lower & longer; tiny edit → higher & shorter.
    const playbackRate = Math.pow(2, (0.5 - dn) * 1.5);
    let len = 0.12 + dn * 0.55;
    if (edit.type === "new") len *= 1.5; // a new page = a fuller swell
    else if (edit.type === "log") len *= 0.6; // a log action = a short mark
    len = clamp(len, 0.08, 1.1);

    const dur = buffer.duration;
    const jitter = (Math.random() - 0.5) * 0.06;
    const offset = clamp(
      spec.region * (dur * 0.85) + jitter * dur,
      0,
      Math.max(0, dur - len - 0.05),
    );

    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = playbackRate;

    const g = ctx.createGain();
    const peak = edit.bot ? 0.07 : edit.minor ? 0.14 : 0.2;
    const atk = 0.008;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setTargetAtTime(0.0001, t + Math.max(atk, len * 0.5), len * 0.4 + 0.05);

    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp(spec.pan + (Math.random() - 0.5) * 0.25, -1, 1);

    src.connect(g);
    g.connect(pan);
    const bus = edit.bot ? botBusRef.current : humanBusRef.current;
    if (bus) pan.connect(bus);

    activeGrainsRef.current++;
    src.onended = () => {
      activeGrainsRef.current = Math.max(0, activeGrainsRef.current - 1);
      try {
        src.disconnect();
        g.disconnect();
        pan.disconnect();
      } catch {
        /* already gone */
      }
    };
    const tail = len + len * 0.4 + 0.1;
    try {
      src.start(t, offset, tail);
    } catch {
      activeGrainsRef.current = Math.max(0, activeGrainsRef.current - 1);
    }
  }, []);

  // ── the single edit sink both feeds call ──────────────────────────────────────
  const onEdit = useCallback(
    (edit: EditEvent) => {
      if (!mountedRef.current) return;
      eventCountRef.current++;
      spawnGlyphRef.current?.(edit);
      if (audioOnRef.current) triggerGrain(edit);
      const arr = recentRef.current;
      arr.unshift(edit);
      if (arr.length > RECENT_MAX) arr.length = RECENT_MAX;
    },
    [triggerGrain],
  );
  const onEditRef = useRef(onEdit);
  useEffect(() => {
    onEditRef.current = onEdit;
  }, [onEdit]);

  // ── (re)load a real take into the grain buffer + restart the quiet bed ────────
  const attachTake = useCallback(async (id: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    setLoadingTrack(true);
    setAudioError(null);
    try {
      const { buffer, title } = await loadRealTrackBuffer(ctx, id);
      if (!ctxRef.current || ctxRef.current.state === "closed") return;
      bufferRef.current = buffer;
      // quiet continuous bed = a slow loop of the take under the grains
      try {
        bedSrcRef.current?.stop();
      } catch {
        /* already stopped */
      }
      const bedGain = bedGainRef.current;
      if (bedGain) {
        const bed = ctx.createBufferSource();
        bed.buffer = buffer;
        bed.loop = true;
        bed.playbackRate.value = 0.5; // low, distant undercurrent
        bed.connect(bedGain);
        bed.start(ctx.currentTime, 0);
        bedSrcRef.current = bed;
      }
      setTrackTitle(title);
      setTrackId(id);
    } catch {
      setAudioError(
        "That take could not load right now — check your connection and try again.",
      );
    } finally {
      setLoadingTrack(false);
    }
  }, []);

  // ── connect the live Wikimedia stream; fall back to the demo on any error ─────
  const connectStream = useCallback(() => {
    if (typeof EventSource === "undefined") {
      // no EventSource → stay on the synthetic demo
      genRunningRef.current = true;
      feedRef.current = "demo";
      setFeed("demo");
      return;
    }
    let es: EventSource;
    try {
      es = new EventSource(STREAM_URL);
    } catch {
      genRunningRef.current = true;
      feedRef.current = "error";
      setFeed("error");
      return;
    }
    esRef.current = es;
    es.onmessage = (ev: MessageEvent) => {
      let parsed: EditEvent | null = null;
      try {
        parsed = parseRecentChange(JSON.parse(ev.data as string));
      } catch {
        parsed = null;
      }
      if (!parsed) return;
      // first real event → go live, silence the demo generator
      if (feedRef.current !== "live") {
        feedRef.current = "live";
        genRunningRef.current = false;
        setFeed("live");
      }
      onEditRef.current(parsed);
    };
    es.onerror = () => {
      // blocked / dropped — fall back to the synthetic demo, mark the error
      try {
        es.close();
      } catch {
        /* noop */
      }
      if (esRef.current === es) esRef.current = null;
      if (!mountedRef.current) return;
      genRunningRef.current = true;
      feedRef.current = "error";
      setFeed("error");
    };
  }, []);

  // ── Begin: build the audio graph, load the take, open the live stream ──────────
  const begin = useCallback(async () => {
    if (audioOnRef.current) return;

    let ctx = ctxRef.current;
    if (!ctx) {
      try {
        const Ctor: typeof AudioContext =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) {
          setAudioError("Web Audio is unavailable — the constellation still runs.");
          setStarted(true);
          connectStream();
          return;
        }
        ctx = new Ctor();
        ctxRef.current = ctx;
      } catch {
        setAudioError("Audio failed to start — the constellation still runs.");
        setStarted(true);
        connectStream();
        return;
      }
    }
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      /* the tap should have unlocked it */
    }

    let safe = safeRef.current;
    if (!safe) {
      safe = createSafeMaster(ctx);
      safeRef.current = safe;
    }
    ampDataRef.current = new Uint8Array(safe.analyser.frequencyBinCount);

    // Two grain buses + a quiet bed, all into the shared ear-safety master.
    //   human grains → humanBus (warm foreground)
    //   bot grains   → botLP → botBus (dim, low-passed background)
    //   bed loop     → bedGain (very low undercurrent)
    const humanBus = ctx.createGain();
    humanBus.gain.value = 0.9;
    humanBus.connect(safe.input);

    const botLP = ctx.createBiquadFilter();
    botLP.type = "lowpass";
    botLP.frequency.value = 900;
    botLP.Q.value = 0.6;
    const botBus = ctx.createGain();
    botBus.gain.value = 0.6;
    botLP.connect(botBus);
    botBus.connect(safe.input);

    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.0001;
    bedGain.connect(safe.input);

    humanBusRef.current = humanBus;
    botBusRef.current = botLP; // bot grains feed the lowpass first
    bedGainRef.current = bedGain;

    audioOnRef.current = true;
    setAudioOn(true);
    setStarted(true);

    await attachTake(trackId);

    // swell the bed in gently once the take is loaded
    if (bufferRef.current) {
      bedGain.gain.setTargetAtTime(0.05, ctx.currentTime, 2.0);
    }

    connectStream();
  }, [attachTake, connectStream, trackId]);

  // ── mute / tear down the audio only (feed + visuals keep running) ─────────────
  const stopAudio = useCallback(() => {
    audioOnRef.current = false;
    try {
      bedSrcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    bedSrcRef.current = null;
    try {
      safeRef.current?.disconnect();
    } catch {
      /* closing */
    }
    const ctx = ctxRef.current;
    safeRef.current = null;
    ctxRef.current = null;
    bufferRef.current = null;
    humanBusRef.current = null;
    botBusRef.current = null;
    bedGainRef.current = null;
    ampDataRef.current = null;
    activeGrainsRef.current = 0;
    if (ctx) void ctx.close();
    setAudioOn(false);
  }, []);

  // ── change the take while playing ─────────────────────────────────────────────
  const onSelectTrack = useCallback(
    (id: string) => {
      setTrackId(id);
      if (audioOnRef.current) void attachTake(id);
      else {
        const t = REAL_TRACKS.find((x) => x.id === id);
        if (t) setTrackTitle(t.title);
      }
    },
    [attachTake],
  );

  // ── the synthetic demo generator (visual before Begin; audio+visual fallback) ─
  useEffect(() => {
    mountedRef.current = true;
    const tick = () => {
      if (!mountedRef.current) return;
      if (genRunningRef.current) onEditRef.current(makeSyntheticEvent());
      // cadence ~2–8 events/sec, jittered
      genTimerRef.current = window.setTimeout(tick, 125 + Math.random() * 375);
    };
    genTimerRef.current = window.setTimeout(tick, 200);
    return () => {
      mountedRef.current = false;
      if (genTimerRef.current !== null) {
        window.clearTimeout(genTimerRef.current);
        genTimerRef.current = null;
      }
    };
  }, []);

  // ── throttled chrome flush (recent list + event rate) ─────────────────────────
  useEffect(() => {
    let prevCount = 0;
    let prevT = performance.now();
    const id = window.setInterval(() => {
      if (!mountedRef.current) return;
      setRecent(recentRef.current.slice(0, RECENT_MAX));
      const now = performance.now();
      const dt = (now - prevT) / 1000;
      const dc = eventCountRef.current - prevCount;
      prevT = now;
      prevCount = eventCountRef.current;
      if (dt > 0) setRate(dc / dt);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // ── build + run the three.js constellation (always on, even before Begin) ─────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = prefersReducedMotion();

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setGlError(true);
      renderer = null;
    }

    if (!renderer) {
      // No WebGL — audio + the DOM ticker carry the piece. Nothing to build.
      return;
    }

    let w = mount.clientWidth || window.innerWidth;
    let h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0705); // warm ink
    scene.fog = new THREE.FogExp2(0x0a0705, 0.03);

    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);

    const disposables: Array<{ dispose: () => void }> = [];

    // warm radial backdrop glow (pulses with the master analyser)
    const glowTex = makeRadialTexture([
      [0, "rgba(120,70,30,0.55)"],
      [0.4, "rgba(70,40,60,0.28)"],
      [1, "rgba(10,7,5,0)"],
    ]);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(48, 48, 1);
    glow.position.set(0, 0, -8);
    glow.renderOrder = -10;
    scene.add(glow);
    disposables.push(glowTex, glowMat);

    // faint warm dust — thousands of quiet hands in the background
    const DUST = 900;
    const dpos = new Float32Array(DUST * 3);
    const dcol = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dpos[i * 3] = (Math.random() - 0.5) * 40;
      dpos[i * 3 + 1] = (Math.random() - 0.5) * 26;
      dpos[i * 3 + 2] = -2 - Math.random() * 22;
      const warm = 0.3 + Math.random() * 0.4;
      dcol[i * 3] = warm;
      dcol[i * 3 + 1] = warm * 0.6;
      dcol[i * 3 + 2] = warm * 0.4;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    dustGeo.setAttribute("color", new THREE.BufferAttribute(dcol, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.06,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);
    disposables.push(dustGeo, dustMat);

    // ── glyph pool: reusable text sprites ──────────────────────────────────────
    interface Glyph {
      sprite: THREE.Sprite;
      mat: THREE.SpriteMaterial;
      tex: THREE.CanvasTexture;
      canvas: HTMLCanvasElement;
      c2d: CanvasRenderingContext2D;
      active: boolean;
      age: number;
      life: number;
      vx: number;
      vy: number;
      vz: number;
      size: number;
      baseOpacity: number;
    }
    const glyphs: Glyph[] = [];
    for (let i = 0; i < GLYPH_POOL; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const c2d = canvas.getContext("2d");
      if (!c2d) continue;
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      disposables.push(tex, mat);
      glyphs.push({
        sprite,
        mat,
        tex,
        canvas,
        c2d,
        active: false,
        age: 0,
        life: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 1,
        baseOpacity: 1,
      });
    }

    const tmpColor = new THREE.Color();

    // paint one glyph from an edit and launch it into the field
    spawnGlyphRef.current = (edit: EditEvent) => {
      let g: Glyph | null = null;
      for (const cand of glyphs) {
        if (!cand.active) {
          g = cand;
          break;
        }
      }
      if (!g) return; // pool full — this edit is heard but not drawn

      const spec = specForWiki(edit.wiki);
      const dn = deltaNorm(edit.delta);
      // hue by language; lightness by human/bot; category namespace a touch cooler
      const light = edit.bot ? 0.38 : 0.62;
      const sat = edit.namespace === 0 ? 0.72 : 0.5;
      tmpColor.setHSL(spec.hue, sat, light);
      g.mat.color.copy(tmpColor);

      // repaint the title (untrusted → drawn as plain canvas text only)
      const label = truncateTitle(edit.title);
      const c = g.c2d;
      c.clearRect(0, 0, g.canvas.width, g.canvas.height);
      let fontPx = 60;
      c.textBaseline = "middle";
      c.textAlign = "center";
      c.font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      // shrink to fit the canvas width
      while (c.measureText(label).width > g.canvas.width - 24 && fontPx > 22) {
        fontPx -= 4;
        c.font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      }
      c.shadowColor = "rgba(255,240,220,0.5)";
      c.shadowBlur = 12;
      c.fillStyle = "#fff8ef";
      c.fillText(label, g.canvas.width / 2, g.canvas.height / 2);
      g.tex.needsUpdate = true;

      // size by byte-delta; humans a bit larger than bots
      const size = (0.9 + dn * 2.3) * (edit.bot ? 0.7 : 1);
      g.size = size;
      g.sprite.scale.set(size * 4, size, 1);

      // place near the middle, drift up & slightly outward
      g.sprite.position.set(
        (Math.random() - 0.5) * 11,
        (Math.random() - 0.5) * 6.5,
        -1 - Math.random() * 5,
      );
      g.vx = (Math.random() - 0.5) * 0.25;
      g.vy = 0.28 + Math.random() * 0.35;
      g.vz = 0.15 + Math.random() * 0.35;
      g.age = 0;
      g.life = (edit.bot ? 3.0 : 4.5) + Math.random() * 2.5;
      g.baseOpacity = edit.bot ? 0.4 : 0.92;
      g.active = true;
      g.sprite.visible = true;
      g.mat.opacity = 0;
    };

    let camAngle = 0;
    let raf = 0;
    let prev = performance.now();

    const frame = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0, (ts - prev) / 1000));
      prev = ts;

      // master analyser amplitude → bloom pulse
      const safe = safeRef.current;
      const data = ampDataRef.current;
      if (safe && data) {
        safe.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        ampRef.current += (rms - ampRef.current) * 0.2;
      }
      const amp = ampRef.current;
      const bloom = 0.85 + amp * 0.9;

      glow.material.opacity = 0.35 + amp * 0.8;
      glow.scale.setScalar(46 + amp * 18);

      // advance glyphs
      for (const g of glyphs) {
        if (!g.active) continue;
        g.age += dt;
        if (g.age >= g.life) {
          g.active = false;
          g.sprite.visible = false;
          g.mat.opacity = 0;
          continue;
        }
        g.sprite.position.x += g.vx * dt;
        g.sprite.position.y += g.vy * dt;
        g.sprite.position.z += g.vz * dt;
        const f = g.age / g.life;
        // quick fade-in, long fade-out
        const env = f < 0.12 ? f / 0.12 : 1 - (f - 0.12) / 0.88;
        g.mat.opacity = clamp(g.baseOpacity * env * bloom, 0, 1);
        const grow = 1 + f * 0.25;
        g.sprite.scale.set(g.size * 4 * grow, g.size * grow, 1);
      }

      dust.rotation.y += dt * 0.01;
      (dustMat as THREE.PointsMaterial).opacity = 0.5 + amp * 0.4;

      // slow camera drift
      if (!reduced) camAngle += dt * 0.04;
      const cr = 12;
      camera.position.set(
        Math.sin(camAngle) * 2.2,
        Math.sin(camAngle * 0.7) * 1.1,
        cr,
      );
      camera.lookAt(0, 0, -2);

      renderer!.render(scene, camera);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onResize = () => {
      if (!renderer) return;
      w = mount.clientWidth || window.innerWidth;
      h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      spawnGlyphRef.current = null;
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          /* noop */
        }
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ── full teardown on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      genRunningRef.current = false;
      if (genTimerRef.current !== null) {
        window.clearTimeout(genTimerRef.current);
        genTimerRef.current = null;
      }
      try {
        esRef.current?.close();
      } catch {
        /* noop */
      }
      esRef.current = null;
      try {
        bedSrcRef.current?.stop();
      } catch {
        /* already stopped */
      }
      try {
        safeRef.current?.disconnect();
      } catch {
        /* closing */
      }
      const ctx = ctxRef.current;
      safeRef.current = null;
      ctxRef.current = null;
      if (ctx) void ctx.close();
    };
  }, []);

  const feedLabel =
    feed === "live"
      ? "live · stream.wikimedia.org"
      : "demo · sample stream (not live)";
  const feedClass =
    feed === "live"
      ? "text-foreground"
      : feed === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* three.js constellation */}
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none select-none"
        aria-hidden
      />

      {/* WebGL-unavailable fallback: keep the audio + a live DOM ticker */}
      {glError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6">
          <p className="max-w-md text-center text-base text-muted-foreground">
            A 3D view could not open here, so the constellation is hidden — but the
            edits still sound Karel&rsquo;s piano. Here is the encyclopedia being
            written right now:
          </p>
          <ul className="w-full max-w-md space-y-1 font-mono text-xs text-muted-foreground">
            {recent.map((e, i) => (
              <li key={i} className="flex justify-between gap-3 truncate">
                <span className="truncate text-foreground">
                  {truncateTitle(e.title)}
                </span>
                <span className="shrink-0 text-muted-foreground/60">
                  {e.domain || e.wiki} · {e.delta >= 0 ? "+" : ""}
                  {e.delta}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* always-on status line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 p-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className={feedClass}>{feedLabel}</span>
        <span>{rate.toFixed(1)} edits/s</span>
        {audioOn && <span>take · {trackTitle}</span>}
        {recent[0] && (
          <span className="max-w-[46vw] truncate normal-case tracking-normal">
            {truncateTitle(recent[0].title)}
          </span>
        )}
        {audioError && (
          <span className="normal-case tracking-normal text-destructive">
            {audioError}
          </span>
        )}
      </div>

      {/* write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="pointer-events-auto max-w-md">
              <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                17792 · scriptorium
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                The live encyclopedia conducts a piano take
              </h1>
              <p className="mt-1 text-base text-muted-foreground">
                Every Wikipedia edit happening right now — in every language — plays
                a grain of one of Karel&rsquo;s real recordings, and drifts up as a
                warm glyph of the article being written.
              </p>
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              {!audioOn ? (
                <button
                  type="button"
                  onClick={begin}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {started ? "Begin again" : "Begin"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopAudio}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Mute
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
              <ImmersiveToggle immersive={immersive} onToggle={toggle} />
            </div>
          </div>

          {/* take picker */}
          <div className="pointer-events-auto flex items-center gap-2">
            <label
              htmlFor="take"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              take
            </label>
            <select
              id="take"
              value={trackId}
              onChange={(e) => onSelectTrack(e.target.value)}
              disabled={loadingTrack}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            {loadingTrack && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                loading…
              </span>
            )}
          </div>
        </div>
      )}

      {/* immersive exit pill */}
      {immersive && <ImmersiveToggle immersive={immersive} onToggle={toggle} />}

      {!started && !immersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-base text-muted-foreground">
            Press <span className="text-foreground">Begin</span> — the field already
            shows a sample stream; the tap starts Karel&rsquo;s piano and connects
            the live worldwide edit feed.
          </p>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg space-y-3 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              A scriptorium of thousands of hands
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              One question: what if the live, worldwide stream of Wikipedia edits
              happening right now — every person, in every language, editing the
              encyclopedia this second — conducted one of Karel&rsquo;s real piano
              takes, each edit sounding a grain of his recording?
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The feed is Wikimedia EventStreams&rsquo; <em>recentchange</em>, the
              real edit firehose, over the browser&rsquo;s native EventSource. Each
              edit triggers a grain — a short slice of Karel&rsquo;s decoded take.
              Byte-delta magnitude sets register and length (a big edit is lower and
              longer, a tiny one higher and shorter); language chooses which region
              of the take the grain reads and where it pans; humans are the warm
              foreground while bots are a quieter, low-passed background layer. A
              very quiet loop of the take runs underneath so it stays musical.
              Polyphony is capped so a burst can&rsquo;t overload, and every audible
              node is a slice of Karel&rsquo;s real recording through one shared
              ear-safety master — no synths, no oscillators.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Before you tap Begin, and any time the live stream is blocked or drops,
              a bundled synthetic generator emits realistic recentchange-shaped
              events with no network, so the piece works instantly on a muted phone.
              The status line always says which source is live and never presents the
              demo as live.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This deepens Hatnote&rsquo;s <em>Listen to Wikipedia</em> (Stephen
              LaPorte &amp; Mahmoud Hashemi, 2013, listen.hatnote.com), which
              sonified the same edit feed with synthesized bells — here the synth is
              replaced by grains of Karel&rsquo;s real piano, rendered as a living 3D
              typographic constellation.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {!immersive && (
        <PrototypeNav
          slugs={["17792-scriptorium", "17728-overhead", "17616-tremor"]}
        />
      )}
    </main>
  );
}

// ── a soft radial gradient as a canvas texture (for the backdrop glow) ─────────
function makeRadialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const g = cv.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    for (const [pos, col] of stops) grad.addColorStop(pos, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
