"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WORKLET_SOURCE } from "./worklet-source";

// ── The bodies ─────────────────────────────────────────────────────
// Four selectable struck-metal resonators. Each has an INHARMONIC,
// clustered modal spectrum (real tam-tams/gongs are dense and stretched
// — NOT a harmonic series, NOT a tuned scale). Higher modes get shorter
// decays and larger per-mode beta (they sharpen most under tension), so
// a hard strike blooms sharp and glides down. `couple` sets how much
// energy sloshes between neighbours during the loud opening.
type Mode = { ratio: number; gain: number; decay: number; beta: number };
type BodySpec = {
  name: string;
  fundamental: number;
  modes: Mode[];
  couple: number;
  hue: number; // accent hue (metallurgical: amber / cyan)
};

// build an inharmonic, clustered metal spectrum from a base ratio set,
// stretching the ratios and clustering pairs the way a real plate does.
function makeBody(
  name: string,
  fundamental: number,
  baseRatios: number[],
  decay0: number,
  couple: number,
  hue: number
): BodySpec {
  const modes: Mode[] = baseRatios.map((ratio, i) => {
    const frac = i / (baseRatios.length - 1);
    return {
      ratio,
      gain: 1 / (1 + i * 0.55), // upper modes radiate less
      decay: decay0 * (1 - frac * 0.78), // highs die faster
      beta: 0.012 + frac * 0.05, // highs sharpen more under tension
    };
  });
  return { name, fundamental, modes, couple, hue };
}

// Inharmonic clustered ratio sets (stretched, paired — metal, not tones)
const BODIES: BodySpec[] = [
  makeBody(
    "Bell-plate",
    320,
    [1, 2.04, 2.79, 3.01, 4.18, 4.34, 5.43, 6.79, 7.12, 8.61, 9.84, 11.2],
    2.6,
    0.06,
    42 // hot amber
  ),
  makeBody(
    "Medium gong",
    150,
    [1, 1.52, 2.01, 2.34, 2.97, 3.41, 4.06, 4.83, 5.51, 6.4, 7.72, 9.1, 10.6],
    5.0,
    0.11,
    188 // cyan
  ),
  makeBody(
    "Large tam-tam",
    78,
    [
      1, 1.43, 1.88, 2.21, 2.66, 3.04, 3.55, 4.12, 4.71, 5.39, 6.18, 7.05,
      8.2, 9.6, 11.1, 12.9,
    ],
    8.5,
    0.16,
    24 // deep amber
  ),
  makeBody(
    "Cymbal-disc",
    240,
    [
      1, 1.59, 2.13, 2.96, 3.17, 3.89, 4.51, 5.33, 6.27, 7.41, 8.9, 10.7,
      12.4, 14.8,
    ],
    1.9,
    0.09,
    196 // steel cyan
  ),
];

// keyboard map: a row of keys → strikes. Each maps to a strike on the
// active body at a strike-position offset (shifts which modes are lit).
const KEY_ROW = ["a", "s", "d", "f", "g", "h", "j", "k"] as const;
// number keys 1-4 select a body
const BODY_KEYS = ["1", "2", "3", "4"] as const;

type WireState = {
  active: number;
  amps: Float32Array;
  freqs: Float32Array;
  energy: number;
};

