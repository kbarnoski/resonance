"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16608-longvigil — "the sediment wall"
//
// An all-night venue INSTALLATION for a projector: a calm, hands-off wall that
// plays Karel's catalog forever and slowly accretes a geological cross-section
// of everything it has played. Each finished track leaves a persistent stratum,
// keyed to that track's harmony, and the whole night compacts into one visible
// record — so the wall at hour 3 is the SUM of the night, not a loop. The record
// is written to localStorage and survives a kiosk reboot.
//
// Audio is ONLY Karel's real recordings (loadRealTrackBuffer). No synthesis of
// any kind. Everything routes through createSafeMaster. Slow luminance drift
// only — no strobe, no flicker, no noise/grain overlay.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  pitchClassHue,
  type TrackAnalysis,
} from "../_shared/trackAnalysis";
import { createSafeMaster } from "../_shared/visionary/safeMaster";

// ── tunables ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "longvigil.night.v1";
const CROSSFADE_S = 6; // equal-power cross between tracks
const DEFAULT_DWELL_S = 100; // hold per track before crossing
const MIN_DWELL_S = 30;
const MAX_DWELL_S = 300;
const TRACK_GAIN = 0.92;
const UNIT_PX = 26; // pixels per unit of stratum "weight"
const MAX_STRATA = 240; // cap the remembered record (visual compaction handles the rest)
const MIN_DEPOSIT_S = 3; // don't deposit a stratum for a track that barely played
const CONTROLS_HIDE_MS = 4000;
const NOTE_DENSITY_REF = 6; // notes/sec that reads as "busy"

