"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { makeEntropySeed, mulberry32, seedToId } from "./rng";
import { DEGREES, degreeToFreq, makeLaneTimbre, scheduleVoice } from "./synth";

// ── Shared temporal reference (the "Global Metronome", Oda & Fiebrink 2016) ──
// performance.timeOrigin + performance.now() is Unix-ms shared across every tab
// on this machine, so all tabs agree on the SAME grid without a server. (The
// wall-clock global is banned by CI; timeOrigin is not.) 110 BPM, 8th-note ticks.
const BPM = 110;
const TICK_MS = 60000 / BPM / 2; // ≈ 272.7 ms
const sharedNow = () => performance.timeOrigin + performance.now();

/** Next strictly-future grid tick (shared-ms) at/after x. */
function quantizeUp(x: number): number {
  return Math.ceil((x + 0.001) / TICK_MS) * TICK_MS;
}

const CHANNEL = "dream-9640-latencyloom";

// ── Art-layer palette (Canvas2D only — never on UI chrome classNames) ────────
// Clinical high-key: paper ground, thin dark ink. Deliberately NOT warm amber
// and NOT cosmic indigo. Remote lanes are ink-shade nodes; the ONE accent is
// the brand violet (matches the --primary token), reserved for the LOCAL node.
const PAPER = "#f4f3ee";
const PAPER_EDGE = "#e5e4dd";
const EDGE = "#d7d6cf"; // faint network edges
const GRID = "#cbcac2"; // metronome ruler ticks
const INK = "#26252b"; // node ink + labels
const INK_SOFT = "#7b7a82"; // secondary labels
const LANE_SHADES = ["#3b3a42", "#565560", "#6d6c76", "#84838c", "#4a4952", "#5f5e68"];
const ACCENT = "#8b5cf6"; // brand violet — LOCAL player only

// ── Player model ─────────────────────────────────────────────────────────────
interface Player {
  id: string;
  isLocal: boolean;
  synthetic: boolean;
  lane: number;
  distanceMs: number;
  // synthetic scheduling
  phrase?: number[];
  stride?: number; // ticks between its notes
  phase?: number; // tick offset
  step?: number; // phrase cursor
}

interface Pulse {
  fromId: string;
  startPerf: number;
  durMs: number;
  flashed: boolean;
}

interface Flash {
  id: string;
  atPerf: number;
}

interface NoteMsg {
  type: "note";
  id: string;
  pitch: number;
  distanceMs: number;
  triggerShared: number;
}
interface PresenceMsg {
  type: "join" | "hello" | "update" | "leave";
  id: string;
  distanceMs: number;
}
type Msg = NoteMsg | PresenceMsg;

interface World {
  players: Map<string, Player>;
  pulses: Pulse[];
  flashes: Flash[];
  laneCounter: number;
  ctx: AudioContext | null;
  master: SafeMaster | null;
  channel: BroadcastChannel | null;
  localId: string;
  lastTick: number;
  reduced: boolean;
  beatFlashPerf: number;
}

const DEFAULT_DISTANCE = 420;

