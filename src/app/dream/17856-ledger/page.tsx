"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17856-ledger — "What if the world's live financial trades — the mundane torrent
// of money changing hands RIGHT NOW — conducted one of Karel's real piano takes?"
//
//   A live tape of real market matches drives a granular re-voicing of ONE of
//   Karel's real piano recordings, rendered as a warm horizontal RIVER of
//   transaction glyphs in three.js. Every incoming trade fires one grain — a
//   short slice of the decoded real take — never a synth (house rule 10).
//
//   THE FEED — Coinbase Exchange's public market-data WebSocket
//   (wss://ws-feed.exchange.coinbase.com, `matches` channel, BTC/ETH/SOL). It is
//   KEYLESS and open, and WebSockets bypass CORS. Each `match` carries side, size,
//   price, product_id, time. Because the sandbox is headless and a review may be
//   offline, a self-contained synthetic tape (a random-walk price with
//   Poisson-timed buys/sells) runs on mount and keeps running until the real
//   socket delivers its first message — then a mono status line flips honestly
//   from `demo · synthetic tape` to `live · coinbase`. The piece looks and sounds
//   complete on a cold, offline, muted phone before anyone taps Begin.
//
//   THE SONIFICATION — one of Karel's takes is decoded into an AudioBuffer. Each
//   trade triggers a grain reading a short slice of it:
//     · buy vs sell        → higher vs lower register (playbackRate ±semitones)
//                            and pan right vs left (StereoPanner).
//     · trade size (USD)   → grain loudness + grain length + glyph brightness/size.
//     · price velocity     → an overall transpose + brightness drift: a rising
//       (rate of change)     market lifts pitch and opens a lowpass (brighter);
//                            a falling one darkens and drops. Timbre-by-volatility,
//                            but the sounding body is always Karel's piano.
//   A slow half-speed bed loop of the same take runs underneath so it stays
//   musical between trades. Polyphony is capped so a burst can't overload. Every
//   grain, the bed, and the tone filter terminate in one createSafeMaster — never
//   ctx.destination.
//
//   THE VISUAL (three.js) — trades enter from the right and drift left as glowing
//   glyphs on a warm dark field (candlelit gold/amber-into-violet on near-black):
//   size = trade size, vertical position = price level within each product's lane,
//   hue warm/bright for buys and dim/violet for sells. A bloom pulse rides the
//   safeMaster analyser. NOT a chart — a living river of money-as-light. If WebGL
//   is unavailable a live DOM ticker of the tape stands in and the audio persists.
//
//   LINEAGE — this deepens market sonification: Jordan Wirfs-Brock's "Sounds of a
//   Volatile Stock Market", and the Marketbuzz / sMax line of real-time trade
//   sonifiers — by making the sounding body Karel's real piano rather than synth
//   tones.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── constants ────────────────────────────────────────────────────────────────
const SOCKET_URL = "wss://ws-feed.exchange.coinbase.com";
const DEFAULT_TRACK_ID = "d2eeee58-832b-4872-a4be-8fbf030b981d"; // "Rolling" — warm, rolling motion
const DEFAULT_TITLE =
  REAL_TRACKS.find((t) => t.id === DEFAULT_TRACK_ID)?.title ?? "Rolling";

const GLYPH_POOL = 180; // max concurrent trade glyphs adrift in the river
const MAX_GRAINS = 26; // hard polyphony cap so a burst never overloads
const RECENT_MAX = 14; // rows kept for the DOM ticker / WebGL fallback

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

// ── the products we tap, each with its own lane, phrase-region, pan, base price ─
interface ProductSpec {
  id: string; // "BTC-USD"
  label: string; // "BTC"
  base: number; // seed price for the synthetic tape
  hue: number; // buy hue (warm gold band), 0..1
  region: number; // which slice of the take its grains read, 0..1
  pan: number; // extra stereo bias for this product
  lane: number; // vertical world-Y centre of its band in the river
  vol: number; // synthetic per-tick volatility
  weight: number; // synthetic activity likelihood
}
const PRODUCTS: ProductSpec[] = [
  { id: "BTC-USD", label: "BTC", base: 63200, hue: 0.11, region: 0.08, pan: -0.12, lane: 2.6, vol: 0.0006, weight: 44 },
  { id: "ETH-USD", label: "ETH", base: 3180, hue: 0.08, region: 0.4, pan: 0.14, lane: 0.0, vol: 0.001, weight: 34 },
  { id: "SOL-USD", label: "SOL", base: 148, hue: 0.13, region: 0.7, pan: 0.02, lane: -2.6, vol: 0.0017, weight: 22 },
];
const PRODUCT_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));
const PRODUCT_IDS = PRODUCTS.map((p) => p.id);