// ── persisted stratum descriptor ─────────────────────────────────────────────
interface Stratum {
  name: string;
  hue: number; // 0..360
  sat: number; // 0..1
  light: number; // 0..1
  minorRatio: number;
  density: number;
  weight: number; // relative thickness
  bands: number; // fine internal banding count
  seed: number;
  ts: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// deterministic per-stratum PRNG so banding is stable across redraws + reboots
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Map a track's harmony to a mineral/oxide stratum. Handles null/sparse analysis.
function makeStratum(title: string, a: TrackAnalysis | null): Stratum {
  const chords = a?.chords ?? [];
  let x = 0;
  let y = 0;
  let minor = 0;
  let valid = 0;
  for (const c of chords) {
    const r = chordRoot(c.chord);
    if (r == null) continue;
    valid++;
    const rad = (pitchClassHue(r) * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
    if (chordIsMinor(c.chord)) minor++;
  }
  const baseHue =
    valid > 0
      ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
      : hashString(title) % 360;
  const minorRatio = valid > 0 ? minor / valid : 0.35;

  const notes = a?.notes ?? [];
  let density = 0;
  if (notes.length > 1) {
    const span = notes[notes.length - 1].time - notes[0].time;
    density = span > 0 ? notes.length / span : notes.length;
  }
  const dn = clamp(density / NOTE_DENSITY_REF, 0, 1.4);

  // minor keys read cooler + more muted; dense passages read a touch brighter.
  const sat = clamp(0.5 - minorRatio * 0.22 + dn * 0.05, 0.18, 0.52);
  const light = clamp(0.34 - minorRatio * 0.1 + dn * 0.03, 0.16, 0.4);
  const hue = (baseHue + minorRatio * 18) % 360; // nudge toward cool when minor

  return {
    name: title,
    hue,
    sat,
    light,
    minorRatio,
    density,
    weight: 0.6 + dn * 1.2,
    bands: Math.round(3 + dn * 7),
    seed: hashString(title + "|" + Math.round(density * 10)),
    ts: Date.now(),
  };
}

// ── equal-power crossfade curves ──────────────────────────────────────────────
const CURVE_N = 64;
const FADE_IN = new Float32Array(CURVE_N);
const FADE_OUT = new Float32Array(CURVE_N);
for (let i = 0; i < CURVE_N; i++) {
  const t = i / (CURVE_N - 1);
  FADE_IN[i] = Math.sin((t * Math.PI) / 2);
  FADE_OUT[i] = Math.cos((t * Math.PI) / 2);
}
function scaleCurve(
  base: Float32Array<ArrayBuffer>,
  k: number,
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) out[i] = Math.max(0.0001, base[i] * k);
  return out;
}

// ── canvas drawing ────────────────────────────────────────────────────────────
function drawStratum(
  g: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  w: number,
  h: number,
  st: Stratum,
  live: boolean,
  liveLight: number,
) {
  if (h <= 0.5) return;
  const light = live ? liveLight : st.light;
  // ore-vein vertical gradient: darker at the top of the band, warmer below.
  const grad = g.createLinearGradient(0, yTop, 0, yTop + h);
  grad.addColorStop(
    0,
    `hsl(${st.hue} ${st.sat * 100}% ${light * 100 * 0.82}%)`,
  );
  grad.addColorStop(
    0.55,
    `hsl(${st.hue} ${st.sat * 100}% ${light * 100}%)`,
  );
  grad.addColorStop(
    1,
    `hsl(${(st.hue + 6) % 360} ${st.sat * 100 * 0.92}% ${light * 100 * 1.12}%)`,
  );
  g.fillStyle = grad;
  g.fillRect(x, yTop, w, h);

  // fine internal banding — deterministic, seeded, NOT noise. Sediment layering.
  const rng = makeRng(st.seed);
  const bands = Math.max(2, st.bands);
  for (let b = 0; b < bands; b++) {
    const fy = yTop + (b / bands + rng() * (0.4 / bands)) * h;
    const bh = Math.max(1, (h / bands) * (0.12 + rng() * 0.22));
    const jit = (rng() - 0.5) * 0.16;
    const bl = clamp(light + jit, 0.06, 0.6);
    g.fillStyle = `hsla(${st.hue} ${st.sat * 100}% ${bl * 100}% / ${
      0.28 + rng() * 0.2
    })`;
    g.fillRect(x, fy, w, bh);
  }

  // bedding-plane seam at the top edge (darker line between layers).
  g.fillStyle = `hsla(${st.hue} ${st.sat * 60}% ${light * 100 * 0.4}% / 0.55)`;
  g.fillRect(x, yTop, w, 1.5);
}

// ── component ─────────────────────────────────────────────────────────────────
interface CurrentEntry {
  source: AudioBufferSourceNode;
  gain: GainNode;
  id: string;
  title: string;
  stratum: Stratum;
  startedAt: number;
}

interface EngineHandle {
  next: () => void;
  prev: () => void;
  clear: () => void;
}

export default function LongVigilPage() {
  const [started, setStarted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [position, setPosition] = useState({ i: 0, n: REAL_TRACKS.length });
  const [dwell, setDwell] = useState(DEFAULT_DWELL_S);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [strataCount, setStrataCount] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strataRef = useRef<Stratum[]>([]);
  const dwellRef = useRef(DEFAULT_DWELL_S);
  const engineRef = useRef<EngineHandle | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  // keep the audio dwell in sync with the slider without restarting the engine
  useEffect(() => {
    dwellRef.current = dwell;
  }, [dwell]);

  // ── restore a night in progress on mount ────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Stratum[];
        if (Array.isArray(parsed)) {
          strataRef.current = parsed.filter(
            (s) => s && typeof s.hue === "number",
          );
          setSavedCount(strataRef.current.length);
          setStrataCount(strataRef.current.length);
        }
      }
    } catch {
      /* localStorage may be unavailable / corrupt — start a fresh night */
    }
  }, []);

  const persist = useCallback(() => {
    try {
      const trimmed = strataRef.current.slice(-MAX_STRATA);
      strataRef.current = trimmed;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* quota / private mode — the wall keeps running from memory */
    }
    setStrataCount(strataRef.current.length);
  }, []);

  // ── reveal / auto-hide the operator strip ───────────────────────────────────
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  const toggleFullscreen = useCallback(() => {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    } catch {
      /* fullscreen not permitted in this context */
    }
  }, []);

  // ── the installation engine (audio + memory), started by a real gesture ─────
  useEffect(() => {
    if (!started) return;

    let destroyed = false;
    let ctx: AudioContext | null = null;
    let master: ReturnType<typeof createSafeMaster> | null = null;
    let raf = 0;

    const active = new Set<CurrentEntry>();
    let current: CurrentEntry | null = null;
    let order: number[] = [];
    let pos = -1;
    let runToken = 0;
    let advanceTimer: number | null = null;
    let failStreak = 0;
    let preloadId: string | null = null;
    let preloadBuf: AudioBuffer | null = null;

    // live band-split state (smoothed — slow drift only)
    let smLow = 0;
    let smMid = 0;
    let smHigh = 0;
    let liveHue = 34;
    let liveSat = 0.42;
    let liveTitle = "";
    const liveSeed = 987654321;

    // ── memory ────────────────────────────────────────────────────────────────
    function deposit(entry: CurrentEntry | null) {
      if (!entry || !ctx) return;
      if (ctx.currentTime - entry.startedAt < MIN_DEPOSIT_S) return;
      strataRef.current.push(entry.stratum);
      persist();
    }

    // ── source lifecycle ───────────────────────────────────────────────────────
    function stopEntry(entry: CurrentEntry, when: number) {
      try {
        entry.source.stop(when);
      } catch {
        /* already stopped */
      }
    }

    // ── advance to a position in the shuffled order ─────────────────────────────
    async function playAt(orderPos: number) {
      if (destroyed || !ctx || !master) return;
      const myToken = ++runToken;
      if (advanceTimer) {
        window.clearTimeout(advanceTimer);
        advanceTimer = null;
      }

      const n = order.length;
      const idx = order[((orderPos % n) + n) % n];
      const track = REAL_TRACKS[idx];

      let buffer: AudioBuffer;
      try {
        if (preloadBuf && preloadId === track.id) {
          buffer = preloadBuf;
        } else {
          const loaded = await loadRealTrackBuffer(ctx, track.id);
          buffer = loaded.buffer;
        }
      } catch {
        if (myToken !== runToken || destroyed) return;
        failStreak++;
        if (failStreak > n) {
          setAudioFailed(true); // whole catalog unreachable — wall keeps drawing
          return;
        }
        void playAt(orderPos + 1);
        return;
      }
      if (myToken !== runToken || destroyed || !ctx || !master) return;
      failStreak = 0;
      pos = orderPos;
      preloadBuf = null;
      preloadId = null;

      const now = ctx.currentTime;

      // incoming nodes → per-track gain → safe master (NEVER ctx.destination)
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(master.input);

      const entry: CurrentEntry = {
        source,
        gain,
        id: track.id,
        title: track.title,
        stratum: makeStratum(track.title, null),
        startedAt: now,
      };
      active.add(entry);
      source.onended = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          /* ctx closing */
        }
        active.delete(entry);
      };

      source.start(now);
      try {
        gain.gain.setValueCurveAtTime(
          scaleCurve(FADE_IN, TRACK_GAIN),
          now,
          CROSSFADE_S,
        );
      } catch {
        gain.gain.value = TRACK_GAIN;
      }

      // cross the outgoing track out + write it into the geological record
      const outgoing = current;
      if (outgoing) {
        try {
          outgoing.gain.gain.cancelScheduledValues(now);
          outgoing.gain.gain.setValueAtTime(
            outgoing.gain.gain.value,
            now,
          );
          outgoing.gain.gain.setValueCurveAtTime(
            scaleCurve(FADE_OUT, TRACK_GAIN),
            now,
            CROSSFADE_S,
          );
        } catch {
          try {
            outgoing.gain.gain.value = 0.0001;
          } catch {
            /* ignore */
          }
        }
        stopEntry(outgoing, now + CROSSFADE_S + 0.25);
        deposit(outgoing);
      }

      current = entry;
      liveTitle = track.title;
      setPosition({ i: ((orderPos % n) + n) % n, n });

      // enrich the current stratum + live palette once analysis arrives
      loadTrackAnalysis(track.id)
        .then((a) => {
          if (destroyed || current !== entry) return;
          const s = makeStratum(track.title, a);
          entry.stratum = s;
          liveHue = s.hue;
          liveSat = s.sat;
        })
        .catch(() => {
          /* no analysis for this track — placeholder stratum stands */
        });

      // preload the next track's buffer during the dwell
      const nextIdx = order[((orderPos + 1) % n + n) % n];
      const nextTrack = REAL_TRACKS[nextIdx];
      if (nextTrack && nextTrack.id !== track.id) {
        loadRealTrackBuffer(ctx, nextTrack.id)
          .then((l) => {
            if (destroyed) return;
            preloadId = nextTrack.id;
            preloadBuf = l.buffer;
          })
          .catch(() => {
            /* will retry (and skip) at advance time */
          });
      }

      // schedule the crossfade to the next track
      const dwellMs = dwellRef.current * 1000;
      const durMs = buffer.duration * 1000;
      const holdMs = Math.max(
        CROSSFADE_S * 1000,
        Math.min(dwellMs, durMs - CROSSFADE_S * 1000),
      );
      advanceTimer = window.setTimeout(() => {
        if (myToken === runToken && !destroyed) void playAt(orderPos + 1);
      }, holdMs);
    }

    // ── render loop ─────────────────────────────────────────────────────────────
    let freqBuf: Uint8Array<ArrayBuffer> | null = null;

    function draw() {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const g = canvas.getContext("2d");
      if (!g) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const needW = Math.round(W * dpr);
      const needH = Math.round(H * dpr);
      if (canvas.width !== needW || canvas.height !== needH) {
        canvas.width = needW;
        canvas.height = needH;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const t = performance.now() / 1000;

      // live band-split from the safe master analyser (slow, smoothed)
      let energy = 0;
      if (master && freqBuf) {
        master.analyser.getByteFrequencyData(freqBuf);
        const nb = freqBuf.length;
        const loEnd = Math.max(1, Math.floor(nb * 0.08));
        const midEnd = Math.max(loEnd + 1, Math.floor(nb * 0.4));
        let lo = 0;
        let mi = 0;
        let hi = 0;
        for (let i = 0; i < loEnd; i++) lo += freqBuf[i];
        for (let i = loEnd; i < midEnd; i++) mi += freqBuf[i];
        for (let i = midEnd; i < nb; i++) hi += freqBuf[i];
        lo = lo / loEnd / 255;
        mi = mi / (midEnd - loEnd) / 255;
        hi = hi / (nb - midEnd) / 255;
        smLow += (lo - smLow) * 0.04;
        smMid += (mi - smMid) * 0.04;
        smHigh += (hi - smHigh) * 0.04;
        energy = smLow * 0.5 + smMid * 0.35 + smHigh * 0.15;
      } else {
        // no audio: gentle time-based drift so the surface still breathes
        energy = 0.18 + 0.06 * Math.sin(t * 0.25);
      }

      // background: deep, faintly warm void above the sediment
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#07070a");
      bg.addColorStop(0.7, "#0a0908");
      bg.addColorStop(1, "#0d0b09");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      const liveH = Math.max(90, H * 0.16);
      const areaBottom = H - liveH;

      // accumulated strata: newest at the bottom, older pushed up; compact to fit
      const strata = strataRef.current;
      let totalPx = 0;
      for (const s of strata) totalPx += s.weight * UNIT_PX;
      const scale = totalPx > areaBottom ? areaBottom / totalPx : 1;
      let y = areaBottom;
      for (let i = strata.length - 1; i >= 0; i--) {
        const st = strata[i];
        const h = st.weight * UNIT_PX * scale;
        drawStratum(g, 0, y - h, W, h, st, false, st.light);
        y -= h;
        if (y < -60) break;
      }

      // live active surface = the currently-playing track being laid down
      const liveLight = clamp(0.13 + energy * 0.4, 0.1, 0.6);
      const liveStratum: Stratum = {
        name: liveTitle,
        hue: liveHue,
        sat: liveSat,
        light: liveLight,
        minorRatio: 0,
        density: 0,
        weight: 1,
        bands: 6,
        seed: liveSeed,
      } as Stratum;
      drawStratum(g, 0, areaBottom, W, liveH, liveStratum, true, liveLight);

      // luminous, drifting surface line where new sediment meets the air
      const glowA = 0.1 + 0.06 * Math.sin(t * 0.4) + energy * 0.18;
      const glow = g.createLinearGradient(0, areaBottom - 10, 0, areaBottom + 6);
      glow.addColorStop(0, `hsla(${liveHue} 55% 70% / 0)`);
      glow.addColorStop(1, `hsla(${liveHue} 60% 78% / ${clamp(glowA, 0, 0.4)})`);
      g.fillStyle = glow;
      g.fillRect(0, areaBottom - 10, W, 16);

      // the current track title, drawn large + quiet inside the light
      if (liveTitle) {
        const size = Math.min(W * 0.06, liveH * 0.5);
        g.font = `600 ${size}px system-ui, -apple-system, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = `rgba(244,242,238,${clamp(0.14 + energy * 0.12, 0.1, 0.3)})`;
        g.fillText(liveTitle, W / 2, areaBottom + liveH * 0.52);
      }

      // soft vignette to seat the projection
      const vig = g.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.35,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.75,
      );
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.45)");
      g.fillStyle = vig;
      g.fillRect(0, 0, W, H);
    }

    // ── boot the context on the unlocking gesture ───────────────────────────────
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
      master = createSafeMaster(ctx);
      freqBuf = new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount));
      void ctx.resume();
      order = REAL_TRACKS.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      void playAt(0);
    } catch {
      setAudioFailed(true); // audio unavailable — still render the remembered wall
    }

    // even if audio failed, keep the wall drawing
    raf = requestAnimationFrame(draw);

    // ── engine handle for the operator strip ────────────────────────────────────
    engineRef.current = {
      next: () => void playAt(pos + 1),
      prev: () => void playAt(pos - 1),
      clear: () => {
        strataRef.current = [];
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setStrataCount(0);
        setSavedCount(0);
      },
    };

    // ── input listeners ─────────────────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") engineRef.current?.next();
      else if (e.key === "ArrowLeft") engineRef.current?.prev();
      revealControls();
    };
    const onMove = () => revealControls();
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMove);
    document.addEventListener("fullscreenchange", onFsChange);
    revealControls();

    // ── teardown ────────────────────────────────────────────────────────────────
    return () => {
      destroyed = true;
      runToken++;
      if (advanceTimer) window.clearTimeout(advanceTimer);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("fullscreenchange", onFsChange);
      for (const entry of active) {
        try {
          entry.source.stop();
        } catch {
          /* already stopped */
        }
        try {
          entry.source.disconnect();
          entry.gain.disconnect();
        } catch {
          /* ignore */
        }
      }
      active.clear();
      current = null;
      try {
        master?.disconnect();
      } catch {
        /* ignore */
      }
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // ── boot screen (single centered gesture) ───────────────────────────────────
  if (!started) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-background px-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance · installation
        </p>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          The Sediment Wall
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
          An all-night wall that plays Karel&rsquo;s catalog forever and slowly
          accretes a geological record of the night &mdash; each track leaves a
          stratum keyed to its harmony. It remembers across a reboot.
        </p>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="mt-8 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Begin the vigil
        </button>
        {savedCount > 0 && (
          <p className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resuming a night in progress &middot; {savedCount} strata remembered
          </p>
        )}
      </div>
    );
  }

  // ── running installation ─────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {audioFailed && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-md border border-border bg-background/70 px-4 py-2 backdrop-blur-sm">
          <p className="text-sm text-muted-foreground">
            The catalog is unreachable right now &mdash; the wall is holding the
            night it remembers.
          </p>
        </div>
      )}

      {/* operator strip — secondary control, auto-hides */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-500 ${
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background/70 px-4 py-3 backdrop-blur-sm">
          <span className="mr-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {position.i + 1}/{position.n} &middot; {strataCount} strata
          </span>
          <button
            type="button"
            onClick={() => engineRef.current?.prev()}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            &larr; prev
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.next()}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            next &rarr;
          </button>

          <label className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs uppercase tracking-[0.18em]">
              dwell {dwell}s
            </span>
            <input
              type="range"
              min={MIN_DWELL_S}
              max={MAX_DWELL_S}
              step={5}
              value={dwell}
              onChange={(e) => setDwell(Number(e.target.value))}
              className="accent-primary"
            />
          </label>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {isFullscreen ? "exit fullscreen" : "fullscreen"}
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.clear()}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            clear the night
          </button>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              The Sediment Wall
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A hands-off projection that plays Karel&rsquo;s catalog on
                shuffle, forever, holding each piece for a long dwell and
                crossing to the next with a six-second equal-power fade.
              </p>
              <p>
                Every finished track deposits a persistent stratum at the base
                of the wall, pushing older layers up and compacting the whole
                night into one visible cross-section. Each stratum&rsquo;s hue
                comes from the track&rsquo;s chord roots around the circle of
                fifths; minor harmony reads cooler and more muted; note density
                sets its thickness and fine banding. The playing track paints
                the live surface at the floor, its glow drifting slowly with a
                low/mid/high split of the audio &mdash; never a strobe.
              </p>
              <p>
                The record is written to local storage, so a kiosk reboot
                resumes the night rather than starting over.
              </p>
              <p className="text-muted-foreground/80">
                After Brian Eno&rsquo;s <em>77 Million Paintings</em> and{" "}
                <em>Music for Airports</em> &mdash; generative works built to
                evolve over very long timescales and never quite repeat.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
