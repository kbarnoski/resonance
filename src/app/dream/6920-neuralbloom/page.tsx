"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 6920-neuralbloom — WALK THE BIFURCATION of your own visual cortex with your voice.
//
// A WebGL2 ping-pong Wilson–Cowan neural field self-organises (Turing instability)
// into cortical stripes / spots / hexagons. The mic's spectral centroid (your
// pitch) drives the Mexican-hat inhibition radius rI — the Turing WAVELENGTH — plus
// a hexagon-favouring bias, so humming up and down walks the pattern's SYMMETRY
// CLASS continuously. Rendered through the retino-cortical complex-log map, those
// classes read out as tunnels → cobwebs → honeycombs. Your voice IS the axis.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { SafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  NeuralField,
  hasWebGL2,
  mulberry32,
  regimeLabel,
  type Regime,
} from "./field";
import { makeFieldAudio, type FieldAudio } from "./audio";

type Backend = "init" | "ok" | "unsupported";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

// spectral-centroid window (Hz) mapped onto the pitch axis mu ∈ [0,1]
const CENTROID_LO = 320;
const CENTROID_HI = 1600;

export default function NeuralBloomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [backend, setBackend] = useState<Backend>("init");
  const [audioOn, setAudioOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [sensitivity, setSensitivity] = useState(1.5);
  const [manualPitch, setManualPitch] = useState(0.5);
  const [regime, setRegime] = useState<Regime>("tunnel");
  const [coherence, setCoherence] = useState(0);
  const [muDisplay, setMuDisplay] = useState(0.5);

  const mic = useMicAnalyser({ smoothing: 0.8, gain: 1.5 });
  const { start: micStart, getFrame, running: micRunning, error: micError, setGain } = mic;

  // refs bridging React state into the rAF loop
  const modeRef = useRef<"auto" | "manual" | "mic">("auto");
  const manualPitchRef = useRef(0.5);
  const getFrameRef = useRef(getFrame);
  const audioRef = useRef<FieldAudio | null>(null);

  useEffect(() => { getFrameRef.current = getFrame; }, [getFrame]);
  useEffect(() => { manualPitchRef.current = manualPitch; }, [manualPitch]);
  useEffect(() => { setGain(sensitivity); }, [sensitivity, setGain]);
  useEffect(() => { if (micRunning) modeRef.current = "mic"; }, [micRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!hasWebGL2()) {
      setBackend("unsupported");
      return;
    }

    const reduced = prefersReducedMotion();
    const flicker = new SafeFlicker({ maxHz: 3, defaultHz: 0.6, floor: 0.82 });
    // flicker stays OFF by default — the inward drift is the motion, not a strobe.

    let field: NeuralField;
    try {
      field = new NeuralField(canvas, mulberry32(0x6920));
    } catch {
      setBackend("unsupported");
      return;
    }
    setBackend("ok");

    const audio = makeFieldAudio();
    audioRef.current = audio;

    const burstRng = mulberry32(0x6920 ^ 0x9e37);
    let disposed = false;
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    let frameCount = 0;
    let muSmooth = 0.5;
    let drift = 0;
    let brightSmooth = 0.92;
    let burstX = 0.5;
    let burstY = 0.5;
    let burstAmp = 0;
    let regimeBlend = 0;

    const frame = () => {
      if (disposed) return;
      const now = performance.now();
      const elapsed = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // ── pitch axis: mu ∈ [0,1] — the headline control ────────────────────
      let muTarget: number;
      let drive: number;
      const f = modeRef.current === "mic" ? getFrameRef.current() : null;
      if (f) {
        muTarget = clamp01((f.centroid - CENTROID_LO) / (CENTROID_HI - CENTROID_LO));
        drive = 0.14 + 0.55 * f.amplitude;
        if (f.onset) {
          burstX = burstRng();
          burstY = burstRng();
          burstAmp = 0.9;
        }
      } else if (modeRef.current === "manual") {
        muTarget = manualPitchRef.current;
        drive = 0.17 + 0.05 * Math.sin(elapsed * 0.7);
      } else {
        // auto-sweep: self-demo the stripes ↔ hexagon morph before mic permission
        muTarget = 0.5 + 0.46 * Math.sin(elapsed * 0.09 * TAU);
        drive = 0.16 + 0.05 * Math.sin(elapsed * 0.13 * TAU + 1.0);
      }
      muSmooth = lerp(muSmooth, muTarget, 0.06);
      burstAmp *= 0.6; // decays quickly after the flash

      // mu → Mexican-hat geometry: rI (Turing wavelength) + hexagon bias
      const rE = 1.2;
      const rI = lerp(2.2, 5.6, muSmooth);
      const asym = lerp(0.0, 0.34, muSmooth);

      const substeps = reduced ? 4 : 6;
      field.step({
        rE, rI, asym, drive,
        burstAmp,
        burstX, burstY,
        substeps,
      });

      drift += dt * (reduced ? 0.012 : 0.03);
      const lum = flicker.value(elapsed);
      brightSmooth = lerp(brightSmooth, 0.9 + 0.12 * clamp01(regimeBlend * 0.4 + 0.4), 0.05);
      field.render({ drift, bright: brightSmooth * lum, mu: muSmooth });

      // ── coarse regime read-back (from the field) every ~10 frames ─────────
      frameCount++;
      if (frameCount % 10 === 0) {
        const r = field.readRegime(muSmooth);
        setRegime(r.regime);
        setCoherence(r.coherence);
        setMuDisplay(muSmooth);
        // audio: DRIVE + regime blend (stripes→0, hexagons→1)
        regimeBlend = muSmooth;
        const a = audioRef.current;
        if (a && a.running()) {
          a.setDrive(clamp01(drive * 1.4));
          a.setRegime(regimeBlend);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      field.dispose();
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  const beginAudio = useCallback(() => {
    audioRef.current?.resume().catch(() => {});
    setAudioOn(true);
  }, []);

  const beginMic = useCallback(() => {
    if (!audioRef.current?.running()) beginAudio();
    micStart().catch(() => {});
  }, [beginAudio, micStart]);

  const onManualPitch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setManualPitch(v);
    if (!micRunning) modeRef.current = "manual";
  }, [micRunning]);

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {backend === "unsupported" && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            This piece needs WebGL2 to grow the cortical neural field, and your
            browser did not provide it. Try a recent Chrome, Firefox, or Safari.
          </p>
        </div>
      )}

      {/* title + live regime readout */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Neural Bloom
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          Walk the bifurcation of your own visual cortex with your voice.
        </p>
        <div className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dominant form-constant
        </div>
        <p className="mt-1 text-base text-primary">{regimeLabel(regime)}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            pitch
          </span>
          <div className="h-1.5 w-40 overflow-hidden rounded-md bg-border">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.round(muDisplay * 100)}%` }}
            />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {muDisplay < 0.34 ? "low" : muDisplay < 0.67 ? "mid" : "high"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            stripe
          </span>
          <div className="h-1.5 w-40 overflow-hidden rounded-md bg-border">
            <div
              className="h-full bg-primary/70"
              style={{ width: `${Math.round(clamp01(coherence / 0.7) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* design-notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* controls */}
      <div className="absolute bottom-6 left-1/2 z-20 w-[min(92vw,560px)] -translate-x-1/2 rounded-lg border border-border bg-background/70 px-5 py-4 backdrop-blur-sm">
        <div className="flex flex-wrap gap-2">
          {!audioOn && (
            <button
              type="button"
              onClick={beginAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Begin
            </button>
          )}
          {!micRunning && (
            <button
              type="button"
              onClick={beginMic}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Hum to the cortex
            </button>
          )}
          {micRunning && (
            <span className="flex min-h-[44px] items-center px-2 text-sm text-primary">
              Listening — slide your pitch up and down.
            </span>
          )}
        </div>

        {micError && (
          <p className="mt-2 text-sm text-destructive">{micError}</p>
        )}

        {/* manual pitch fallback — the bifurcation axis without a mic */}
        <label className="mt-4 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Pitch axis {micRunning ? "(mic active)" : "(manual)"}
        </label>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
          <span>Tunnels</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={manualPitch}
            onChange={onManualPitch}
            disabled={micRunning}
            aria-label="Pitch axis: tunnels to honeycomb"
            className="h-1.5 flex-1 cursor-pointer accent-primary disabled:opacity-40"
          />
          <span>Honeycomb</span>
        </div>

        <label className="mt-3 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Mic sensitivity
        </label>
        <input
          type="range"
          min={0.4}
          max={3.5}
          step={0.1}
          value={sensitivity}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          aria-label="Microphone sensitivity"
          className="mt-2 h-1.5 w-full cursor-pointer accent-primary"
        />
      </div>

      {/* notes dialog */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A 256×256 sheet of model cortex runs a Wilson–Cowan neural field on
                the GPU — two coupled rates, excitatory and inhibitory, ping-ponged
                by a WebGL2 fragment shader. Tuned near its Turing instability the
                sheet spontaneously self-organises into stripes, spots and hexagons.
              </p>
              <p>
                The pattern&apos;s symmetry class is set by one thing: the Turing
                wavelength, which is the ratio of the short-range excitation radius
                to the longer-range inhibition radius of the Mexican-hat coupling.
                Your voice&apos;s spectral centroid — its pitch — drives that
                inhibition radius (and a hexagon-favouring bias), so humming up and
                down walks the field continuously from stripes to spots to hexagons.
              </p>
              <p>
                The render pass warps the sheet through the retino-cortical complex
                logarithm (Ermentrout &amp; Cowan 1979; Bressloff et al. 2001), the
                map from your eye to V1. Under it, cortical stripes read out as
                tunnels, spots as cobwebs, and a hexagonal lattice as an expanding
                honeycomb — Klüver&apos;s form constants. The little readout at top
                estimates which class currently dominates from the field&apos;s own
                structure-tensor coherence.
              </p>
              <p>
                A just-intonation drone tracks your loudness (DRIVE across the
                bifurcation) and lights an upper partial as the pattern reaches
                honeycomb, so the ear follows the same morph.
              </p>
              <p>
                Safety: continuous smooth field motion, no strobe; global brightness
                drifts well under 3 Hz and honours reduced-motion. References:
                Wilson &amp; Cowan (1972); Ermentrout &amp; Cowan (1979); Bressloff
                et al. (2001); bioRxiv 2026-02-18 on stroboscopic hallucination
                geometry.
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
