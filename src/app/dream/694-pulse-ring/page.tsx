'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

// ── Pulse Ring ────────────────────────────────────────────────────────────────
// A shared spinning clock. A playhead hand sweeps the ring once per bar; each
// participant drops percussive beads at angular positions for their own "voice".
// Beads with different subdivisions overlay on ONE shared ring → emergent
// polyrhythm / phasing. Only lightweight control events cross BroadcastChannel;
// every client synthesizes audio locally, phase-locked to a shared beat-zero epoch.

const CHANNEL = 'resonance-pulse-ring-694';
const BAR_SECONDS = 2; // one full revolution
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12; // seconds of audio scheduled ahead

// ── Voices: from-scratch tuned percussion ──────────────────────────────────────
type VoiceId = 'tom' | 'clave' | 'bell' | 'rim' | 'shaker';

interface VoiceDef {
  id: VoiceId;
  label: string;
  color: string; // hex tint for beads/owner
}

const VOICES: VoiceDef[] = [
  { id: 'tom', label: 'Low Tom', color: '#fb7185' },
  { id: 'clave', label: 'Woodblock', color: '#fbbf24' },
  { id: 'bell', label: 'High Bell', color: '#22d3ee' },
  { id: 'rim', label: 'Rim', color: '#a78bfa' },
  { id: 'shaker', label: 'Shaker', color: '#34d399' },
];

const VOICE_MAP: Record<VoiceId, VoiceDef> = VOICES.reduce(
  (acc, v) => {
    acc[v.id] = v;
    return acc;
  },
  {} as Record<VoiceId, VoiceDef>,
);

const SUBDIVISIONS = [8, 12, 16];

// ── Shared bead state (conflict-free, last-write-wins) ──────────────────────────
// A bead is keyed by `${voice}:${slot}:${subdivision}` so two voices can share an
// angle. add/remove carry a timestamp; later timestamp wins.
interface Bead {
  voice: VoiceId;
  slot: number; // index within subdivision
  subdivision: number; // number of slots in the ring for this bead
  owner: string; // client id (or ghost id)
  ts: number; // last-write-wins timestamp (epoch ms)
}

function beadKey(b: { voice: VoiceId; slot: number; subdivision: number }): string {
  return `${b.voice}:${b.slot}:${b.subdivision}`;
}

function beadAngle(slot: number, subdivision: number): number {
  // 0 at top (12 o'clock), clockwise
  return (slot / subdivision) * Math.PI * 2 - Math.PI / 2;
}

// ── Control messages over BroadcastChannel ──────────────────────────────────────
type Msg =
  | { t: 'hello'; from: string; voice: VoiceId; epoch: number }
  | { t: 'bye'; from: string }
  | { t: 'present'; from: string; voice: VoiceId }
  | { t: 'request' } // ask peers for full state + epoch
  | { t: 'epoch'; epoch: number } // shared beat-zero (performance.now-aligned absolute ms)
  | { t: 'add'; bead: Bead }
  | { t: 'remove'; key: string; ts: number; from: string };

// ── Audio synthesis: one-shot percussion per voice ──────────────────────────────
function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

function scheduleHit(rig: AudioRig, voice: VoiceId, time: number) {
  const { ctx, master, noise } = rig;
  const out = master;

  if (voice === 'tom') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(165, time);
    osc.frequency.exponentialRampToValueAtTime(70, time + 0.18);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.9, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
    osc.connect(g).connect(out);
    osc.start(time);
    osc.stop(time + 0.4);
    return;
  }

  if (voice === 'clave') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1180, time);
    osc.frequency.exponentialRampToValueAtTime(820, time + 0.04);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.7, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    osc.connect(g).connect(out);
    osc.start(time);
    osc.stop(time + 0.12);
    return;
  }

  if (voice === 'bell') {
    // two slightly detuned partials → metallic shimmer
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.45, time + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
    g.connect(out);
    [2030, 3050].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * (i ? 1.002 : 1), time);
      osc.connect(g);
      osc.start(time);
      osc.stop(time + 0.55);
    });
    return;
  }

  if (voice === 'rim') {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(bp).connect(g).connect(out);
    src.start(time);
    src.stop(time + 0.06);
    return;
  }

  // shaker
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(0.32, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
  src.connect(hp).connect(g).connect(out);
  src.start(time);
  src.stop(time + 0.1);
}

