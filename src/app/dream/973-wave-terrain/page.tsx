"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Orbit,
  TerrainId,
  TERRAIN_PRESETS,
  sampleWaveform,
  orbitPoint,
  terrainHeight,
} from "./terrain";
import {
  TerrainSynth,
  scaleFreq,
  KEY_TO_DEGREE,
  midiToFreq,
} from "./audio";
import { TerrainGL } from "./gl";

// minimal Web MIDI typing (no lib, avoid `any`)
interface MIDIMsgEvent {
  data: Uint8Array | null;
}
interface MIDIInputLike {
  onmidimessage: ((e: MIDIMsgEvent) => void) | null;
}
interface MIDIAccessLike {
  inputs: { values(): IterableIterator<MIDIInputLike> };
}
interface NavigatorMIDI {
  requestMIDIAccess?: () => Promise<MIDIAccessLike>;
}

const DEMO_NOTES = [0, 2, 4, 3, 5, 7, 6, 4]; // D Dorian arpeggio degrees

export default function WaveTerrainPage() {
  const [started, setStarted] = useState(false);
  const [noWebAudio, setNoWebAudio] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);
  const [orbitUI, setOrbitUI] = useState<Orbit>({
    radius: 0.6,
    lobes: 2,
    twist: 0.3,
    rot: 0,
  });
  const [morphing, setMorphing] = useState(true);
  const [demoActive, setDemoActive] = useState(true);
  const [midiOk, setMidiOk] = useState<boolean | null>(null);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stripRef = useRef<HTMLCanvasElement | null>(null);

  // mutable refs shared with the rAF loop
  const synthRef = useRef<TerrainSynth | null>(null);
  const glRef = useRef<TerrainGL | null>(null);
  const orbitRef = useRef<Orbit>(orbitUI);
  const presetRef = useRef<TerrainId>(TERRAIN_PRESETS[0].id);
  const morphRef = useRef(0);
  const morphingRef = useRef(true);
  const demoRef = useRef(true);
  const heldRef = useRef<Set<string>>(new Set());
  const rafRef = useRef(0);
  const lastInputRef = useRef(performance.now());
  const demoStepRef = useRef(0);
  const demoTimeRef = useRef(0);

  orbitRef.current = orbitUI;
  presetRef.current = TERRAIN_PRESETS[presetIdx].id;
  morphingRef.current = morphing;
  demoRef.current = demoActive;

  // push current terrain timbre to the synth + GL
  const syncTimbre = useCallback(() => {
    const s = synthRef.current;
    const g = glRef.current;
    const id = presetRef.current;
    const orb = orbitRef.current;
    const m = morphRef.current;
    if (s) s.setTerrain(id, orb, m);
    if (g) {
      g.updateTerrain(id, m);
      g.updateOrbit(id, orb, m);
    }
  }, []);

  // draw waveform strip (the carved period) on the 2D canvas
  const drawStrip = useCallback((readT: number) => {
    const cv = stripRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const w = cv.width;
    const h = cv.height;
    const wave = sampleWaveform(presetRef.current, orbitRef.current, morphRef.current, w);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(20,13,10,0.9)";
    ctx.fillRect(0, 0, w, h);
    // zero line
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    // waveform
    ctx.strokeStyle = "rgba(248,200,120,0.95)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < w; i++) {
      const y = h / 2 - wave[i] * (h * 0.42);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
    // read marker
    const mx = readT * w;
    ctx.strokeStyle = "rgba(255,245,200,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx, 0);
    ctx.lineTo(mx, h);
    ctx.stroke();
  }, []);

  // Canvas2D top-down heatmap fallback
  const drawFallback = useCallback((readT: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const w = cv.width;
    const h = cv.height;
    const id = presetRef.current;
    const m = morphRef.current;
    const cell = 6;
    for (let py = 0; py < h; py += cell) {
      for (let px = 0; px < w; px += cell) {
        const x = (px / w) * 2 - 1;
        const y = (py / h) * 2 - 1;
        const z = terrainHeight(id, x, y, m);
        const t = z * 0.5 + 0.5;
        const r = Math.round(40 + t * 215);
        const g = Math.round(20 + t * 180);
        const b = Math.round(15 + t * 100);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(px, py, cell, cell);
      }
    }
    // orbit
    ctx.strokeStyle = "rgba(120,255,210,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 128; i++) {
      const [ox, oy] = orbitPoint(orbitRef.current, i / 128);
      const sx = ((ox + 1) / 2) * w;
      const sy = ((oy + 1) / 2) * h;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    // read point
    const [rx, ry] = orbitPoint(orbitRef.current, readT);
    ctx.fillStyle = "rgba(255,245,200,1)";
    ctx.beginPath();
    ctx.arc(((rx + 1) / 2) * w, ((ry + 1) / 2) * h, 6, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const noteOn = useCallback((key: string, freq: number, vel = 1) => {
    const s = synthRef.current;
    if (!s) return;
    s.noteOn(key, freq, vel);
    heldRef.current.add(key);
    setActiveKeys(new Set(heldRef.current));
  }, []);

  const noteOff = useCallback((key: string) => {
    const s = synthRef.current;
    if (!s) return;
    s.noteOff(key);
    heldRef.current.delete(key);
    setActiveKeys(new Set(heldRef.current));
  }, []);

  // ── Start gate ────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (started) return;
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
      setNoWebAudio(true);
      return;
    }
    let synth: TerrainSynth;
    try {
      synth = new TerrainSynth();
    } catch {
      setNoWebAudio(true);
      return;
    }
    synthRef.current = synth;
    synth.resume();

    const cv = canvasRef.current;
    if (cv) {
      const gl = TerrainGL.create(cv);
      if (gl) {
        glRef.current = gl;
      } else {
        setUsingFallback(true);
      }
    }
    setStarted(true);
    syncTimbre();

    // request MIDI (optional)
    const nav = navigator as Navigator & NavigatorMIDI;
    if (nav.requestMIDIAccess) {
      nav
        .requestMIDIAccess()
        .then((access) => {
          setMidiOk(true);
          for (const input of access.inputs.values()) {
            input.onmidimessage = (e: MIDIMsgEvent) => {
              if (!e.data || e.data.length < 3) return;
              const [status, note, vel] = e.data;
              const cmd = status & 0xf0;
              const key = `midi-${note}`;
              if (cmd === 0x90 && vel > 0) {
                lastInputRef.current = performance.now();
                demoRef.current = false;
                setDemoActive(false);
                noteOn(key, midiToFreq(note), vel / 127);
              } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
                noteOff(key);
              }
            };
          }
        })
        .catch(() => setMidiOk(false));
    } else {
      setMidiOk(false);
    }
  }, [started, syncTimbre, noteOn, noteOff]);

  // ── keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      // preset switch 1..5
      if (k >= "1" && k <= "5") {
        const idx = Number(k) - 1;
        if (idx < TERRAIN_PRESETS.length) {
          setPresetIdx(idx);
          presetRef.current = TERRAIN_PRESETS[idx].id;
          syncTimbre();
        }
        return;
      }
      // morph / shape controls
      if (k === "[" || k === "arrowleft") {
        setOrbitUI((o) => {
          const next = { ...o, radius: Math.max(0.2, o.radius - 0.05) };
          orbitRef.current = next;
          return next;
        });
        return;
      }
      if (k === "]" || k === "arrowright") {
        setOrbitUI((o) => {
          const next = { ...o, radius: Math.min(0.95, o.radius + 0.05) };
          orbitRef.current = next;
          return next;
        });
        return;
      }
      if (k === "arrowup") {
        setOrbitUI((o) => {
          const next = { ...o, lobes: Math.min(5, o.lobes + 1) };
          orbitRef.current = next;
          return next;
        });
        return;
      }
      if (k === "arrowdown") {
        setOrbitUI((o) => {
          const next = { ...o, lobes: Math.max(1, o.lobes - 1) };
          orbitRef.current = next;
          return next;
        });
        return;
      }
      if (k === "m") {
        setMorphing((v) => !v);
        return;
      }
      // notes
      if (k in KEY_TO_DEGREE) {
        lastInputRef.current = performance.now();
        if (demoRef.current) {
          demoRef.current = false;
          setDemoActive(false);
          // release any demo voices
          for (const dk of [...heldRef.current]) if (dk.startsWith("demo-")) noteOff(dk);
        }
        noteOn(`kb-${k}`, scaleFreq(KEY_TO_DEGREE[k]));
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in KEY_TO_DEGREE) noteOff(`kb-${k}`);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [started, syncTimbre, noteOn, noteOff]);

  // keep orbit shape synced when UI changes
  useEffect(() => {
    if (started) syncTimbre();
  }, [orbitUI, presetIdx, started, syncTimbre]);

  // ── render + audio loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let prev = performance.now();
    let camAngle = 0.6;
    let readT = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      camAngle += dt * 0.06;

      // morph drift
      if (morphingRef.current) {
        morphRef.current = (morphRef.current + dt * 0.03) % 1;
        syncTimbre();
      }

      // read marker advances (visual scrub of the period)
      readT = (readT + dt * 0.5) % 1;

      // auto-demo after 3s idle
      const idle = now - lastInputRef.current;
      if (demoRef.current && idle > 3000) {
        demoTimeRef.current += dt;
        if (demoTimeRef.current > 0.55) {
          demoTimeRef.current = 0;
          // release prior demo note
          for (const dk of [...heldRef.current]) if (dk.startsWith("demo-")) noteOff(dk);
          const deg = DEMO_NOTES[demoStepRef.current % DEMO_NOTES.length];
          demoStepRef.current++;
          noteOn(`demo-${demoStepRef.current}`, scaleFreq(deg), 0.7);
          // gentle preset cycling every 16 steps
          if (demoStepRef.current % 16 === 0) {
            const nidx = (presetIdx + 1) % TERRAIN_PRESETS.length;
            setPresetIdx(nidx);
            presetRef.current = TERRAIN_PRESETS[nidx].id;
          }
        }
      }

      const active = synthRef.current ? synthRef.current.activeFreqs().length > 0 : false;

      if (glRef.current) {
        const cv = canvasRef.current;
        if (cv) {
          const rect = cv.getBoundingClientRect();
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const W = Math.round(rect.width * dpr);
          const H = Math.round(rect.height * dpr);
          if (cv.width !== W || cv.height !== H) {
            cv.width = W;
            cv.height = H;
          }
          glRef.current.render(
            W,
            H,
            camAngle,
            readT,
            presetRef.current,
            orbitRef.current,
            morphRef.current,
            active,
          );
        }
      } else if (usingFallback) {
        const cv = canvasRef.current;
        if (cv) {
          const rect = cv.getBoundingClientRect();
          if (cv.width !== Math.round(rect.width)) cv.width = Math.round(rect.width);
          if (cv.height !== Math.round(rect.height)) cv.height = Math.round(rect.height);
          drawFallback(readT);
        }
      }
      drawStrip(readT);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, usingFallback, syncTimbre, drawStrip, drawFallback, noteOn, noteOff, presetIdx]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      glRef.current?.dispose();
      synthRef.current?.dispose();
    };
  }, []);

  const preset = TERRAIN_PRESETS[presetIdx];

  return (
    <main className="min-h-screen bg-[#0c0907] text-white">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl text-white sm:text-3xl">
              Wave Terrain
            </h1>
            <p className="mt-1 max-w-2xl text-base text-white/75">
              The glowing landscape you see <em>is</em> the sound you hear. An
              orbit traces a closed path over the terrain; the height under the
              moving point, read at audio rate, is the waveform.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <Link
              href="/dream"
              className="rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              ↑ all prototypes
            </Link>
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="text-sm text-amber-300/95 underline-offset-4 hover:underline"
            >
              Read the design notes
            </button>
          </div>
        </header>

        {showNotes && (
          <div className="mb-6 rounded-xl border border-white/10 bg-black/30 p-5 text-base leading-relaxed text-white/80">
            <p className="mb-2">
              <span className="text-emerald-300/95">Wave-terrain synthesis</span>{" "}
              (Mitsuhashi 1982; Borgonovo &amp; Haus 1986; Roads,{" "}
              <em>Microsound</em> 2001): a 2D trajectory scans a 3D surface{" "}
              <span className="font-mono">z = f(x, y)</span>. Sampling the
              height along one closed loop of the orbit yields exactly one period
              of an audio waveform. Reshape the land and you sculpt the timbre;
              spin the orbit faster (a higher note) and the same shape plays at a
              higher pitch.
            </p>
            <p className="text-white/70">
              Here the period (1024 samples, DC-blocked) is turned into a{" "}
              <span className="font-mono">PeriodicWave</span> shared by up to six
              oscillator voices. A 2025–2026 hardware/software revival (Scaler{" "}
              <em>Carbon Electra 2</em>, May 2026; Conductive Labs{" "}
              <em>Terrain</em>, 2025) made this fresh — but there is still no
              free browser-native wave-terrain instrument. This is one.
            </p>
          </div>
        )}

        {!started ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-[#1a120c] to-[#0c0907] py-24 text-center">
            <p className="mb-5 max-w-md px-6 text-base text-white/75">
              Headphones recommended. Audio starts on your gesture. Then play
              the home row — the keys, not the mouse.
            </p>
            <button
              onClick={start}
              className="rounded-full bg-amber-400/90 px-8 py-3.5 text-lg font-medium text-black transition-colors hover:bg-amber-300"
            >
              ▶ Start the instrument
            </button>
            {noWebAudio && (
              <p className="mt-4 text-base text-rose-300">
                Web Audio is unavailable in this browser — sound cannot play.
              </p>
            )}
          </div>
        ) : noWebAudio ? (
          <p className="text-base text-rose-300">
            Web Audio is unavailable in this browser — sound cannot play.
          </p>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
              <canvas ref={canvasRef} className="block h-[55vh] w-full" />
              {usingFallback && (
                <div className="absolute left-3 top-3 rounded-md bg-black/70 px-3 py-1.5 text-sm text-rose-300">
                  WebGL2 unavailable — top-down heatmap fallback. Audio still
                  plays.
                </div>
              )}
              {demoActive && (
                <div className="absolute right-3 top-3 rounded-md bg-black/60 px-3 py-1.5 text-sm text-emerald-300/95">
                  auto-demo · press a key to play
                </div>
              )}
            </div>

            {/* carved waveform strip = the exact period being played */}
            <div className="mt-3">
              <div className="mb-1 text-sm text-white/55">
                carved waveform — height sampled along the orbit (one period)
              </div>
              <canvas
                ref={stripRef}
                width={1024}
                height={120}
                className="block h-[90px] w-full rounded-lg border border-white/10"
              />
            </div>

            {/* status + controls */}
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-sm uppercase tracking-widest text-white/55">
                  Terrain
                </div>
                <div className="mt-1 text-xl text-white">{preset.name}</div>
                <div className="text-base text-white/75">{preset.blurb}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TERRAIN_PRESETS.map((p, i) => (
                    <span
                      key={p.id}
                      className={`rounded-md px-2.5 py-1 font-mono text-sm ${
                        i === presetIdx
                          ? "bg-amber-400/90 text-black"
                          : "bg-white/[0.06] text-white/75"
                      }`}
                    >
                      {i + 1} {p.name.split(" ")[0]}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="text-sm uppercase tracking-widest text-white/55">
                  Orbit (pitch path / timbre)
                </div>
                <div className="mt-2 font-mono text-base text-white/80">
                  radius {orbitUI.radius.toFixed(2)} · lobes {orbitUI.lobes} ·
                  morph {morphing ? "on" : "off"}
                </div>
                <div className="mt-3 text-base text-white/75">
                  <span className="text-violet-300">[ ]</span> or{" "}
                  <span className="text-violet-300">← →</span> radius ·{" "}
                  <span className="text-violet-300">↑ ↓</span> lobes ·{" "}
                  <span className="text-violet-300">M</span> morph
                </div>
                <div className="mt-1 text-base text-white/75">
                  MIDI:{" "}
                  {midiOk === null
                    ? "…"
                    : midiOk
                      ? "connected (note on/off → voices)"
                      : "none — keyboard works fully"}
                </div>
              </div>
            </div>

            {/* key legend */}
            <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="text-sm uppercase tracking-widest text-white/55">
                Play — home row (D Dorian, ~2 octaves)
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {["a", "s", "d", "f", "g", "h", "j", "k", "l"].map((k) => (
                  <kbd
                    key={k}
                    className={`flex h-11 min-w-[44px] items-center justify-center rounded-lg border px-3 font-mono text-base ${
                      activeKeys.has(`kb-${k}`)
                        ? "border-amber-300 bg-amber-400/90 text-black"
                        : "border-white/15 bg-white/[0.04] text-white/80"
                    }`}
                  >
                    {k.toUpperCase()}
                  </kbd>
                ))}
                <span className="self-center text-base text-white/55">
                  + Q W E R T Y U I O P go higher
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