export default function TensionGongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("");
  const [noWorklet, setNoWorklet] = useState(false);
  const [activeBody, setActiveBody] = useState(0);
  const [midiName, setMidiName] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const urlRef = useRef<string | null>(null);
  const midiRef = useRef<MIDIAccess | null>(null);
  const stateRef = useRef<WireState>({
    active: 0,
    amps: new Float32Array(BODIES[0].modes.length),
    freqs: new Float32Array(BODIES[0].modes.length),
    energy: 0,
  });
  const activeRef = useRef(0);
  const heldRef = useRef<Map<string, number>>(new Map()); // key → down time
  const lastStrikeRef = useRef(0);
  const rafRef = useRef(0);

  // ── send a strike to the worklet ──────────────────────────────────
  const runStrike = useCallback((vel: number, bodyIdx?: number) => {
    const node = nodeRef.current;
    if (!node) return;
    node.port.postMessage({
      type: "strike",
      vel: Math.max(0, Math.min(1, vel)),
      body: bodyIdx ?? null,
    });
  }, []);

  const selectBody = useCallback((idx: number) => {
    activeRef.current = idx;
    setActiveBody(idx);
    const node = nodeRef.current;
    if (node) node.port.postMessage({ type: "select", body: idx });
    // resize visual buffers to the new body's mode count
    const n = BODIES[idx].modes.length;
    stateRef.current = {
      active: idx,
      amps: new Float32Array(n),
      freqs: new Float32Array(n),
      energy: 0,
    };
  }, []);

  // ── MIDI: note-on velocity drives strikes; degrade silently ───────
  const runMidi = useCallback(
    (access: MIDIAccess) => {
      midiRef.current = access;
      let named = false;
      const onMsg = (e: MIDIMessageEvent) => {
        const data = e.data;
        if (!data) return;
        const status = data[0] & 0xf0;
        if (status === 0x90 && data[2] > 0) {
          // note-on: velocity 0..127 → strike velocity
          runStrike(data[2] / 127);
        } else if (status === 0xb0 && data[1] === 0 && data[2] < 4) {
          // bank-select-ish CC → body switch (optional convenience)
          selectBody(data[2]);
        }
      };
      access.inputs.forEach((inp) => {
        inp.onmidimessage = onMsg;
        if (!named) {
          setMidiName(inp.name ?? "MIDI device");
          named = true;
        }
      });
      access.onstatechange = () => {
        access.inputs.forEach((inp) => {
          inp.onmidimessage = onMsg;
        });
      };
    },
    [runStrike, selectBody]
  );

  // ── start audio (must be inside a user gesture) ───────────────────
  const start = useCallback(async () => {
    if (started) return;
    setStatus("Tuning the metal…");
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      await ctx.resume();

      const master = ctx.createGain();
      master.gain.value = 0.5;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 12000;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      master.connect(lp).connect(comp).connect(ctx.destination);

      const hasWorklet =
        typeof ctx.audioWorklet !== "undefined" &&
        typeof AudioWorkletNode !== "undefined";

      if (!hasWorklet) {
        setNoWorklet(true);
        setStatus("AudioWorklet unavailable — this piece needs it to ring.");
        return;
      }

      const blob = new Blob([WORKLET_SOURCE], {
        type: "application/javascript",
      });
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, "gong-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          bodies: BODIES.map((b) => ({
            fundamental: b.fundamental,
            modes: b.modes,
            couple: b.couple,
          })),
        },
      });
      node.port.onmessage = (e) => {
        if (e.data?.type === "state") {
          stateRef.current = {
            active: e.data.active,
            amps: e.data.amps,
            freqs: e.data.freqs,
            energy: e.data.energy,
          };
        }
      };
      node.connect(master);
      nodeRef.current = node;
      node.port.postMessage({ type: "select", body: activeRef.current });

      // attempt Web MIDI — degrade silently to keyboard if unavailable
      const navAny = navigator as Navigator & {
        requestMIDIAccess?: () => Promise<MIDIAccess>;
      };
      if (navAny.requestMIDIAccess) {
        navAny
          .requestMIDIAccess()
          .then(runMidi)
          .catch(() => {
            /* no MIDI — keyboard only, silently */
          });
      }

      setStarted(true);
      setStatus("");
      // a soft opening strike so it greets you with a glide
      setTimeout(() => runStrike(0.85), 250);
    } catch (err) {
      console.error(err);
      setStatus("Audio could not start in this browser.");
    }
  }, [started, runMidi, runStrike]);

  // ── keyboard input (NON-POINTER primary instrument) ───────────────
  useEffect(() => {
    if (!started) return;

    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if ((BODY_KEYS as readonly string[]).includes(k)) {
        selectBody(Number(k) - 1);
        return;
      }
      if ((KEY_ROW as readonly string[]).includes(k)) {
        heldRef.current.set(k, performance.now());
        // strike velocity: Shift = hard; otherwise a base velocity that
        // also rises if you're playing fast (recent previous strike).
        const now = performance.now();
        const sinceLast = now - lastStrikeRef.current;
        lastStrikeRef.current = now;
        const fast = Math.max(0, 1 - sinceLast / 400); // rapid → harder
        let vel = e.shiftKey ? 1.0 : 0.4 + fast * 0.35;
        // strike position across the key row tilts the spectrum a touch:
        // keys further right favour higher modes (encoded as extra vel
        // bias so the worklet lights more highs).
        const pos = KEY_ROW.indexOf(k as (typeof KEY_ROW)[number]);
        vel = Math.min(1, vel + (pos / (KEY_ROW.length - 1)) * 0.18);
        runStrike(vel);
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const downAt = heldRef.current.get(k);
      if (downAt != null) {
        heldRef.current.delete(k);
        // key-HOLD duration adds a follow-up "press" strike: holding a
        // key longer before release fires a softer secondary tap (lets
        // you shape velocity by hold time as the brief requires).
        const held = performance.now() - downAt;
        if (held > 220) {
          const vel = Math.min(1, 0.25 + held / 1400);
          runStrike(vel);
        }
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [started, runStrike, selectBody]);

  // ── visual loop: Chladni-style nodal plot + pitch-glide strip ─────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const t0 = performance.now();
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      drawScene(ctx2d, canvas.width, canvas.height, stateRef.current, t);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  // ── teardown on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        if (midiRef.current) {
          midiRef.current.inputs.forEach((i) => {
            i.onmidimessage = null;
          });
          midiRef.current.onstatechange = null;
        }
        nodeRef.current?.disconnect();
        const ctx = ctxRef.current;
        if (ctx && ctx.state !== "closed") ctx.close();
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      } catch {
        /* ignore teardown errors */
      }
    };
  }, []);

  const body = BODIES[activeBody];

  return (
    <main className="relative h-[calc(100dvh-3rem)] w-full overflow-hidden bg-[#08090b] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="pointer-events-auto p-5 sm:p-7">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Tension Gong
          </h1>
          <p className="mt-1 max-w-2xl text-base text-white/80">
            A struck-metal resonator built on{" "}
            <span className="text-amber-300/95">
              non-linear modal synthesis
            </span>
            . Hit it hard and the pitch starts sharp, then blooms and glides
            down as the energy bleeds away — the bend is the synthesis, not an
            effect.
          </p>

          {started && (
            <div className="mt-3 max-w-2xl space-y-2">
              <p className="text-base text-white/80">
                Play with the keyboard.{" "}
                <span className="text-white/95">A S D F G H J K</span> strike
                the metal · hold <span className="text-white/95">Shift</span>{" "}
                for a hard, sharp, pitch-bending hit · play fast for harder
                strikes · <span className="text-white/95">1 2 3 4</span> switch
                bodies.
              </p>
              <p className="text-base text-white/75">
                Active body:{" "}
                <span className="text-amber-300/95">{body.name}</span>
                {midiName ? (
                  <span className="text-emerald-300/95">
                    {" "}
                    · MIDI: {midiName} (note velocity drives strikes)
                  </span>
                ) : (
                  <span className="text-white/75">
                    {" "}
                    · no MIDI device — keyboard only
                  </span>
                )}
              </p>
            </div>
          )}

          {noWorklet && (
            <p className="mt-2 max-w-2xl text-base text-rose-300">
              AudioWorklet is unavailable in this browser — the non-linear
              modal synthesis needs a worklet to run, so this piece cannot
              ring here.
            </p>
          )}
          {status && !started && (
            <p className="mt-2 text-base text-white/75">{status}</p>
          )}
        </header>

        <div className="flex-1" />

        {!started && (
          <div className="pointer-events-auto flex items-center justify-center pb-16">
            <button
              onClick={start}
              className="min-h-[44px] rounded-full bg-amber-300/90 px-8 py-2.5 text-lg font-medium text-[#0a0a0a] shadow-lg transition-colors hover:bg-amber-200"
            >
              Strike the metal · press a key to start
            </button>
          </div>
        )}

        {started && (
          <div className="pointer-events-auto flex flex-wrap gap-2 p-5 sm:p-7">
            {BODIES.map((b, i) => (
              <button
                key={b.name}
                onClick={() => selectBody(i)}
                className={`min-h-[44px] rounded-lg border px-4 py-2.5 text-base font-medium transition-colors ${
                  i === activeBody
                    ? "border-amber-300/60 bg-amber-300/15 text-white"
                    : "border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                }`}
              >
                <span className="mr-1.5 text-white/55">{i + 1}</span>
                {b.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Canvas2D renderer ──────────────────────────────────────────────
// Clinical / metallurgical: brushed-steel greys on near-black, with the
// live modes drawn as Chladni-style nodal grids that brighten while they
// ring. A thin per-mode strip along the bottom shows each mode's
// amplitude and its instantaneous-vs-rest frequency (the pitch glide).
function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: WireState,
  t: number
) {
  // near-black wash with a faint steel vignette
  ctx.fillStyle = "#08090b";
  ctx.fillRect(0, 0, w, h);

  const body = BODIES[state.active] ?? BODIES[0];
  const hue = body.hue;
  const amps = state.amps;
  const freqs = state.freqs;
  const n = amps.length;

  // ── the plate: a square Chladni field, modes overlaid ─────────────
  const pad = Math.min(w, h) * 0.16;
  const plateTop = pad * 0.7;
  const stripH = Math.min(150 * (window.devicePixelRatio || 1), h * 0.22);
  const size = Math.min(w - pad * 2, h - plateTop - stripH - pad);
  const px = (w - size) / 2;
  const py = plateTop;

  // brushed-steel plate backing
  ctx.save();
  ctx.translate(px, py);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "#16181c");
  grad.addColorStop(0.5, "#202329");
  grad.addColorStop(1, "#131519");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // faint brushed striations
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 6) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

  // ── Chladni nodal lines per mode ──────────────────────────────────
  // Each mode i gets a 2D standing-wave pattern sin(mπx)sin(nπy); its
  // nodal lines (zero crossings) are drawn, brightening with the mode's
  // live amplitude. We sample on a grid and stroke near-zero contours.
  const cells = 60;
  const cw = size / cells;
  for (let i = 0; i < n; i++) {
    const a = Math.min(1, amps[i]);
    if (a < 0.01) continue;
    // mode shape numbers from the partial index (more lines higher up)
    const mx = 1 + (i % 4);
    const ny = 1 + Math.floor(i / 4) + (i % 2);
    const bright = a * a;
    ctx.fillStyle = `hsla(${hue}, ${60 + a * 30}%, ${
      45 + a * 35
    }%, ${0.04 + bright * 0.5})`;
    for (let gx = 0; gx < cells; gx++) {
      const xx = (gx + 0.5) / cells;
      const sx = Math.sin(mx * Math.PI * xx);
      for (let gy = 0; gy < cells; gy++) {
        const yy = (gy + 0.5) / cells;
        const v = sx * Math.sin(ny * Math.PI * yy);
        // draw cells NEAR a nodal line (|v| small) — the sand collects
        if (Math.abs(v) < 0.12) {
          ctx.fillRect(gx * cw, gy * cw, cw + 0.5, cw + 0.5);
        }
      }
    }
  }
  // hot core glow at plate centre scaled by global energy
  const e = Math.min(1, state.energy);
  if (e > 0.01) {
    const cg = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size * 0.5
    );
    cg.addColorStop(0, `hsla(${hue}, 80%, 60%, ${e * 0.18})`);
    cg.addColorStop(1, "hsla(0,0%,0%,0)");
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.restore();

  // ── per-mode amplitude / pitch-glide strip ────────────────────────
  const sx0 = px;
  const sy0 = py + size + pad * 0.5;
  const sw = size;
  const sh = stripH;
  ctx.save();
  ctx.translate(sx0, sy0);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, sw, sh);
  const barW = sw / n;
  for (let i = 0; i < n; i++) {
    const a = Math.min(1, amps[i]);
    const f0 = body.fundamental * body.modes[i].ratio;
    const fi = freqs[i] || f0;
    // pitch glide: how far above rest the instantaneous freq sits (0..1)
    const glide = Math.max(0, Math.min(1, (fi / f0 - 1) / 0.25));
    const bx = i * barW;
    // amplitude column (brushed steel → hot accent with amplitude)
    const bh = a * sh;
    ctx.fillStyle = `hsla(${hue}, ${50 + a * 35}%, ${
      40 + a * 35
    }%, ${0.25 + a * 0.6})`;
    ctx.fillRect(bx + 1, sh - bh, barW - 2, bh);
    // pitch-glide tick: a marker rising above the bar as the mode sharpens
    if (a > 0.02) {
      const ty = sh - bh - glide * (sh * 0.5) - 3;
      ctx.fillStyle = `hsla(${(hue + 30) % 360}, 90%, 70%, ${
        0.4 + glide * 0.6
      })`;
      ctx.fillRect(bx + 1, ty, barW - 2, 2 + glide * 4);
    }
  }
  // baseline + label cue
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, sh - 0.5);
  ctx.lineTo(sw, sh - 0.5);
  ctx.stroke();
  ctx.restore();

  // faint scanning sweep on the plate (oscilloscope-lab feel)
  ctx.save();
  ctx.translate(px, py);
  const sweepY = ((t * 0.18) % 1) * size;
  ctx.fillStyle = `hsla(${hue}, 40%, 60%, 0.04)`;
  ctx.fillRect(0, sweepY, size, 2);
  ctx.restore();
}
