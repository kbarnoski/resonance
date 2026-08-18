"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS } from "../_shared/welcomeHome";
import { Field } from "./field";
import { RoomAudio } from "./audio";

type Phase = "idle" | "running" | "error";

const DEFAULT_TRACK = "d57cfae6-f234-4d24-85fe-72a8ad93a44a"; // Interplay — rich dynamics
const SOURCE = { x: 0.28, y: 0.66 }; // fixed point source, uv space
const SUBSTEPS = 6; // FDTD leapfrog iterations per frame
const READ_EVERY = 4; // frames between listener readbacks
const MAX_DIST = 1.25; // uv distance normaliser (source → far corner)

export default function WaveroomPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [trackId, setTrackId] = useState(DEFAULT_TRACK);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({ energy: 0, dist: 0, rms: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<Field | null>(null);
  const audioRef = useRef<RoomAudio | null>(null);
  const animRef = useRef(0);
  const frameRef = useRef(0);
  const startMsRef = useRef(0);

  const listenerRef = useRef({ x: 0.68, y: 0.4 });
  const draggingRef = useRef(false);
  const lastTouchRef = useRef(0); // ms of last human interaction
  const energyRef = useRef(0);
  const reducedRef = useRef(false);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    audioRef.current?.dispose();
    audioRef.current = null;
    fieldRef.current?.dispose();
    fieldRef.current = null;
  }, []);

  const pointerToListener = useCallback((clientX: number, clientY: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = 1 - (clientY - r.top) / r.height; // gl uv: y up
    listenerRef.current = {
      x: Math.max(0.04, Math.min(0.96, x)),
      y: Math.max(0.04, Math.min(0.96, y)),
    };
    lastTouchRef.current = performance.now();
  }, []);

  const begin = useCallback(async () => {
    if (phase === "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = Math.max(2, canvas.clientWidth);
    canvas.height = Math.max(2, canvas.clientHeight);

    // 1) Field first — bail gracefully if WebGL2 / float textures are missing.
    let field: Field;
    try {
      field = new Field(canvas);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "The room could not start.");
      setPhase("error");
      return;
    }
    fieldRef.current = field;

    // 2) AudioContext built + resumed inside this user gesture (SSR-safe).
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    try {
      await ctx.resume();
    } catch {
      /* some browsers resume lazily */
    }
    const audio = new RoomAudio(ctx);
    audioRef.current = audio;
    void audio.loadTrack(trackId).catch(() => {
      setErrorMsg("That recording could not be loaded.");
      setPhase("error");
    });

    reducedRef.current =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setPhase("running");
    startMsRef.current = performance.now();
    frameRef.current = 0;
    lastTouchRef.current = 0;

    const tick = (now: number) => {
      const f = fieldRef.current;
      const a = audioRef.current;
      if (!f || !a) return;
      const t = (now - startMsRef.current) / 1000;

      // Autonomous idle drift when untouched (a slow Lissajous walk).
      const idleFor = (now - lastTouchRef.current) / 1000;
      if (!draggingRef.current && (lastTouchRef.current === 0 || idleFor > 2.5)) {
        const sp = reducedRef.current ? 0.06 : 0.16;
        const amp = reducedRef.current ? 0.22 : 0.34;
        listenerRef.current = {
          x: 0.5 + Math.sin(t * sp) * amp,
          y: 0.5 + Math.sin(t * sp * 0.73 + 1.3) * amp,
        };
      }

      // Drive the room with the live music waveform (signed → real wavefronts).
      const drive = a.getDrive();
      let amp = drive.signed * 0.7;
      if (a.onset(t)) amp += (drive.signed >= 0 ? 1 : -1) * 0.7;
      amp = Math.max(-1.5, Math.min(1.5, amp));
      f.step(SUBSTEPS, SOURCE, amp);

      // Sample the listener's LOCAL field energy → spatialise the audio.
      const L = listenerRef.current;
      if (frameRef.current % READ_EVERY === 0) {
        const e = f.readListenerEnergy(L);
        energyRef.current = energyRef.current * 0.6 + e * 0.4;
        const dx = L.x - SOURCE.x;
        const dy = L.y - SOURCE.y;
        const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / MAX_DIST);
        a.setListener(energyRef.current, dist);
        if (frameRef.current % (READ_EVERY * 4) === 0) {
          setReadout({ energy: energyRef.current, dist, rms: drive.rms });
        }
      }

      f.draw(SOURCE, L);
      frameRef.current++;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [phase, trackId]);

  // Live track switch while running.
  const changeTrack = useCallback((id: string) => {
    setTrackId(id);
    const a = audioRef.current;
    if (a) void a.loadTrack(id).catch(() => {});
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = Math.max(2, c.clientWidth);
      c.height = Math.max(2, c.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* The room — top-down FDTD pressure field */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: "#060a10", cursor: phase === "running" ? "crosshair" : "default" }}
        aria-label="Top-down acoustic pressure field of a resonant room"
        onPointerDown={(e) => {
          if (phase !== "running") return;
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pointerToListener(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          pointerToListener(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* no capture */
          }
        }}
      />

      {/* Idle / start overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-xl rounded-lg border border-border bg-popover/85 p-8 backdrop-blur-md">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              waveroom
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              One of Karel&apos;s recordings, played back as a point source inside
              a simulated resonant chamber. A real acoustic wave equation
              propagates its pressure across the room — wavefronts expand, reflect
              off the walls, and interfere into standing-wave patterns. Move the
              listener through the field and you hear the room from where you
              stand: antinodes are loud and open, nodes fall to a whisper.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              This is not a mixer. There is one source. Walking the room is
              hearing its acoustic modes.
            </p>

            {phase === "error" ? (
              <p className="mt-5 text-base text-destructive">
                {errorMsg} This experience needs WebGL2 with float textures.
              </p>
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={begin}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Enter the room
                </button>
                <button
                  type="button"
                  onClick={() => setShowNotes((s) => !s)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {showNotes ? "Hide design notes" : "Read the design notes"}
                </button>
              </div>
            )}

            {showNotes && (
              <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
                <p>
                  <span className="text-foreground">Technique.</span> A 2D FDTD
                  (finite-difference time-domain) solve of the scalar wave
                  equation on GPU ping-pong float textures — leapfrog{" "}
                  <code>u_next = 2u − u_prev + C²∇²u − damp·(u − u_prev)</code>{" "}
                  at C² = 0.49 (CFL-safe). Reflecting walls build the standing
                  waves; a thin absorbing perimeter keeps the driven field bounded.
                </p>
                <p>
                  <span className="text-foreground">Palette.</span> A diverging
                  pressure map: teal for rarefaction, near-black at zero, coral for
                  compression. A cool peak-hold bloom marks antinodes so the mode
                  structure stays visible between wavefronts.
                </p>
                <p>
                  <span className="text-foreground">Spatialisation.</span> Local
                  field energy at the listener sets gain; distance from the source
                  sets a short delay and a lowpass that darkens the far corners; a
                  feedback-delay tail gives the room depth. Everything you hear is
                  Karel&apos;s real piano.
                </p>
                <p>
                  <span className="text-foreground">Reference.</span> Savioja,
                  &ldquo;Real-Time 3D Finite-Difference Time-Domain Simulation of
                  Low- and Mid-Frequency Room Acoustics&rdquo; (DAFx 2010), and the
                  wave-based room auralisation lineage.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="pointer-events-auto max-w-md rounded-lg border border-border bg-popover/80 p-4 backdrop-blur-md">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              waveroom
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Drag the bright listener ring through the room. Coral is
              compression, teal is rarefaction; bright bands are antinodes, dark
              seams are nodes.
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="track">
                Source recording
              </label>
              <select
                id="track"
                value={trackId}
                onChange={(e) => changeTrack(e.target.value)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
              >
                {REAL_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowNotes((s) => !s)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {showNotes ? "Hide notes" : "Design notes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAll();
                  setPhase("idle");
                }}
                className="min-h-[44px] rounded-md border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Leave
              </button>
            </div>

            {showNotes && (
              <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
                FDTD acoustic wave equation on GPU ping-pong float textures.
                Reflecting walls fold the source&apos;s wavefronts into standing
                waves; your local field energy spatialises the one real recording.
              </p>
            )}
          </div>

          {/* Listener readout */}
          <div className="pointer-events-auto w-full max-w-xs rounded-lg border border-border bg-popover/80 p-3 backdrop-blur-md sm:w-56">
            <p className="mb-2 text-sm text-muted-foreground">
              at the listener
            </p>
            <Meter label="field energy" value={Math.min(1, readout.energy * 3)} />
            <Meter label="distance to source" value={readout.dist} />
            <Meter label="source loudness" value={Math.min(1, readout.rms * 2.2)} />
            <p className="mt-2 text-xs text-muted-foreground">
              antinode → loud &amp; open · node → quiet &amp; dark
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["15104-waveroom"]} />
    </main>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{Math.round(v * 100)}%</span>
      </div>
      <span className="relative block h-2 overflow-hidden rounded-sm bg-muted/40">
        <span
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{
            width: `${Math.round(v * 100)}%`,
            background: "linear-gradient(90deg, #0aa0a0, #ff7a5c)",
          }}
        />
      </span>
    </div>
  );
}