export default function LatencyLoomPage() {
  const [started, setStarted] = useState(false);
  const [bcSupported, setBcSupported] = useState(true);
  const [localDistance, setLocalDistance] = useState(DEFAULT_DISTANCE);
  const [roster, setRoster] = useState<Player[]>([]);
  const [lastPitch, setLastPitch] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);

  // Snapshot the roster into React state (for the legend) whenever it changes.
  const syncRoster = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    setRoster(
      [...w.players.values()].sort((a, b) => a.id.localeCompare(b.id)),
    );
  }, []);

  // Register (or refresh) a player and hand back the record.
  const ensurePlayer = useCallback(
    (id: string, opts: Partial<Player> & { synthetic?: boolean }): Player => {
      const w = worldRef.current as World;
      let p = w.players.get(id);
      if (!p) {
        p = {
          id,
          isLocal: opts.isLocal ?? false,
          synthetic: opts.synthetic ?? false,
          lane: w.laneCounter++,
          distanceMs: opts.distanceMs ?? DEFAULT_DISTANCE,
          phrase: opts.phrase,
          stride: opts.stride,
          phase: opts.phase,
          step: 0,
        };
        w.players.set(id, p);
        syncRoster();
      } else if (opts.distanceMs != null && p.distanceMs !== opts.distanceMs) {
        p.distanceMs = opts.distanceMs;
        syncRoster();
      }
      return p;
    },
    [syncRoster],
  );

  // Fire one note from `player`: quantize onset to the grid AFTER adding the
  // player's latency, so every voice lands on a tick and the offsets ARE the
  // audible/visible canon. Schedules local audio (if started) + a travelling
  // pulse. Broadcasting is done by the caller for the local player only.
  const fireNote = useCallback((player: Player, pitch: number, triggerShared: number) => {
    const w = worldRef.current;
    if (!w) return;
    const nowShared = sharedNow();
    const nowPerf = performance.now();

    const soundShared = quantizeUp(Math.max(triggerShared, nowShared - TICK_MS) + player.distanceMs);
    const delayMs = Math.max(0, soundShared - nowShared);

    // Audio (Cornelljam local synthesis).
    if (w.ctx && w.master) {
      scheduleVoice(w.ctx, w.master.input, {
        freq: degreeToFreq(pitch),
        when: w.ctx.currentTime + delayMs / 1000,
        timbre: makeLaneTimbre(player.lane),
        gain: player.synthetic ? 0.5 : 0.62,
      });
    }

    // Visual pulse from sender node → all receivers over the SAME latency.
    w.pulses.push({
      fromId: player.id,
      startPerf: nowPerf,
      durMs: Math.max(40, delayMs || player.distanceMs),
      flashed: false,
    });
    // Sender lights up at the moment it plays.
    w.flashes.push({ id: player.id, atPerf: nowPerf });
  }, []);

  // Fire a local note + broadcast it so real tabs canon together.
  const triggerLocal = useCallback(
    (pitch: number) => {
      const w = worldRef.current;
      if (!w) return;
      const local = w.players.get(w.localId);
      if (!local) return;
      const triggerShared = sharedNow();
      fireNote(local, pitch, triggerShared);
      setLastPitch(pitch);
      if (w.channel) {
        w.channel.postMessage({
          type: "note",
          id: w.localId,
          pitch,
          distanceMs: local.distanceMs,
          triggerShared,
        } as NoteMsg);
      }
    },
    [fireNote],
  );

  // ── Main lifecycle: transport + metronome + synthetic ensemble + draw ──────
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const seed = makeEntropySeed();
    const localId = seedToId(seed);

    const w: World = {
      players: new Map(),
      pulses: [],
      flashes: [],
      laneCounter: 0,
      ctx: null,
      master: null,
      channel: null,
      localId,
      lastTick: Math.floor(sharedNow() / TICK_MS),
      reduced,
      beatFlashPerf: -1,
    };
    worldRef.current = w;

    // Local player.
    ensurePlayer(localId, { isLocal: true, distanceMs: DEFAULT_DISTANCE });

    // Seeded synthetic ensemble — joins the room immediately so a muted screen
    // sees pulses crossing a living network with zero interaction.
    const rng = mulberry32(seed ^ 0x9640);
    const phrases: number[][] = [
      [0, 2, 4, 2, 3],
      [4, 3, 2, 4, 5],
      [7, 5, 4, 2, 0],
    ];
    const strides = [4, 6, 3];
    const phases = [0, 2, 5];
    for (let i = 0; i < 3; i++) {
      const dist = 160 + Math.floor(rng() * 900); // 160..1060 ms, staggered
      ensurePlayer(`weave-${i + 1}`, {
        synthetic: true,
        distanceMs: dist,
        phrase: phrases[i],
        stride: strides[i],
        phase: phases[i],
      });
    }

    // Cross-tab transport.
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(CHANNEL);
      w.channel = channel;
      channel.onmessage = (ev: MessageEvent<Msg>) => {
        const m = ev.data;
        if (!m || m.id === localId) return;
        if (m.type === "note") {
          const p = ensurePlayer(m.id, { distanceMs: m.distanceMs });
          fireNote(p, m.pitch, m.triggerShared);
        } else if (m.type === "leave") {
          const cur = worldRef.current;
          if (cur && cur.players.has(m.id)) {
            cur.players.delete(m.id);
            syncRoster();
          }
        } else {
          const isNew = !w.players.has(m.id);
          ensurePlayer(m.id, { distanceMs: m.distanceMs });
          // Answer a newcomer's join so it learns we exist (terminates: we only
          // reply to a genuinely new peer, never to hello/update).
          if (m.type === "join" && isNew && channel) {
            channel.postMessage({ type: "hello", id: localId, distanceMs: DEFAULT_DISTANCE } as PresenceMsg);
          }
        }
      };
      channel.postMessage({ type: "join", id: localId, distanceMs: DEFAULT_DISTANCE } as PresenceMsg);
    } else {
      setBcSupported(false);
    }

    // Metronome-driven scheduler + render loop.
    let raf = 0;
    const canvas = canvasRef.current;
    const ctx2d = canvas ? canvas.getContext("2d") : null;

    const resize = () => {
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      if (ctx2d) ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onTick = (tickIndex: number) => {
      w.beatFlashPerf = performance.now();
      const tickShared = tickIndex * TICK_MS;
      for (const p of w.players.values()) {
        if (!p.synthetic || !p.phrase || !p.stride) continue;
        if (((tickIndex - (p.phase ?? 0)) % p.stride + p.stride) % p.stride !== 0) continue;
        const pitch = p.phrase[(p.step ?? 0) % p.phrase.length];
        p.step = (p.step ?? 0) + 1;
        fireNote(p, pitch, tickShared);
      }
    };

    const frame = () => {
      const tIdx = Math.floor(sharedNow() / TICK_MS);
      if (tIdx !== w.lastTick) {
        // Advance through any missed ticks (tab throttling), cap the catch-up.
        const from = Math.max(w.lastTick + 1, tIdx - 4);
        for (let k = from; k <= tIdx; k++) onTick(k);
        w.lastTick = tIdx;
      }
      if (ctx2d && canvas) drawScene(ctx2d, canvas, w);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Keyboard: a-s-d-f-g-h-j-k → JI degrees 0..7.
    const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const idx = KEYS.indexOf(e.key.toLowerCase());
      if (idx < 0 || idx >= DEGREES) return;
      e.preventDefault();
      triggerLocal(idx);
    };
    window.addEventListener("keydown", onKey);

    const onLeave = () => {
      if (channel) channel.postMessage({ type: "leave", id: localId, distanceMs: 0 } as PresenceMsg);
    };
    window.addEventListener("beforeunload", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
      onLeave();
      if (channel) channel.close();
      if (w.master) w.master.disconnect();
      if (w.ctx) w.ctx.close().catch(() => {});
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slider: re-tune the canon by changing THIS player's latency.
  const onDistance = useCallback((v: number) => {
    setLocalDistance(v);
    const w = worldRef.current;
    if (!w) return;
    const local = w.players.get(w.localId);
    if (local) {
      local.distanceMs = v;
      syncRoster();
      if (w.channel) w.channel.postMessage({ type: "update", id: w.localId, distanceMs: v } as PresenceMsg);
    }
  }, [syncRoster]);

  // Open the AudioContext on a user gesture (browser requirement).
  const start = useCallback(async () => {
    const w = worldRef.current;
    if (!w || w.ctx) {
      setStarted(true);
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume().catch(() => {});
    w.ctx = ctx;
    w.master = createSafeMaster(ctx, { gain: 0.18 });
    setStarted(true);
  }, []);

  const onCanvasPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const idx = Math.max(0, Math.min(DEGREES - 1, Math.floor(x * DEGREES)));
      triggerLocal(idx);
    },
    [triggerLocal],
  );

  const realCount = roster.filter((p) => !p.synthetic).length;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <PrototypeNav slugs={["9640-latencyloom"]} />

      <div className="mx-auto max-w-4xl">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Latency Loom</h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            A room several tabs weave together, where the network delay between players is the
            instrument — every note reaches the others late, so the room plays itself as a
            distributed canon. Open this page in a second tab and you both join the same loom.
          </p>
        </header>

        {!bcSupported && (
          <p className="mb-4 text-base text-destructive">
            Cross-tab sync unavailable — showing a simulated room.
          </p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start sound
            </button>
          ) : (
            <span className="text-base text-muted-foreground">
              Sound on · play with{" "}
              <kbd className="rounded border border-border px-1.5 py-0.5 text-sm">a s d f g h j k</kbd>{" "}
              or tap the loom
            </span>
          )}
          <span className="text-base text-muted-foreground">
            {roster.length} nodes in the room · {realCount} real tab{realCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <canvas
            ref={canvasRef}
            onPointerDown={onCanvasPointer}
            className="block h-[460px] w-full touch-none"
            aria-label="High-key network diagram of players; pulses travel each edge over that peer's latency."
          />
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label className="flex flex-col gap-2">
              <span className="text-base text-foreground">
                Your distance to the room:{" "}
                <span className="text-primary">{localDistance} ms</span>
              </span>
              <input
                type="range"
                min={0}
                max={1200}
                step={10}
                value={localDistance}
                onChange={(e) => onDistance(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label="Local player latency in milliseconds"
              />
            </label>
            <p className="mt-2 text-sm text-muted-foreground">
              Drag to re-tune the canon: your notes reach every other player this many milliseconds
              late, quantized onto the shared 110-BPM grid. The delay is the compositional control,
              not an error to hide.{lastPitch != null ? ` · last degree ${lastPitch + 1}/8` : ""}
            </p>
          </div>

          <ul className="min-w-[180px] space-y-1.5 text-sm">
            {roster.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className={p.isLocal ? "text-primary" : "text-muted-foreground"}>
                  {p.isLocal ? "you" : p.synthetic ? `weave · ${p.id}` : `tab · ${p.id}`}
                </span>
                <span className="tabular-nums text-muted-foreground">{p.distanceMs} ms</span>
              </li>
            ))}
          </ul>
        </div>

        <details className="mt-6 text-base text-muted-foreground">
          <summary className="cursor-pointer text-foreground">Read the design notes</summary>
          <div className="mt-3 space-y-2">
            <p>
              Transport is a serverless <code>BroadcastChannel</code>; each open tab is a live
              player. Because BroadcastChannel is effectively instant, inter-peer distance is
              simulated per player and applied as a scheduling delay — the delay <em>is</em> the
              instrument (NIME 2025, latency-as-device).
            </p>
            <p>
              A shared metronome (Oda &amp; Fiebrink, NIME 2016) keeps every tab on one grid via
              <code> performance.timeOrigin</code>. Receivers re-synthesize control events locally
              (the Cornelljam pattern), so the room scales at zero bandwidth. Tuning is 7-limit just
              intonation, deliberately not pentatonic.
            </p>
          </div>
        </details>
      </div>
    </main>
  );
}

