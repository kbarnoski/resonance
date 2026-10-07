"use client";

/* ── 19600 · Imbue ──────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if one of Karel's recordings became the resonant BODY that
 *  another of his recordings plays inside — and my body chose which MOMENT of
 *  that second recording the first one gets to resonate in?
 *
 *  INPUT  : MediaPipe PoseLandmarker (full body, shared loader). We read ONLY the
 *           two shoulders and the nose — what a seated desk webcam truly sees:
 *             · torso HEIGHT (sit tall ↔ low) → SCAN: which moment of the "body"
 *               take becomes the impulse response the voice resonates in.
 *             · shoulder WIDTH (lean toward/away) → IMBUE: dry recording ↔ fully
 *               dissolved into the other's resonance.
 *             · lateral LEAN (left ↔ right)      → TONE: cavern-dark ↔ bright,
 *               sympathetic resonance.
 *  TECHNIQUE: CONVOLUTION CROSS-SYNTHESIS between two real takes. The EXCITER take
 *           (Interplay) is the piano you hear. The BODY take (Isolation) is never
 *           heard directly — instead, five ~0.6s windowed, energy-normalized slices
 *           of it are pre-rendered as impulse responses and loaded into five
 *           ConvolverNodes. The exciter is convolved through all five; SCAN
 *           equal-power-crossfades between adjacent convolvers, so as my body
 *           moves, the exciter literally resonates inside a *different moment* of
 *           the other recording — the IR is navigable material, not a static
 *           filter. The body take has ZERO path to the speakers; it exists only as
 *           the shape of the resonance. So one recording plays *through* the body
 *           of the other. This is the lab's first convolution cross-synthesis of
 *           ONE real take by ANOTHER (every prior convolver proto used a synthetic
 *           IR or a take's own self-tail). The whole mix terminates in safeMaster.
 *  OUTPUT : layered Canvas2D — a "chamber" of sympathetic resonant strings whose
 *           standing-wave pattern is set by SCAN (the current B-slice) and whose
 *           amplitudes read the 12-band spectrum of the convolved signal; a
 *           traveling voice filament for the dry exciter; an amber resonance bloom
 *           that swells at convolution peaks. Achromatic nocturne (graphite ground,
 *           pearl strings, a single warm amber accent). Rests the jury-banned
 *           three.js AND the now-overused raw-WebGL2 — a rich Canvas2D stage.
 *
 *  Research anchor: **Concatenation-Driven Convolution** (Abate & Hansen, DAFx26,
 *  2026) — "reconceptualizes impulse responses as dynamic, navigable sonic
 *  material rather than static filters; any audio material can serve as the
 *  navigable source, extending convolution into timbral processing and
 *  cross-synthesis via gesture-based traversal." Imbue is that idea, built with a
 *  five-tap navigable IR bank and, under ABSOLUTE rule 10, Karel's REAL recordings
 *  on both sides instead of a measured corpus. Classic technique: convolution
 *  brassage / cross-synthesis (Curtis Roads, *Microsound*).
 *
 *  Alive on load via an autonomous demo (a slow drift of scan/imbue/tone) that
 *  drives the IDENTICAL body → parameter → audio+visual chain, so it breathes with
 *  no camera. See README.md.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── the two takes: EXCITER is heard; BODY is the resonance only ──────────────
const EXCITER = { id: "d57cfae6-f234-4d24-85fe-72a8ad93a44a", title: "Interplay" };
const BODY = { id: "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", title: "Isolation" };

// ── navigable IR bank: 5 slices of the BODY take ────────────────────────────
const NUM_IR = 5;
const IR_SECONDS = 0.6;
// where in the BODY take each slice is centred (0..1 of its duration)
const IR_POS = Array.from({ length: NUM_IR }, (_, i) => 0.1 + (0.8 * i) / (NUM_IR - 1));

// ── visual spectrum bands ─────────────────────────────────────────────────────
const NUM_BANDS = 12;
const BAND_LO = 90;
const BAND_HI = 6500;
const BAND_FREQS: number[] = Array.from({ length: NUM_BANDS }, (_, i) =>
  BAND_LO * Math.pow(BAND_HI / BAND_LO, i / (NUM_BANDS - 1)),
);

const N_STRINGS = 22;
const STRING_SEG = 72; // points per resonant string

type Driver = "live" | "pointer" | "demo";

interface Engine {
  startAudio: () => void;
  stopAudio: () => void;
  startCam: () => Promise<void>;
}

interface Readout {
  driver: Driver;
  lost: boolean;
  scan: number;
  imbue: number;
  loaded: number; // 0,1,2 takes decoded
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ── body → three normalized signals. Gate on shoulders only (seated-safe). ───
function readBody(lm: Array<{ x: number; y: number; visibility?: number }>): {
  scan: number;
  imbue: number;
  tone: number;
  present: boolean;
} {
  const ls = lm[POSE_LM.leftShoulder];
  const rs = lm[POSE_LM.rightShoulder];
  const nose = lm[POSE_LM.nose];
  if (!ls || !rs) return { scan: 0.5, imbue: 0.25, tone: 0.6, present: false };
  const vis = ((ls.visibility ?? 1) + (rs.visibility ?? 1)) / 2;
  if (vis < 0.4) return { scan: 0.5, imbue: 0.25, tone: 0.6, present: false };

  // centre x from shoulders (+nose when seen); mirror so leaning left reads left
  let cx = (ls.x + rs.x) / 2;
  if (nose && (nose.visibility ?? 1) > 0.4) cx = (cx * 2 + nose.x) / 3;
  const tone = clamp01(1 - cx); // lean right → bright, lean left → dark

  // depth proxy: normalized shoulder width (~0.16 far … ~0.42 near) → imbue
  const shoulderW = Math.abs(ls.x - rs.x);
  const imbue = clamp01((shoulderW - 0.16) / (0.42 - 0.16));

  // torso height → scan position through the BODY take (sit tall → later moment)
  const cy = (ls.y + rs.y) / 2;
  const scan = clamp01(1 - (cy - 0.25) / 0.5);

  return { scan, imbue, tone, present: true };
}

function runDemo(tSec: number): { scan: number; imbue: number; tone: number } {
  return {
    scan: 0.5 + Math.sin(tSec * 0.11) * 0.46,
    imbue: 0.42 + Math.sin(tSec * 0.19 + 1.1) * 0.36,
    tone: 0.5 + Math.sin(tSec * 0.15 + 2.3) * 0.34,
  };
}

export default function ImbuePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const { immersive, toggle } = useImmersive();

  const [soundOn, setSoundOn] = useState(false);
  const [camState, setCamState] = useState<"idle" | "starting" | "on" | "failed">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({
    driver: "demo",
    lost: false,
    scan: 0.5,
    imbue: 0.25,
    loaded: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── live-control signals (written by the loop, read by audio + visuals) ──
    let scan = 0.5;
    let imbue = 0.25;
    let tone = 0.6;
    const bands = new Float32Array(NUM_BANDS); // visual band energies 0..1
    let energy = 0; // overall resonance energy 0..1

    // ── pointer fallback ──────────────────────────────────────────────────────
    let ptrActive = false;
    let ptrTone = 0.6;
    let ptrImbue = 0.25;
    function onPointer(e: PointerEvent) {
      ptrActive = true;
      ptrTone = clamp01(e.clientX / window.innerWidth);
      ptrImbue = clamp01(1 - e.clientY / window.innerHeight);
    }
    window.addEventListener("pointermove", onPointer);

    // ════════════════════════════════════════════════════════════════════════
    //  AUDIO — convolution cross-synthesis: exciter take through a navigable
    //  bank of impulse responses sliced from the BODY take
    // ════════════════════════════════════════════════════════════════════════
    let ctx: AudioContext | null = null;
    let master: SafeMaster | null = null;
    let srcE: AudioBufferSourceNode | null = null;
    let started = false;
    let loaded = 0;

    let dryGain: GainNode | null = null;
    let wetGain: GainNode | null = null;
    let wetLP: BiquadFilterNode | null = null;
    const convGains: GainNode[] = [];

    // build one energy-normalized, Hann-windowed IR from a slice of the body take
    function makeIR(ac: AudioContext, body: AudioBuffer, pos01: number): AudioBuffer {
      const sr = body.sampleRate;
      const len = Math.max(1, Math.floor(IR_SECONDS * sr));
      const chN = Math.min(2, body.numberOfChannels);
      const start = Math.min(
        body.length - len,
        Math.max(0, Math.floor(pos01 * (body.length - len))),
      );
      const ir = ac.createBuffer(chN, len, sr);
      let sumSq = 0;
      for (let c = 0; c < chN; c++) {
        const src = body.getChannelData(c);
        const dst = ir.getChannelData(c);
        for (let i = 0; i < len; i++) {
          // Hann window so the IR is a smooth resonant body, not a click
          const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1));
          const v = src[start + i] * w;
          dst[i] = v;
          sumSq += v * v;
        }
      }
      // normalize to unit L2 energy, then a conservative makeup so wet level is
      // predictable (safeMaster's limiter is the backstop)
      const norm = sumSq > 1e-9 ? 0.9 / Math.sqrt(sumSq) : 0;
      for (let c = 0; c < chN; c++) {
        const dst = ir.getChannelData(c);
        for (let i = 0; i < len; i++) dst[i] *= norm;
      }
      return ir;
    }

    async function buildAudio() {
      if (ctx) return;
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      // safeMaster connects its own tamed output to ctx.destination internally,
      // so everything audible routes through the shelf/cap/limiter — the proto
      // only ever connects sources INTO master.input, never raw to destination.
      master = createSafeMaster(ctx, { gain: 0.9 });

      let bufE: AudioBuffer | null = null;
      let bufB: AudioBuffer | null = null;
      try {
        const e = await loadRealTrackBuffer(ctx, EXCITER.id);
        bufE = e.buffer;
        loaded = 1;
        setReadout((r) => ({ ...r, loaded: 1 }));
        const b = await loadRealTrackBuffer(ctx, BODY.id);
        bufB = b.buffer;
        loaded = 2;
        setReadout((r) => ({ ...r, loaded: 2 }));
      } catch {
        setNotice("Couldn't load Karel's recordings — check your connection and reload.");
        return;
      }
      if (!bufE || !bufB) return;

      srcE = ctx.createBufferSource();
      srcE.buffer = bufE;
      srcE.loop = true;

      // dry voice (the exciter you hear directly)
      dryGain = ctx.createGain();
      dryGain.gain.value = Math.cos(imbue * Math.PI * 0.5);
      srcE.connect(dryGain);

      // wet bus: exciter convolved through the navigable IR bank
      wetLP = ctx.createBiquadFilter();
      wetLP.type = "lowpass";
      wetLP.frequency.value = 2600;
      wetLP.Q.value = 0.4;
      wetGain = ctx.createGain();
      wetGain.gain.value = Math.sin(imbue * Math.PI * 0.5);

      for (let i = 0; i < NUM_IR; i++) {
        const conv = ctx.createConvolver();
        conv.normalize = false; // we energy-normalized the IR ourselves
        conv.buffer = makeIR(ctx, bufB, IR_POS[i]);
        const g = ctx.createGain();
        g.gain.value = i === Math.round((NUM_IR - 1) * scan) ? 1 : 0;
        srcE.connect(conv);
        conv.connect(g);
        g.connect(wetLP);
        convGains[i] = g;
      }
      wetLP.connect(wetGain);

      // the BODY take is NEVER connected to a source — it lives only as IR shape
      dryGain.connect(master.input);
      wetGain.connect(master.input);

      srcE.start();
    }

    function startAudio() {
      if (started) return;
      started = true;
      setSoundOn(true);
      void (async () => {
        await buildAudio();
        if (ctx && ctx.state === "suspended") await ctx.resume();
      })();
    }
    function stopAudio() {
      started = false;
      setSoundOn(false);
      try {
        srcE?.stop();
      } catch {
        /* already stopped */
      }
      srcE = null;
      convGains.length = 0;
      master?.disconnect();
      void ctx?.close();
      ctx = null;
      master = null;
    }

    // apply smoothed control params to the audio graph
    function applyAudio() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const tau = 0.14;
      // dry ↔ wet equal-power crossfade
      dryGain?.gain.setTargetAtTime(Math.cos(imbue * Math.PI * 0.5), t, tau);
      wetGain?.gain.setTargetAtTime(Math.sin(imbue * Math.PI * 0.5) * 1.15, t, tau);
      // SCAN: equal-power crossfade between the two bracketing convolvers
      const f = scan * (NUM_IR - 1);
      const i0 = Math.min(NUM_IR - 2, Math.floor(f));
      const frac = Math.max(0, Math.min(1, f - i0));
      for (let i = 0; i < NUM_IR; i++) {
        let g = 0;
        if (i === i0) g = Math.cos(frac * Math.PI * 0.5);
        else if (i === i0 + 1) g = Math.sin(frac * Math.PI * 0.5);
        convGains[i]?.gain.setTargetAtTime(g, t, 0.18);
      }
      // TONE: cavern-dark ↔ sympathetic-bright
      const cutoff = 420 * Math.pow(9000 / 420, tone);
      wetLP?.frequency.setTargetAtTime(cutoff, t, tau);
    }

    // read 12 visual band energies + overall energy from the safeMaster analyser
    let specBuf: Uint8Array<ArrayBuffer> | null = null;
    let binEdges: number[] | null = null;
    function readBands() {
      if (!master || !ctx) {
        for (let i = 0; i < NUM_BANDS; i++) bands[i] *= 0.9;
        energy *= 0.9;
        return;
      }
      const an = master.analyser;
      if (!specBuf || specBuf.length !== an.frequencyBinCount) {
        specBuf = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
        const nyq = ctx.sampleRate / 2;
        binEdges = BAND_FREQS.map((f) =>
          Math.min(an.frequencyBinCount - 1, Math.round((f / nyq) * an.frequencyBinCount)),
        );
      }
      an.getByteFrequencyData(specBuf);
      let eSum = 0;
      for (let i = 0; i < NUM_BANDS; i++) {
        const lo = i === 0 ? 1 : binEdges![i - 1];
        const hi = Math.max(lo + 1, binEdges![i]);
        let s = 0;
        for (let b = lo; b < hi; b++) s += specBuf[b];
        const v = s / (hi - lo) / 255;
        bands[i] += (v - bands[i]) * 0.35;
        eSum += bands[i];
      }
      const e = eSum / NUM_BANDS;
      energy += (e - energy) * 0.25;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  VISUALS — layered Canvas2D chamber (rests three.js + raw-WebGL2)
    // ════════════════════════════════════════════════════════════════════════
    const ctx2d = canvas.getContext("2d");

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas!.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas!.clientHeight * dpr));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
      }
    }

    function render(tSec: number) {
      if (!ctx2d) return;
      sizeCanvas();
      const W = canvas!.width;
      const H = canvas!.height;
      const c = ctx2d;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const minDim = Math.min(W, H);

      // 1) persistence fade toward graphite ground
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
      c.fillStyle = reduce ? "rgba(8,9,12,0.34)" : "rgba(8,9,12,0.17)";
      c.fillRect(0, 0, W, H);

      // 2) amber resonance bloom (additive) — swells with convolution energy
      const bloomR = (0.18 + energy * 0.5 + imbue * 0.28) * minDim;
      const bloomA = clamp01(energy * 0.6 + imbue * 0.12) * 0.42;
      if (bloomA > 0.004) {
        c.globalCompositeOperation = "lighter";
        const grd = c.createRadialGradient(W / 2, H * 0.52, 0, W / 2, H * 0.52, bloomR);
        grd.addColorStop(0, `rgba(214,160,92,${bloomA})`);
        grd.addColorStop(0.5, `rgba(188,138,78,${bloomA * 0.4})`);
        grd.addColorStop(1, "rgba(188,138,78,0)");
        c.fillStyle = grd;
        c.fillRect(0, 0, W, H);
      }

      // 3) the CHAMBER — sympathetic resonant strings. Their standing-wave
      // pattern (wavenumber) is set by SCAN = which moment of the body take is
      // the IR; their amplitudes read the convolved spectrum. (additive pearl)
      c.globalCompositeOperation = "lighter";
      const marginY = H * 0.12;
      const span = H - marginY * 2;
      const amp0 = minDim * 0.055 * (0.4 + imbue * 0.9);
      for (let s = 0; s < N_STRINGS; s++) {
        const yn = s / (N_STRINGS - 1);
        const y0 = marginY + yn * span;
        const e = bands[s % NUM_BANDS];
        const k = 1.5 + scan * 9 + s * 0.22; // SCAN morphs the spatial pattern
        const phase = tSec * (reduce ? 0.15 : 0.5) * (0.3 + s * 0.045) + s * 0.7;
        const amp = amp0 * (0.12 + e * 1.0);
        const alpha = clamp01(0.05 + e * 0.6 + imbue * 0.14);
        if (alpha < 0.012) continue;
        c.beginPath();
        for (let p = 0; p <= STRING_SEG; p++) {
          const xn = p / STRING_SEG;
          const x = xn * W;
          // standing wave shaped by a soft end-pinned envelope
          const envp = Math.sin(xn * Math.PI);
          const d = amp * envp * Math.sin(k * xn * Math.PI * 2 + phase);
          const y = y0 + d;
          if (p === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.strokeStyle = `rgba(206,212,224,${alpha})`;
        c.lineWidth = Math.max(1, dpr * (0.7 + e * 1.5));
        c.stroke();
      }

      // 4) the VOICE filament — the dry exciter, a traveling near-white glow
      const voiceBright = clamp01((1 - imbue) * 0.6 + energy * 0.55);
      const vx = (0.5 + 0.44 * Math.sin(tSec * (reduce ? 0.12 : 0.33))) * W;
      const vw = minDim * 0.05;
      const vgrd = c.createLinearGradient(vx - vw, 0, vx + vw, 0);
      vgrd.addColorStop(0, "rgba(236,240,248,0)");
      vgrd.addColorStop(0.5, `rgba(236,240,248,${voiceBright * 0.5})`);
      vgrd.addColorStop(1, "rgba(236,240,248,0)");
      c.fillStyle = vgrd;
      c.fillRect(vx - vw, marginY * 0.5, vw * 2, H - marginY);

      // reset
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  CAMERA — pose tracking (optional, degrades to pointer/demo)
    // ════════════════════════════════════════════════════════════════════════
    let landmarker: PoseLandmarkerInst | null = null;
    let stream: MediaStream | null = null;
    let camActive = false;

    async function startCam() {
      if (camActive) return;
      setCamState("starting");
      try {
        landmarker = await createPoseTracker(1);
        const video = videoRef.current!;
        stream = await startCamera(video);
        camActive = true;
        setCamState("on");
      } catch {
        setCamState("failed");
        setNotice("Camera or pose model unavailable — pointer and the autonomous demo still drive it.");
      }
    }

    function readLive(
      nowMs: number,
    ): { scan: number; imbue: number; tone: number; present: boolean } | null {
      const video = videoRef.current;
      if (!landmarker || !stream || !video || video.readyState < 2) return null;
      let res;
      try {
        res = landmarker.detectForVideo(video, nowMs);
      } catch {
        return null;
      }
      const lm = res?.landmarks?.[0];
      if (!lm) return { scan: 0.5, imbue: 0.25, tone: 0.6, present: false };
      return readBody(lm);
    }

    // ── the one loop ──────────────────────────────────────────────────────────
    let raf = 0;
    let lastMs = performance.now();
    let sawReal = false;
    let uiAccum = 0;

    function loop(nowMs: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.06, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const nowS = nowMs / 1000;

      let tScan: number, tImbue: number, tTone: number;
      let driver: Driver = "demo";
      let lost = false;
      const live = readLive(nowMs);
      if (live) {
        if (live.present) {
          tScan = live.scan;
          tImbue = live.imbue;
          tTone = live.tone;
          driver = "live";
          sawReal = true;
        } else {
          lost = true;
          driver = sawReal ? "live" : "demo";
          const d = runDemo(nowS);
          tScan = d.scan;
          tImbue = d.imbue;
          tTone = d.tone;
        }
      } else if (ptrActive) {
        tTone = ptrTone;
        tImbue = ptrImbue;
        tScan = 0.5 + Math.sin(nowS * 0.1) * 0.46; // slow drift when pointing
        driver = "pointer";
      } else {
        const d = runDemo(nowS);
        tScan = d.scan;
        tImbue = d.imbue;
        tTone = d.tone;
        driver = "demo";
      }

      const k = Math.min(1, dt / 0.14);
      scan += (tScan - scan) * k;
      imbue += (tImbue - imbue) * k;
      tone += (tTone - tone) * k;

      applyAudio();
      readBands();
      render(nowS);

      uiAccum += dt;
      if (uiAccum > 0.12) {
        uiAccum = 0;
        setReadout((r) =>
          r.driver === driver &&
          r.lost === lost &&
          Math.abs(r.scan - scan) < 0.02 &&
          Math.abs(r.imbue - imbue) < 0.02 &&
          r.loaded === loaded
            ? r
            : { driver, lost, scan, imbue, loaded },
        );
      }
    }
    raf = requestAnimationFrame(loop);

    engineRef.current = { startAudio, stopAudio, startCam };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      try {
        landmarker?.close();
      } catch {
        /* noop */
      }
      stream?.getTracks().forEach((t) => t.stop());
      try {
        srcE?.stop();
      } catch {
        /* noop */
      }
      master?.disconnect();
      void ctx?.close();
      engineRef.current = null;
    };
  }, []);

  // ── UI handlers ─────────────────────────────────────────────────────────────
  const onStart = useCallback(() => {
    engineRef.current?.startAudio();
  }, []);
  const onStop = useCallback(() => {
    engineRef.current?.stopAudio();
  }, []);
  const onCam = useCallback(() => {
    void engineRef.current?.startCam();
  }, []);

  const driverLabel =
    readout.driver === "live"
      ? readout.lost
        ? "tracking · lost"
        : "tracking · live"
      : readout.driver === "pointer"
        ? "pointer · move to conduct"
        : "demo · autonomous";

  const howTo = [
    `Press Play — ${EXCITER.title} begins, playing inside the resonance of ${BODY.title}.`,
    "Allow the camera, then sit so your shoulders are in frame.",
    `Sit tall or low to scan through ${BODY.title} — choose which moment of it becomes the resonant body.`,
    "Lean toward the camera to deepen the imbue — the dry recording dissolves into the other's resonance.",
    "Lean left or right to tilt the resonance cavern-dark ↔ bright. No camera? Move the mouse, or just watch it drift.",
  ];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* viz-first: the chamber fills the viewport */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <video ref={videoRef} className="pointer-events-none absolute h-px w-px opacity-0" playsInline muted />

      {/* status line — always visible while running */}
      {soundOn && (
        <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-1">
          <span
            className={`font-mono text-xs uppercase tracking-[0.18em] ${
              readout.driver === "live" && readout.lost ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {readout.driver === "live" && readout.lost
              ? "tracking · lost — face the camera, shoulders in frame"
              : driverLabel}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            voice · {EXCITER.title} · body · {BODY.title} @ {Math.round(readout.scan * 100)}% · imbue{" "}
            {Math.round(readout.imbue * 100)}%
          </span>
          {readout.loaded < 2 && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              loading takes · {readout.loaded}/2
            </span>
          )}
        </div>
      )}

      {/* write-up chrome — hidden in immersive mode */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/55 to-transparent p-6 pt-16">
          <div className="pointer-events-auto flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Imbue</h1>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
                One of Karel&apos;s recordings becomes the resonant body another plays inside. Your body chooses which
                moment of it you resonate in, how deeply the two dissolve together, and how dark or bright the chamber is.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!soundOn ? (
                <button
                  type="button"
                  onClick={onStart}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Play
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStop}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                onClick={onCam}
                disabled={camState === "on" || camState === "starting"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {camState === "on" ? "Camera on" : camState === "starting" ? "Starting camera…" : "Conduct with camera"}
              </button>
              <Link
                href="/dream/19600-imbue/README.md"
                className="min-h-[44px] rounded-md px-3 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Read the design notes
              </Link>
            </div>

            {notice && <p className="max-w-2xl text-sm leading-relaxed text-destructive">{notice}</p>}
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground/70">
              Best on headphones. Camera path is control-only — it never records or transmits. Press F for fullscreen.
            </p>
          </div>
        </div>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Imbue"
        description="A convolution cross-synthesis of Karel's recordings: one take is the piano you hear, the other becomes the resonant body it plays inside. Full-body motion scans which moment of that body you resonate in, how deeply the two dissolve, and how dark or bright the chamber is — rendered as a chamber of sympathetic strings."
        howTo={howTo}
      />
    </div>
  );
}