// ── the raw trade both feeds speak in ──────────────────────────────────────────
interface Trade {
  side: "buy" | "sell";
  price: number;
  size: number; // base units (BTC / ETH / SOL)
  product: string;
}

// per-product running state: last price, rolling mid + range for vertical mapping
interface ProdState {
  last: number;
  mid: number;
  range: number;
}

/** Notional (USD) magnitude → 0 (tiny) .. 1 (whale), log-scaled. */
function sizeNorm(notional: number): number {
  const m = clamp(notional, 20, 300000);
  return Math.log(m / 20) / Math.log(300000 / 20);
}

const SEMI = (semis: number) => Math.pow(2, semis / 12);

function pickWeighted<T extends { weight: number }>(arr: T[]): T {
  let total = 0;
  for (const a of arr) total += a.weight;
  let r = Math.random() * total;
  for (const a of arr) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return arr[arr.length - 1];
}

// approx standard normal (Box–Muller, one sample) for lognormal sizes / walks
function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── the synthetic tape — a plausible random walk with Poisson-timed trades ─────
// A slow global regime meanders so the market visibly rises and falls (and the
// piece brightens / darkens) over ~30–60s, which reads well in an offline review.
function makeSyntheticTrade(state: Map<string, ProdState>, regime: number): Trade {
  const spec = pickWeighted(PRODUCTS);
  const ps = state.get(spec.id)!;
  // per-tick return: shared regime drift + idiosyncratic noise
  const drift = regime * spec.vol * 2.2 + randn() * spec.vol;
  const price = Math.max(spec.base * 0.2, ps.last * (1 + drift));
  // side follows the local move, with noise — up-ticks lean buy, down-ticks sell
  const buyProb = clamp(0.5 + drift * 260, 0.12, 0.88);
  const side: Trade["side"] = Math.random() < buyProb ? "buy" : "sell";
  // notional mostly $50–$6000, with an occasional whale up to ~$280k
  const whale = Math.random() < 0.04;
  const notional = whale
    ? 40000 + Math.random() * 240000
    : 40 * Math.exp(randn() * 1.15) + 30;
  const size = notional / price;
  return { side, price, size, product: spec.id };
}

/** Parse one Coinbase `match` / `last_match` payload into a Trade, defensively. */
function parseMatch(raw: unknown): Trade | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const type = d.type;
  if (type !== "match" && type !== "last_match") return null;
  const product = typeof d.product_id === "string" ? d.product_id : "";
  if (!PRODUCT_BY_ID.has(product)) return null;
  const price = typeof d.price === "string" ? parseFloat(d.price) : NaN;
  const size = typeof d.size === "string" ? parseFloat(d.size) : NaN;
  if (!isFinite(price) || !isFinite(size) || price <= 0 || size <= 0) return null;
  const side: Trade["side"] = d.side === "sell" ? "sell" : "buy";
  return { side, price, size, product };
}

type FeedState = "demo" | "live" | "error";