// ── Canvas render ────────────────────────────────────────────────────────────
function nodePositions(w: World, width: number, mainH: number): Map<string, { x: number; y: number }> {
  const ids = [...w.players.keys()].sort((a, b) => a.localeCompare(b));
  const cx = width / 2;
  const cy = mainH / 2;
  const radius = Math.min(width, mainH) * 0.34;
  const out = new Map<string, { x: number; y: number }>();
  const n = ids.length;
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
    out.set(ids[i], { x: cx + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius });
  }
  return out;
}

function drawScene(g: CanvasRenderingContext2D, canvas: HTMLCanvasElement, w: World): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  const rulerH = 64;
  const mainH = height - rulerH;
  const now = performance.now();

  // Paper ground.
  g.fillStyle = PAPER;
  g.fillRect(0, 0, width, height);

  const pos = nodePositions(w, width, mainH);
  const ids = [...pos.keys()];

  // Faint network edges (every pair).
  g.lineWidth = 1;
  g.strokeStyle = EDGE;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = pos.get(ids[i])!;
      const b = pos.get(ids[j])!;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
  }

  // Pulses: sender → every receiver over the same latency (the visible canon).
  for (let pi = w.pulses.length - 1; pi >= 0; pi--) {
    const pulse = w.pulses[pi];
    const from = pos.get(pulse.fromId);
    const elapsed = now - pulse.startPerf;
    const prog = Math.min(1, elapsed / pulse.durMs);
    if (prog >= 1 && !pulse.flashed) {
      pulse.flashed = true;
      // Every other node lights up on arrival — coincident with its audio.
      for (const id of ids) if (id !== pulse.fromId) w.flashes.push({ id, atPerf: now });
    }
    if (elapsed > pulse.durMs + 120) {
      w.pulses.splice(pi, 1);
      continue;
    }
    if (!from || prog >= 1) continue;
    const isLocal = w.players.get(pulse.fromId)?.isLocal ?? false;
    const eased = prog;
    for (const id of ids) {
      if (id === pulse.fromId) continue;
      const to = pos.get(id)!;
      if (w.reduced) {
        // Reduced motion: no travelling dot, just a soft edge tint mid-transit.
        g.strokeStyle = isLocal ? ACCENT : INK_SOFT;
        g.globalAlpha = 0.18 * (1 - Math.abs(prog - 0.5) * 2);
        g.beginPath();
        g.moveTo(from.x, from.y);
        g.lineTo(to.x, to.y);
        g.stroke();
        g.globalAlpha = 1;
        continue;
      }
      const x = from.x + (to.x - from.x) * eased;
      const y = from.y + (to.y - from.y) * eased;
      g.fillStyle = isLocal ? ACCENT : INK;
      g.beginPath();
      g.arc(x, y, isLocal ? 4 : 3, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Flash rings (fade + expand over ~420ms), then nodes.
  for (let fi = w.flashes.length - 1; fi >= 0; fi--) {
    const f = w.flashes[fi];
    const age = now - f.atPerf;
    if (age > 460) {
      w.flashes.splice(fi, 1);
      continue;
    }
    const p = pos.get(f.id);
    if (!p) continue;
    const k = age / 460;
    const isLocal = w.players.get(f.id)?.isLocal ?? false;
    g.globalAlpha = (1 - k) * 0.7;
    g.strokeStyle = isLocal ? ACCENT : INK;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(p.x, p.y, 10 + k * 22, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }

  // Nodes + labels.
  g.textAlign = "center";
  g.font = "12px ui-sans-serif, system-ui, sans-serif";
  for (const id of ids) {
    const p = pos.get(id)!;
    const player = w.players.get(id)!;
    const r = player.isLocal ? 11 : 8;
    g.fillStyle = player.isLocal ? ACCENT : LANE_SHADES[player.lane % LANE_SHADES.length];
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = INK;
    g.stroke();

    const label = player.isLocal ? "you" : id;
    g.fillStyle = INK;
    g.fillText(label, p.x, p.y - r - 8);
    g.fillStyle = INK_SOFT;
    g.fillText(`${player.distanceMs} ms`, p.x, p.y + r + 16);
  }

  // Metronome ruler: a row of ticks; the current beat sweeps across it.
  const rulerY = mainH + rulerH * 0.5;
  const nTicks = 16;
  const beatFlash = Math.max(0, 1 - (now - w.beatFlashPerf) / 220);
  const tickShared = Math.floor(sharedNow() / TICK_MS);
  const activeCol = ((tickShared % nTicks) + nTicks) % nTicks;
  const pad = 24;
  const span = width - pad * 2;
  g.strokeStyle = GRID;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(pad, rulerY);
  g.lineTo(width - pad, rulerY);
  g.stroke();
  for (let i = 0; i < nTicks; i++) {
    const x = pad + (i / (nTicks - 1)) * span;
    const active = i === activeCol;
    const h = active ? 16 : 8;
    g.strokeStyle = active ? INK : GRID;
    g.lineWidth = active ? 2 : 1;
    g.beginPath();
    g.moveTo(x, rulerY - h);
    g.lineTo(x, rulerY + h);
    g.stroke();
    if (active) {
      g.fillStyle = INK;
      g.globalAlpha = 0.35 + 0.65 * beatFlash;
      g.beginPath();
      g.arc(x, rulerY, 4, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  }
  g.fillStyle = INK_SOFT;
  g.textAlign = "left";
  g.fillText("110 BPM · shared grid", pad, mainH + 18);

  // Frame edge.
  g.strokeStyle = PAPER_EDGE;
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, width - 1, height - 1);
}