// ── Visual transient state ──────────────────────────────────────────────────────
interface Flash {
  voice: VoiceId;
  slot: number;
  subdivision: number;
  born: number; // performance.now
}

interface RunState {
  beads: Map<string, Bead>;
  flashes: Flash[];
  epoch: number; // shared beat-zero, in performance.now ms space
  // scheduler bookkeeping: last scheduled bar index per nothing; we track next time
  nextNoteTime: number; // audioCtx time of the next scan boundary
  scanResolution: number; // smallest subdivision step we scan, in bars
  lastScanFrac: number; // last fractional bar position scanned
}

function clientId(): string {
  return 'c' + Math.random().toString(36).slice(2, 8);
}

export default function PulseRing() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<AudioRig | null>(null);
  const droneRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const chanRef = useRef<BroadcastChannel | null>(null);
  const meRef = useRef<string>(clientId());
  const myVoiceRef = useRef<VoiceId>('tom');
  const mySubRef = useRef<number>(16);
  const runRef = useRef<RunState>({
    beads: new Map(),
    flashes: [],
    epoch: 0,
    nextNoteTime: 0,
    scanResolution: 0,
    lastScanFrac: -1,
  });
  const rafRef = useRef<number>(0);
  const schedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastInteractRef = useRef<number>(0);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ghostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realPeersRef = useRef<Set<string>>(new Set());

  const [started, setStarted] = useState(false);
  const [myVoice, setMyVoice] = useState<VoiceId>('tom');
  const [mySub, setMySub] = useState<number>(16);
  const [playerCount, setPlayerCount] = useState(1);
  const [hasRealPeer, setHasRealPeer] = useState(false);
  const [droneOn, setDroneOn] = useState(true);
  const [beadCount, setBeadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // keep refs in sync with UI selections
  useEffect(() => {
    myVoiceRef.current = myVoice;
  }, [myVoice]);
  useEffect(() => {
    mySubRef.current = mySub;
  }, [mySub]);

  const broadcast = useCallback((m: Msg) => {
    try {
      chanRef.current?.postMessage(m);
    } catch {
      /* channel closed; ignore */
    }
  }, []);

  // add/remove with last-write-wins; returns whether state changed
  const applyAdd = useCallback((bead: Bead) => {
    const run = runRef.current;
    const k = beadKey(bead);
    const cur = run.beads.get(k);
    if (!cur || bead.ts >= cur.ts) {
      run.beads.set(k, bead);
      setBeadCount(run.beads.size);
    }
  }, []);

  const applyRemove = useCallback((key: string, ts: number) => {
    const run = runRef.current;
    const cur = run.beads.get(key);
    if (cur && ts >= cur.ts) {
      run.beads.delete(key);
      setBeadCount(run.beads.size);
    }
  }, []);

  const markInteract = useCallback(() => {
    lastInteractRef.current = performance.now();
  }, []);

  const addMyBead = useCallback(
    (voice: VoiceId, slot: number, subdivision: number, owner: string) => {
      const bead: Bead = { voice, slot, subdivision, owner, ts: Date.now() };
      applyAdd(bead);
      broadcast({ t: 'add', bead });
    },
    [applyAdd, broadcast],
  );

  const removeBead = useCallback(
    (key: string, owner: string) => {
      const ts = Date.now();
      applyRemove(key, ts);
      broadcast({ t: 'remove', key, ts, from: owner });
    },
    [applyRemove, broadcast],
  );

  // ── Ghost players: complementary subdivisions for a living solo demo ──────────
  const spawnGhosts = useCallback(() => {
    if (hasRealPeer) return;
    // Ghost A: a 12-slot bell timeline (gankogui-style), Ghost B: 8-slot tom pulse.
    const gA = 'ghostA';
    const gB = 'ghostB';
    const seed: Bead[] = [
      // West-African 12/8 bell timeline (standard pattern): slots 0,2,3,5,7,8,10
      ...[0, 2, 3, 5, 7, 8, 10].map((slot) => ({
        voice: 'bell' as VoiceId,
        slot,
        subdivision: 12,
        owner: gA,
        ts: Date.now(),
      })),
      // a steady low pulse on 8
      ...[0, 4].map((slot) => ({
        voice: 'tom' as VoiceId,
        slot,
        subdivision: 8,
        owner: gB,
        ts: Date.now(),
      })),
      // shaker drive on 16
      ...[2, 6, 10, 14].map((slot) => ({
        voice: 'shaker' as VoiceId,
        slot,
        subdivision: 16,
        owner: gB,
        ts: Date.now(),
      })),
    ];
    seed.forEach((b) => applyAdd(b));
  }, [hasRealPeer, applyAdd]);

  // remove ghost beads when a real peer arrives
  const clearGhosts = useCallback(() => {
    const run = runRef.current;
    let changed = false;
    for (const [k, b] of run.beads) {
      if (b.owner === 'ghostA' || b.owner === 'ghostB') {
        run.beads.delete(k);
        changed = true;
      }
    }
    if (changed) setBeadCount(run.beads.size);
  }, []);

  // ── Start everything inside the first gesture (iOS-safe) ──────────────────────
  const start = useCallback(() => {
    if (started) return;
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      setError('Web Audio is unavailable in this browser.');
      return;
    }
    void ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    master.connect(lp).connect(comp).connect(ctx.destination);

    const rig: AudioRig = { ctx, master, noise: makeNoiseBuffer(ctx, 1) };
    rigRef.current = rig;

    // optional drone root (A) under the groove for body
    const droneOsc = ctx.createOscillator();
    const droneGain = ctx.createGain();
    droneOsc.type = 'sawtooth';
    droneOsc.frequency.value = 55; // A1
    droneGain.gain.value = 0;
    const droneLp = ctx.createBiquadFilter();
    droneLp.type = 'lowpass';
    droneLp.frequency.value = 220;
    droneOsc.connect(droneLp).connect(droneGain).connect(master);
    droneOsc.start();
    droneRef.current = { osc: droneOsc, gain: droneGain };
    droneGain.gain.setTargetAtTime(droneOn ? 0.09 : 0, ctx.currentTime, 0.5);

    // shared epoch in performance.now ms space; aligned to bar boundary.
    const run = runRef.current;
    run.epoch = performance.now();
    run.scanResolution = 1 / 48; // scan at 48 steps/bar (covers 8,12,16)
    run.lastScanFrac = -1;

    // ── BroadcastChannel control plane ─────────────────────────────────────────
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const chan = new BroadcastChannel(CHANNEL);
        chanRef.current = chan;
        chan.onmessage = (ev: MessageEvent<Msg>) => {
          const m = ev.data;
          if (!m || typeof m !== 'object') return;
          switch (m.t) {
            case 'hello': {
              if (m.from === meRef.current) return;
              if (!realPeersRef.current.has(m.from)) {
                realPeersRef.current.add(m.from);
                clearGhosts();
                setHasRealPeer(true);
                setPlayerCount(realPeersRef.current.size + 1);
              }
              // newcomer: share our epoch + full state so they align
              broadcast({ t: 'epoch', epoch: run.epoch });
              for (const b of run.beads.values()) {
                if (b.owner !== 'ghostA' && b.owner !== 'ghostB') broadcast({ t: 'add', bead: b });
              }
              broadcast({ t: 'present', from: meRef.current, voice: myVoiceRef.current });
              break;
            }
            case 'present': {
              if (m.from === meRef.current) return;
              if (!realPeersRef.current.has(m.from)) {
                realPeersRef.current.add(m.from);
                clearGhosts();
                setHasRealPeer(true);
              }
              setPlayerCount(realPeersRef.current.size + 1);
              break;
            }
            case 'bye': {
              if (realPeersRef.current.delete(m.from)) {
                setPlayerCount(realPeersRef.current.size + 1);
                if (realPeersRef.current.size === 0) {
                  setHasRealPeer(false);
                }
                // drop that peer's beads
                for (const [k, b] of run.beads) {
                  if (b.owner === m.from) run.beads.delete(k);
                }
                setBeadCount(run.beads.size);
              }
              break;
            }
            case 'request': {
              broadcast({ t: 'epoch', epoch: run.epoch });
              for (const b of run.beads.values()) {
                if (b.owner !== 'ghostA' && b.owner !== 'ghostB') broadcast({ t: 'add', bead: b });
              }
              break;
            }
            case 'epoch': {
              // adopt the earliest epoch so everyone shares the same beat-zero
              if (m.epoch < run.epoch) run.epoch = m.epoch;
              break;
            }
            case 'add':
              applyAdd(m.bead);
              break;
            case 'remove':
              applyRemove(m.key, m.ts);
              break;
          }
        };
        // announce ourselves and request current state
        broadcast({ t: 'hello', from: meRef.current, voice: myVoiceRef.current, epoch: run.epoch });
        broadcast({ t: 'request' });
      }
    } catch {
      // No BroadcastChannel → fully solo (ghosts only). Never throw.
      chanRef.current = null;
    }

    // ghosts join if nobody answers within 3s
    ghostTimerRef.current = setTimeout(() => {
      if (!hasRealPeer && realPeersRef.current.size === 0) spawnGhosts();
    }, 3000);

    // ── Look-ahead scheduler ────────────────────────────────────────────────────
    run.nextNoteTime = ctx.currentTime + 0.05;
    const tick = () => {
      const rg = rigRef.current;
      if (!rg) return;
      const audio = rg.ctx;
      // for each subdivision step inside the look-ahead window, fire matching beads
      while (run.nextNoteTime < audio.currentTime + SCHEDULE_AHEAD) {
        const t = run.nextNoteTime;
        // map audio-time -> bar fraction using epoch in perf.now space.
        // anchor: at audio.currentTime, perf.now ~= performance.now(); we keep a
        // running mapping by sampling both clocks once here.
        const perfNow = performance.now();
        const audioNow = audio.currentTime;
        const tPerf = perfNow + (t - audioNow) * 1000; // perf.now-equivalent of audio time t
        const barFrac = (((tPerf - run.epoch) / 1000 / BAR_SECONDS) % 1 + 1) % 1;
        // determine which subdivision slots land on this scan step
        const step = run.scanResolution;
        const prevFrac = (barFrac - step + 1) % 1;
        for (const b of run.beads.values()) {
          const slotFrac = b.slot / b.subdivision;
          // did the scan boundary just cross this slot?
          let crossed = false;
          if (prevFrac < barFrac) {
            crossed = slotFrac > prevFrac && slotFrac <= barFrac;
          } else {
            crossed = slotFrac > prevFrac || slotFrac <= barFrac;
          }
          if (crossed) {
            scheduleHit(rg, b.voice, t);
            run.flashes.push({ voice: b.voice, slot: b.slot, subdivision: b.subdivision, born: tPerf });
          }
        }
        run.nextNoteTime += step * BAR_SECONDS;
      }
    };
    schedTimerRef.current = setInterval(tick, LOOKAHEAD_MS);

    // ── auto-demo: ~2.5s idle → evolve the pattern ───────────────────────────────
    lastInteractRef.current = performance.now();
    autoTimerRef.current = setInterval(() => {
      const idle = performance.now() - lastInteractRef.current;
      if (idle < 2500) return;
      const r = runRef.current;
      const mine: Bead[] = [];
      for (const b of r.beads.values()) if (b.owner === meRef.current) mine.push(b);
      if (mine.length > 5 || (mine.length > 0 && Math.random() < 0.4)) {
        const victim = mine[Math.floor(Math.random() * mine.length)];
        removeBead(beadKey(victim), meRef.current);
      } else {
        const sub = mySubRef.current;
        const slot = Math.floor(Math.random() * sub);
        addMyBead(myVoiceRef.current, slot, sub, meRef.current);
      }
    }, 1100);

    setStarted(true);
  }, [
    started,
    droneOn,
    broadcast,
    applyAdd,
    applyRemove,
    clearGhosts,
    spawnGhosts,
    hasRealPeer,
    addMyBead,
    removeBead,
  ]);

  // toggle drone live
  useEffect(() => {
    const d = droneRef.current;
    const rig = rigRef.current;
    if (d && rig) d.gain.gain.setTargetAtTime(droneOn ? 0.09 : 0, rig.ctx.currentTime, 0.4);
  }, [droneOn]);

  // ── Canvas pointer → add / remove a bead at the tapped angle ──────────────────
  const onCanvasPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!started) return;
      markInteract();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const px = e.clientX - rect.left - cx;
      const py = e.clientY - rect.top - cy;
      const dist = Math.hypot(px, py);
      const R = Math.min(rect.width, rect.height) * 0.42;
      if (dist < R * 0.35 || dist > R * 1.15) return; // outside the ring band
      // angle from top, clockwise, in [0,1)
      let a = Math.atan2(py, px) + Math.PI / 2;
      a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const frac = a / (Math.PI * 2);
      const sub = mySubRef.current;
      const slot = Math.round(frac * sub) % sub;
      const voice = myVoiceRef.current;
      const k = beadKey({ voice, slot, subdivision: sub });
      const existing = runRef.current.beads.get(k);
      if (existing && existing.owner === meRef.current) {
        removeBead(k, meRef.current);
      } else {
        addMyBead(voice, slot, sub, meRef.current);
      }
    },
    [started, markInteract, addMyBead, removeBead],
  );

  // ── Render loop (single rAF, mutates via refs) ────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    let raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const run = runRef.current;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.42;
      const now = performance.now();

      ctx2d.clearRect(0, 0, w, h);
      // background vignette
      const bg = ctx2d.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.6);
      bg.addColorStop(0, '#13111d');
      bg.addColorStop(1, '#07060c');
      ctx2d.fillStyle = bg;
      ctx2d.fillRect(0, 0, w, h);

      const barFrac = run.epoch
        ? ((((now - run.epoch) / 1000 / BAR_SECONDS) % 1) + 1) % 1
        : 0;

      // subdivision tick guides for the active subdivision
      const sub = mySubRef.current;
      ctx2d.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx2d.lineWidth = 1;
      for (let i = 0; i < sub; i++) {
        const ang = beadAngle(i, sub);
        ctx2d.beginPath();
        ctx2d.moveTo(cx + Math.cos(ang) * R * 0.86, cy + Math.sin(ang) * R * 0.86);
        ctx2d.lineTo(cx + Math.cos(ang) * R * 1.0, cy + Math.sin(ang) * R * 1.0);
        ctx2d.stroke();
      }

      // main ring
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, R, 0, Math.PI * 2);
      ctx2d.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx2d.lineWidth = 2;
      ctx2d.stroke();

      // beads
      for (const b of run.beads.values()) {
        const ang = beadAngle(b.slot, b.subdivision);
        // layer beads by subdivision so phasing reads visually
        const layer = b.subdivision === 8 ? 0.72 : b.subdivision === 12 ? 0.86 : 1.0;
        const bx = cx + Math.cos(ang) * R * layer;
        const by = cy + Math.sin(ang) * R * layer;
        const col = VOICE_MAP[b.voice].color;
        ctx2d.beginPath();
        ctx2d.arc(bx, by, 7, 0, Math.PI * 2);
        ctx2d.fillStyle = col;
        ctx2d.globalAlpha = 0.9;
        ctx2d.fill();
        ctx2d.globalAlpha = 1;
        // soft halo
        const halo = ctx2d.createRadialGradient(bx, by, 0, bx, by, 16);
        halo.addColorStop(0, col + 'aa');
        halo.addColorStop(1, col + '00');
        ctx2d.fillStyle = halo;
        ctx2d.beginPath();
        ctx2d.arc(bx, by, 16, 0, Math.PI * 2);
        ctx2d.fill();
      }

      // flashes (ripples when a bead fires)
      run.flashes = run.flashes.filter((f) => now - f.born < 520);
      for (const f of run.flashes) {
        const age = (now - f.born) / 520;
        const ang = beadAngle(f.slot, f.subdivision);
        const layer = f.subdivision === 8 ? 0.72 : f.subdivision === 12 ? 0.86 : 1.0;
        const bx = cx + Math.cos(ang) * R * layer;
        const by = cy + Math.sin(ang) * R * layer;
        const col = VOICE_MAP[f.voice].color;
        ctx2d.beginPath();
        ctx2d.arc(bx, by, 8 + age * 26, 0, Math.PI * 2);
        ctx2d.strokeStyle = col;
        ctx2d.globalAlpha = (1 - age) * 0.8;
        ctx2d.lineWidth = 3 * (1 - age) + 0.5;
        ctx2d.stroke();
        ctx2d.globalAlpha = 1;
      }

      // sweeping playhead hand
      const handAng = beadAngle(0, 1) + barFrac * Math.PI * 2;
      const hx = cx + Math.cos(handAng) * R * 1.05;
      const hy = cy + Math.sin(handAng) * R * 1.05;
      ctx2d.beginPath();
      ctx2d.moveTo(cx, cy);
      ctx2d.lineTo(hx, hy);
      ctx2d.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx2d.lineWidth = 2.5;
      ctx2d.stroke();
      // hand glow tip
      const tip = ctx2d.createRadialGradient(hx, hy, 0, hx, hy, 22);
      tip.addColorStop(0, 'rgba(255,255,255,0.9)');
      tip.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2d.fillStyle = tip;
      ctx2d.beginPath();
      ctx2d.arc(hx, hy, 22, 0, Math.PI * 2);
      ctx2d.fill();

      // center hub
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx2d.fillStyle = 'rgba(255,255,255,0.7)';
      ctx2d.fill();

      raf = requestAnimationFrame(draw);
      rafRef.current = raf;
    };
    raf = requestAnimationFrame(draw);
    rafRef.current = raf;

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // ── Full teardown on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    const me = meRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (schedTimerRef.current) clearInterval(schedTimerRef.current);
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
      try {
        chanRef.current?.postMessage({ t: 'bye', from: me } satisfies Msg);
        chanRef.current?.close();
      } catch {
        /* ignore */
      }
      try {
        droneRef.current?.osc.stop();
      } catch {
        /* already stopped */
      }
      const rig = rigRef.current;
      if (rig) void rig.ctx.close();
    };
  }, []);

  const badge = hasRealPeer ? (
    <span className="rounded-full bg-violet-500/20 px-3 py-1 font-mono text-base text-violet-300">
      👥 {playerCount} players on the ring
    </span>
  ) : (
    <span className="rounded-full bg-violet-500/20 px-3 py-1 font-mono text-base text-violet-300">
      playing solo · 🤖 ghost players
    </span>
  );

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-[#07060c] text-foreground">
      <a
        href="/dream/694-pulse-ring/README.md"
        className="absolute right-4 top-4 z-10 font-mono text-base text-muted-foreground underline decoration-dotted hover:text-foreground"
      >
        Read the design notes
      </a>

      <header className="w-full max-w-3xl px-6 pt-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Pulse Ring</h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
          One spinning clock, shared by everyone. Drop rhythmic beads onto the rotating ring; with
          different subdivisions per player, polyrhythm emerges from the group, not one player.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">{badge}</div>
      </header>

      {error && (
        <p className="mt-6 font-mono text-base text-violet-300" role="alert">
          {error}
        </p>
      )}

      <section className="relative mt-6 aspect-square w-full max-w-[560px] px-4">
        <canvas
          ref={canvasRef}
          onPointerDown={onCanvasPointer}
          className="h-full w-full touch-none rounded-2xl"
          aria-label="Shared pulse ring. Tap on the ring to add or remove a bead for your voice."
        />
        {!started && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <button
              onClick={start}
              className="rounded-2xl bg-card px-8 py-4 text-xl font-semibold text-black shadow-lg shadow-border transition hover:bg-accent"
            >
              ▶ Start the ring
            </button>
          </div>
        )}
      </section>

      {started && (
        <section className="mt-6 w-full max-w-2xl px-6 pb-16">
          <div className="flex flex-wrap items-end justify-center gap-6">
            <div>
              <p className="mb-2 font-mono text-base text-muted-foreground">Your voice</p>
              <div className="flex flex-wrap gap-2">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      markInteract();
                      setMyVoice(v.id);
                    }}
                    className="rounded-xl px-4 py-2.5 text-base font-medium transition"
                    style={{
                      background: myVoice === v.id ? v.color : 'rgba(255,255,255,0.08)',
                      color: myVoice === v.id ? '#000' : 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 font-mono text-base text-muted-foreground">Your subdivision</p>
              <div className="flex gap-2">
                {SUBDIVISIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      markInteract();
                      setMySub(s);
                    }}
                    className="min-w-[44px] rounded-xl px-4 py-2.5 text-base font-medium transition"
                    style={{
                      background: mySub === s ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.08)',
                      color: mySub === s ? '#000' : 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 font-mono text-base text-muted-foreground">Drone</p>
              <button
                onClick={() => {
                  markInteract();
                  setDroneOn((d) => !d);
                }}
                className="rounded-xl px-4 py-2.5 text-base font-medium transition"
                style={{
                  background: droneOn ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.08)',
                  color: droneOn ? '#000' : 'rgba(255,255,255,0.85)',
                }}
              >
                {droneOn ? 'on' : 'off'}
              </button>
            </div>
          </div>

          <p className="mt-6 text-center text-base text-muted-foreground">
            Tap the ring to drop a bead for your voice; tap your own bead to remove it. Open a second
            tab to add a second player. {beadCount} beads live on the ring.
          </p>
        </section>
      )}
    </main>
  );
}