export default function LedgerPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const { immersive, toggle } = useImmersive();

  // ── audio graph refs ────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const grainBusRef = useRef<GainNode | null>(null);
  const toneRef = useRef<BiquadFilterNode | null>(null); // velocity-driven brightness
  const bedSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const bedGainRef = useRef<GainNode | null>(null);
  const activeGrainsRef = useRef(0);
  const ampDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ampRef = useRef(0);
  const audioOnRef = useRef(false);

  // ── feed refs ───────────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const genTimerRef = useRef<number | null>(null);
  const genRunningRef = useRef(true); // synthetic tape emits while true
  const mountedRef = useRef(true);
  const feedRef = useRef<FeedState>("demo");
  const tradeCountRef = useRef(0);

  // rolling market state, shared by both feeds
  const prodStateRef = useRef<Map<string, ProdState>>(
    new Map(PRODUCTS.map((p) => [p.id, { last: p.base, mid: p.base, range: p.base * 0.004 }])),
  );
  const velRef = useRef(0); // smoothed price velocity, -1..1
  const lastPxRef = useRef<Map<string, number>>(
    new Map(PRODUCTS.map((p) => [p.id, p.base])),
  );

  // bridges into the render-loop closures
  const spawnGlyphRef = useRef<
    | ((t: Trade, sn: number, dev: number, vel: number) => void)
    | null
  >(null);
  const recentRef = useRef<Trade[]>([]);

  // ── discrete UI state ───────────────────────────────────────────────────────
  const [started, setStarted] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [feed, setFeed] = useState<FeedState>("demo");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK_ID);
  const [trackTitle, setTrackTitle] = useState<string>(DEFAULT_TITLE);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [glError, setGlError] = useState(false);
  const [recent, setRecent] = useState<Trade[]>([]);
  const [rate, setRate] = useState(0); // trades/sec, throttled readout
  const [velReadout, setVelReadout] = useState(0);

  // ── one grain = a short slice of Karel's take (concatenative granular) ─────────
  const triggerGrain = useCallback(
    (trade: Trade, sn: number) => {
      const ctx = ctxRef.current;
      const buffer = bufferRef.current;
      if (!ctx || !buffer) return;
      if (activeGrainsRef.current >= MAX_GRAINS) return; // bounded polyphony

      const spec = PRODUCT_BY_ID.get(trade.product);
      if (!spec) return;
      const vel = velRef.current;

      // buy → higher register, sell → lower; velocity drifts the whole transpose.
      const sideSemis = trade.side === "buy" ? 3 : -3;
      const velSemis = vel * 5;
      const playbackRate = SEMI(sideSemis + velSemis);

      // trade size → grain length (bigger = longer / fuller)
      const len = clamp(0.12 + sn * 0.5, 0.09, 0.9);

      const dur = buffer.duration;
      const jitter = (Math.random() - 0.5) * 0.06;
      const offset = clamp(
        spec.region * (dur * 0.82) + jitter * dur,
        0,
        Math.max(0, dur - len - 0.05),
      );

      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = playbackRate;

      // trade size → loudness
      const g = ctx.createGain();
      const peak = 0.05 + sn * 0.22;
      const atk = 0.008;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + atk);
      g.gain.setTargetAtTime(0.0001, t + Math.max(atk, len * 0.5), len * 0.4 + 0.05);

      // buy pans right, sell pans left; product adds a small bias
      const base = trade.side === "buy" ? 0.42 : -0.42;
      const pan = ctx.createStereoPanner();
      pan.pan.value = clamp(base + spec.pan + (Math.random() - 0.5) * 0.2, -1, 1);

      src.connect(g);
      g.connect(pan);
      const bus = grainBusRef.current;
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
    },
    [],
  );

  // ── the single trade sink both feeds call: enrich, sound, draw, log ────────────
  const onTrade = useCallback(
    (trade: Trade) => {
      if (!mountedRef.current) return;
      tradeCountRef.current++;

      const spec = PRODUCT_BY_ID.get(trade.product);
      if (!spec) return;

      // update velocity from the actual price change (source-agnostic)
      const lastPx = lastPxRef.current.get(trade.product) ?? trade.price;
      if (lastPx > 0) {
        const ret = clamp((trade.price - lastPx) / lastPx, -0.02, 0.02);
        const target = clamp(ret * 150, -1, 1);
        velRef.current += (target - velRef.current) * 0.04;
      }
      lastPxRef.current.set(trade.product, trade.price);

      // rolling mid + range → vertical deviation inside the product's lane
      const ps = prodStateRef.current.get(trade.product)!;
      ps.last = trade.price;
      ps.mid += (trade.price - ps.mid) * 0.02;
      const span = Math.abs(trade.price - ps.mid);
      ps.range += (span - ps.range) * 0.05;
      const effRange = Math.max(ps.range, trade.price * 0.0008);
      const dev = clamp((trade.price - ps.mid) / (effRange * 3), -1, 1);

      const sn = sizeNorm(trade.price * trade.size);

      spawnGlyphRef.current?.(trade, sn, dev, velRef.current);
      if (audioOnRef.current) triggerGrain(trade, sn);

      const arr = recentRef.current;
      arr.unshift(trade);
      if (arr.length > RECENT_MAX) arr.length = RECENT_MAX;
    },
    [triggerGrain],
  );
  const onTradeRef = useRef(onTrade);
  useEffect(() => {
    onTradeRef.current = onTrade;
  }, [onTrade]);

  // ── (re)load a real take into the grain buffer + restart the half-speed bed ────
  const attachTake = useCallback(async (id: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    setLoadingTrack(true);
    setAudioError(null);
    try {
      const { buffer, title } = await loadRealTrackBuffer(ctx, id);
      if (!ctxRef.current || ctxRef.current.state === "closed") return;
      bufferRef.current = buffer;
      // the bed = a slow half-speed loop of the take, keeping it musical between trades
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

  // ── connect the live Coinbase socket; the synthetic tape covers any failure ────
  const connectSocket = useCallback(() => {
    if (typeof WebSocket === "undefined") {
      genRunningRef.current = true;
      feedRef.current = "demo";
      setFeed("demo");
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(SOCKET_URL);
    } catch {
      genRunningRef.current = true;
      feedRef.current = "error";
      setFeed("error");
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => {
      try {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: PRODUCT_IDS,
            channels: ["matches"],
          }),
        );
      } catch {
        /* the socket may already be closing */
      }
    };
    ws.onmessage = (ev: MessageEvent) => {
      let trade: Trade | null = null;
      try {
        trade = parseMatch(JSON.parse(ev.data as string));
      } catch {
        trade = null;
      }
      if (!trade) return;
      // first real trade → go live, silence the synthetic tape
      if (feedRef.current !== "live") {
        feedRef.current = "live";
        genRunningRef.current = false;
        setFeed("live");
      }
      onTradeRef.current(trade);
    };
    ws.onerror = () => {
      // blocked / dropped — fall back to the synthetic tape, mark the error
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      if (!mountedRef.current) return;
      // only surface an error / resume the tape if we never went live (or lost it)
      genRunningRef.current = true;
      if (feedRef.current !== "live") {
        feedRef.current = "error";
        setFeed("error");
      }
    };
  }, []);

  // ── Begin: build the audio graph, load the take, open the live socket ──────────
  const begin = useCallback(async () => {
    if (audioOnRef.current) return;

    let ctx = ctxRef.current;
    if (!ctx) {
      try {
        const Ctor: typeof AudioContext =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) {
          setAudioError("Web Audio is unavailable — the river still runs.");
          setStarted(true);
          connectSocket();
          return;
        }
        ctx = new Ctor();
        ctxRef.current = ctx;
      } catch {
        setAudioError("Audio failed to start — the river still runs.");
        setStarted(true);
        connectSocket();
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

    // grains + bed → tone (velocity-driven lowpass = brightness) → shared master.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3000;
    tone.Q.value = 0.5;
    tone.connect(safe.input);

    const grainBus = ctx.createGain();
    grainBus.gain.value = 0.9;
    grainBus.connect(tone);

    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.0001;
    bedGain.connect(tone);

    toneRef.current = tone;
    grainBusRef.current = grainBus;
    bedGainRef.current = bedGain;

    audioOnRef.current = true;
    setAudioOn(true);
    setStarted(true);

    await attachTake(trackId);

    // swell the bed in gently once the take is loaded
    if (bufferRef.current) {
      bedGain.gain.setTargetAtTime(0.055, ctx.currentTime, 2.0);
    }

    connectSocket();
  }, [attachTake, connectSocket, trackId]);

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
    grainBusRef.current = null;
    toneRef.current = null;
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

  // ── the synthetic tape (visual before Begin; audio+visual fallback after) ──────
  useEffect(() => {
    mountedRef.current = true;
    const startedAt = performance.now();
    const tick = () => {
      if (!mountedRef.current) return;
      if (genRunningRef.current) {
        // slow global regime: a meandering market that rises and falls
        const secs = (performance.now() - startedAt) / 1000;
        const regime =
          Math.sin(secs * 0.11) * 0.6 +
          Math.sin(secs * 0.037 + 1.3) * 0.4 +
          (Math.random() - 0.5) * 0.3;
        onTradeRef.current(makeSyntheticTrade(prodStateRef.current, regime));
      }
      // Poisson-ish cadence ~4–12 trades/sec (exponential inter-arrival)
      const wait = clamp(-Math.log(1 - Math.random()) * 120, 30, 420);
      genTimerRef.current = window.setTimeout(tick, wait);
    };
    genTimerRef.current = window.setTimeout(tick, 180);
    return () => {
      mountedRef.current = false;
      if (genTimerRef.current !== null) {
        window.clearTimeout(genTimerRef.current);
        genTimerRef.current = null;
      }
    };
  }, []);

  // ── throttled chrome flush + velocity → tone brightness ───────────────────────
  useEffect(() => {
    let prevCount = 0;
    let prevT = performance.now();
    const id = window.setInterval(() => {
      if (!mountedRef.current) return;
      setRecent(recentRef.current.slice(0, RECENT_MAX));
      setVelReadout(velRef.current);
      const now = performance.now();
      const dt = (now - prevT) / 1000;
      const dc = tradeCountRef.current - prevCount;
      prevT = now;
      prevCount = tradeCountRef.current;
      if (dt > 0) setRate(dc / dt);

      // rising market opens the lowpass (brighter), falling closes it (darker)
      const ctx = ctxRef.current;
      const tone = toneRef.current;
      if (ctx && tone) {
        const cutoff = 900 + ((velRef.current + 1) / 2) * 5600;
        tone.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.35);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // ── build + run the three.js river (always on, even before Begin) ─────────────
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
      // No WebGL — the audio + DOM ticker carry the piece. Nothing to build.
      return;
    }

    let w = mount.clientWidth || window.innerWidth;
    let h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080605); // warm near-black
    scene.fog = new THREE.FogExp2(0x080605, 0.028);

    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
    camera.position.set(0, 0, 13);
    camera.lookAt(0, 0, 0);

    const disposables: Array<{ dispose: () => void }> = [];

    // warm radial backdrop glow (pulses with the master analyser)
    const glowTex = makeRadialTexture([
      [0, "rgba(150,95,35,0.5)"],
      [0.42, "rgba(80,45,70,0.26)"],
      [1, "rgba(8,6,5,0)"],
    ]);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(52, 52, 1);
    glow.position.set(0, 0, -9);
    glow.renderOrder = -10;
    scene.add(glow);
    disposables.push(glowTex, glowMat);

    // a soft round dot texture shared by every trade glyph (money-as-light)
    const dotTex = makeRadialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.25, "rgba(255,240,215,0.9)"],
      [1, "rgba(255,220,180,0)"],
    ]);
    disposables.push(dotTex);

    // faint warm dust drifting horizontally — the ambient torrent
    const DUST = 800;
    const dpos = new Float32Array(DUST * 3);
    const dcol = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      dpos[i * 3] = (Math.random() - 0.5) * 44;
      dpos[i * 3 + 1] = (Math.random() - 0.5) * 22;
      dpos[i * 3 + 2] = -2 - Math.random() * 22;
      const warm = 0.3 + Math.random() * 0.4;
      dcol[i * 3] = warm;
      dcol[i * 3 + 1] = warm * 0.62;
      dcol[i * 3 + 2] = warm * 0.42;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    dustGeo.setAttribute("color", new THREE.BufferAttribute(dcol, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.05,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);
    disposables.push(dustGeo, dustMat);

    // three faint lane rails so the river reads as three products flowing
    for (const p of PRODUCTS) {
      const railMat = new THREE.LineBasicMaterial({
        color: new THREE.Color().setHSL(p.hue, 0.4, 0.2),
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });
      const railGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-13, p.lane, -3),
        new THREE.Vector3(13, p.lane, -3),
      ]);
      const rail = new THREE.Line(railGeo, railMat);
      scene.add(rail);
      disposables.push(railGeo, railMat);
    }

    // ── glyph pool: reusable dot sprites flowing right → left ────────────────────
    interface Glyph {
      sprite: THREE.Sprite;
      mat: THREE.SpriteMaterial;
      active: boolean;
      vx: number;
      vy: number;
      size: number;
      baseOpacity: number;
    }
    const glyphs: Glyph[] = [];
    for (let i = 0; i < GLYPH_POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: dotTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      disposables.push(mat);
      glyphs.push({ sprite, mat, active: false, vx: 0, vy: 0, size: 1, baseOpacity: 1 });
    }

    const tmpColor = new THREE.Color();

    // launch one glyph from a trade into the river (enters right, drifts left)
    spawnGlyphRef.current = (trade: Trade, sn: number, dev: number, vel: number) => {
      let g: Glyph | null = null;
      for (const cand of glyphs) {
        if (!cand.active) {
          g = cand;
          break;
        }
      }
      if (!g) return; // pool full — trade is heard but not drawn

      const spec = PRODUCT_BY_ID.get(trade.product);
      if (!spec) return;

      // hue warm/bright for buys; dim + toward violet for sells. Rising market
      // lifts overall brightness a touch.
      let hue: number;
      let sat: number;
      let light: number;
      if (trade.side === "buy") {
        hue = spec.hue;
        sat = 0.85;
        light = 0.56 + sn * 0.16;
      } else {
        hue = 0.8; // deep violet
        sat = 0.5;
        light = 0.28 + sn * 0.14;
      }
      light = clamp(light + vel * 0.1, 0.14, 0.82);
      tmpColor.setHSL(hue, sat, light);
      g.mat.color.copy(tmpColor);

      // size by trade size (whales bloom large)
      const size = 0.28 + sn * 1.5;
      g.size = size;
      g.sprite.scale.set(size, size, 1);

      // enter from the right edge; vertical = product lane + price deviation
      g.sprite.position.set(
        13 + Math.random() * 1.5,
        spec.lane + dev * 1.7 + (Math.random() - 0.5) * 0.5,
        -1 - Math.random() * 4,
      );
      g.vx = -(1.5 + Math.random() * 0.9); // drift left
      g.vy = (Math.random() - 0.5) * 0.15;
      g.baseOpacity = trade.side === "buy" ? 0.95 : 0.6;
      g.active = true;
      g.sprite.visible = true;
      g.mat.opacity = 0;
    };

    let raf = 0;
    let prev = performance.now();
    let drift = 0;

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
      const vel = velRef.current;
      const bloom = 0.8 + amp * 0.95;

      // backdrop warms/brightens on a rising market, cools on a falling one
      glow.material.opacity = 0.28 + amp * 0.7 + Math.max(0, vel) * 0.15;
      glow.scale.setScalar(50 + amp * 20);

      // advance glyphs; retire when they exit the left edge
      for (const g of glyphs) {
        if (!g.active) continue;
        g.sprite.position.x += g.vx * dt;
        g.sprite.position.y += g.vy * dt;
        if (g.sprite.position.x < -14) {
          g.active = false;
          g.sprite.visible = false;
          g.mat.opacity = 0;
          continue;
        }
        // fade in on entry, fade out toward the left
        const x = g.sprite.position.x;
        let env = 1;
        if (x > 11) env = clamp((13.5 - x) / 2.5, 0, 1);
        else if (x < -9) env = clamp((x + 14) / 5, 0, 1);
        g.mat.opacity = clamp(g.baseOpacity * env * bloom, 0, 1);
      }

      dust.position.x = ((dust.position.x - dt * 0.6) % 44);
      (dustMat as THREE.PointsMaterial).opacity = 0.45 + amp * 0.35;

      // very slow camera sway
      if (!reduced) drift += dt * 0.05;
      camera.position.set(Math.sin(drift) * 1.1, Math.sin(drift * 0.6) * 0.6, 13);
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
        wsRef.current?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
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
      ? "live · coinbase"
      : feed === "error"
        ? "demo · synthetic tape (socket unavailable)"
        : "demo · synthetic tape";
  const feedClass =
    feed === "live"
      ? "text-foreground"
      : feed === "error"
        ? "text-destructive"
        : "text-muted-foreground";
  const trend = velReadout > 0.06 ? "▲ rising" : velReadout < -0.06 ? "▼ falling" : "→ flat";

  const fmtPrice = (t: Trade) => {
    const p = t.price;
    return p >= 1000
      ? p.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* three.js river */}
      <div
        ref={mountRef}
        className="absolute inset-0 h-dvh touch-none select-none"
        aria-hidden
      />

      {/* WebGL-unavailable fallback: keep the audio + a live DOM ticker */}
      {glError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6">
          <p className="max-w-md text-center text-base text-muted-foreground">
            A 3D view could not open here, so the river is hidden — but the trades
            still sound Karel&rsquo;s piano. Here is the money changing hands right
            now:
          </p>
          <ul className="w-full max-w-md space-y-1 font-mono text-xs text-muted-foreground">
            {recent.map((t, i) => (
              <li key={i} className="flex justify-between gap-3 truncate">
                <span className="truncate text-foreground">
                  {t.side === "buy" ? "▲" : "▼"}{" "}
                  {PRODUCT_BY_ID.get(t.product)?.label ?? t.product}
                </span>
                <span className="shrink-0 text-muted-foreground/60">
                  {t.size.toPrecision(3)} @ {fmtPrice(t)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* always-on status line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 p-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className={feedClass}>{feedLabel}</span>
        <span>{rate.toFixed(1)} trades/s</span>
        <span>{trend}</span>
        {audioOn && <span>take · {trackTitle}</span>}
        {recent[0] && (
          <span className="normal-case tracking-normal">
            {recent[0].side === "buy" ? "▲" : "▼"}{" "}
            {PRODUCT_BY_ID.get(recent[0].product)?.label} {fmtPrice(recent[0])}
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
                17856 · ledger
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                The live market conducts a piano take
              </h1>
              <p className="mt-1 text-base text-muted-foreground">
                Every trade crossing the world&rsquo;s order books right now plays a
                grain of one of Karel&rsquo;s real recordings, and drifts across a
                warm river of money-as-light — buys higher and to the right, sells
                lower and to the left, a rising market lifting and brightening it all.
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
              <ImmersiveHud
                immersive={immersive}
                onToggle={toggle}
                title="Ledger"
                description="A live tape of real market trades granularly re-voices one of Karel's real piano recordings: every trade fires one grain — a short slice of the decoded take — while a half-speed bed of the same take holds underneath. Buys sound higher and pan right, sells lower and left; trade size sets loudness, length and glyph scale; short-term price velocity drifts the whole transpose and brightness. The visual is a river of transaction glyphs, not a chart."
                howTo={[
                  "The river is already alive on a synthetic tape — tap Begin to start Karel's piano and connect the live Coinbase feed.",
                  "Watch the status line: it reads demo · synthetic tape until a real trade arrives, then flips to live · coinbase.",
                  "Each glyph is one trade: warm/bright = buy, dim/violet = sell; larger = bigger size; height = price level within its lane.",
                  "A rising market lifts pitch and opens the tone (brighter); a falling one darkens and drops it.",
                ]}
              />
            </div>
          </div>

          {/* take picker (grouped by collection) */}
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
              {COLLECTIONS.map((c) => (
                <optgroup key={c.name} label={c.name}>
                  {c.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
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

      {/* immersive HUD (pills only) while immersive */}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Ledger"
          description="A live tape of real market trades granularly re-voices one of Karel's real piano recordings: every trade fires one grain of the decoded take, buys higher and panned right, sells lower and left, trade size setting loudness and glyph scale, price velocity drifting the transpose and brightness. A river of money-as-light, not a chart."
          howTo={[
            "Warm/bright glyph = buy, dim/violet = sell; larger = bigger trade; height = price level.",
            "A rising market lifts and brightens; a falling one darkens and drops.",
            "The status line reads demo · synthetic tape or live · coinbase honestly.",
          ]}
        />
      )}

      {!started && !immersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-base text-muted-foreground">
            Press <span className="text-foreground">Begin</span> — the river already
            flows on a synthetic tape; the tap starts Karel&rsquo;s piano and
            connects the live Coinbase trade feed.
          </p>
        </div>
      )}

      {!immersive && (
        <PrototypeNav
          slugs={["17856-ledger", "17792-scriptorium", "17728-overhead", "17616-tremor"]}
        />
      )}
    </main>
  );
}

// ── a soft radial gradient as a canvas texture ─────────────────────────────────
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
