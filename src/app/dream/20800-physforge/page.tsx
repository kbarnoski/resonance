"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 20800-physforge — the material console.
//
// ONE question: what if you could forge Karel's recorded piano into a different
// physical MATERIAL in real time — soften it to felt or harden it to glass,
// shrink its body to a music-box or swell it to a cathedral — with two
// INDEPENDENT physical axes you move by hand?
//
// His real recording loops; you reshape it through TWO INDEPENDENT physical
// transformation axes (a "material console"). This is explicitly NOT a bandpass
// filter bank.
//
//   · AXIS X — HARDNESS (a nonlinear WAVESHAPER). A WaveShaperNode whose transfer
//     curve (a 2048-sample Float32Array, regenerated throttled ~17 Hz) morphs
//     from soft tanh-ish "felt" at x=0 to a steep sigmoid + wavefolding
//     "glass/metal" at x=1. oversample = "4x". Harder = more harmonics / edge;
//     makeup gain is pulled DOWN as drive rises so hard settings never blast.
//   · AXIS Y — BODY SIZE (a feedback COMB / short-delay resonator — NOT a
//     bandpass bank). A DelayNode + feedback GainNode loop (with a damping
//     lowpass inside the loop): tiny boxy music-box resonance (~3 ms) at y=0,
//     cavernous swell (~120 ms) at y=1. Feedback capped at 0.82 — never runs away.
//
// MANY-TO-MANY coupling (the whole point): the waveshaper FEEDS the comb body,
// so HARDNESS changes the excitation character the BODY rings with. And BODY
// SIZE scales the wet/dry blend AND the in-loop damping, while HARDNESS also
// darkens that damping (a bigger, harder-driven body absorbs its own extra
// harmonics). Moving BOTH is genuinely different from moving either alone — a
// 2-D space of timbres, not two separable knobs.
//
// Signal graph (end to end, ZERO oscillators, ZERO ctx.destination):
//   AudioBufferSourceNode(HIS buffer, loop=true)
//     → waveShaper(hardness) → makeupGain
//       → dryGain ─────────────────────────────┐
//       → delay → wetGain ─────────────────────┤→ createSafeMaster(ctx).input
//                   delay → damp(lowpass) → feedbackGain → delay   (comb loop)
//   Visuals are driven from safeMaster.analyser.
//
// CONTROL — pointer-first, camera on top. Pointer X over the stage → HARDNESS
// (left = soft felt, right = hard glass); pointer Y → BODY SIZE (top = small
// music-box, bottom = large cathedral). Arrow keys nudge both. Two-hand camera
// is the richer layer: left hand height → hardness, right hand height → body.
// <2 hands / denied / failed → visible text-destructive notice, pointer stays
// fully live. Idle (no input ~2 s) gently auto-drifts both axes, labeled.
//
// VISUAL — Canvas2D ONLY (no WebGL/WebGPU). A living material ingot that deforms:
// hard = sharp crystalline facets + tight bright specular; soft = rounded,
// molten, diffuse. Body size = the ingot's scale + the resonant ring halo around
// it. An inset plots the live waveshaper transfer curve (the Float32Array) and a
// live amplitude read from the analyser; the ingot pulses on audio RMS. Violet
// phosphor + bone/graphite on near-black. No green. No grain overlay.
//
// Reference: PhysicsSliders (arXiv:2610.18597, announced 2026-10-14) — learning
// independent physical control axes over a sound. Physforge gives you two such
// axes by hand, as DSP you can see.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";

// ── small math helpers (NOT hooks) ────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── AXIS X — the HARDNESS waveshaper curve ───────────────────────────────────
// Soft (h=0): near-linear gentle tanh → "felt". Hard (h=1): steep sigmoid plus a
// wavefolding term that only wakes at the top → "glass/metal". Fills the given
// Float32Array in place so we can reuse one allocation and also draw it.
const CURVE_LEN = 2048;
function fillHardnessCurve(
  curve: Float32Array<ArrayBuffer>,
  hardness: number,
): void {
  const h = clamp01(hardness);
  const drive = 1 + h * 16; // sigmoid steepens with hardness
  const foldAmt = h * h; // wavefolding edge only at the hard end
  const foldFreq = 1 + h * 4;
  const norm = Math.tanh(drive) || 1; // normalise sigmoid back to ±1
  for (let i = 0; i < CURVE_LEN; i++) {
    const x = (i / (CURVE_LEN - 1)) * 2 - 1; // −1 … 1
    let y = Math.tanh(drive * x) / norm;
    if (foldAmt > 0.001) {
      const folded = Math.sin(x * Math.PI * foldFreq);
      y = y * (1 - foldAmt * 0.5) + folded * foldAmt * 0.5;
    }
    curve[i] = clamp(y, -1, 1);
  }
}

// makeup compensation: as hardness drives harder, pull level DOWN so glass
// settings don't blast. A touch lower again for a big resonant body.
function makeupFor(hardness: number, body: number): number {
  return 0.95 * (1 - 0.5 * hardness) * (1 - 0.14 * body);
}

// ── AXIS Y — the BODY-SIZE comb, plus the many-to-many cross terms ───────────
function delaySecFor(body: number): number {
  return 0.003 * Math.pow(0.12 / 0.003, clamp01(body)); // 3 ms → 120 ms (exp)
}
function feedbackFor(body: number): number {
  return Math.min(0.82, 0.3 + body * 0.52); // capped — never runs away
}
// Damping couples BOTH axes: a bigger body darkens its ring, AND a harder
// excitation is absorbed more by the body (so hard+large reads as a dark swell,
// not a screech). This is a genuine cross term, not two separable knobs.
function dampHzFor(body: number, hardness: number): number {
  const base = 9000 * Math.pow(1400 / 9000, clamp01(body)); // 9 kHz → 1.4 kHz
  return clamp(base * (1 - 0.35 * hardness), 900, 11000);
}
// Wet/dry couples both axes too: bigger body pours more into the resonator, and
// a harder excitation pushes a touch more edge into the body to ring with.
function wetFor(body: number, hardness: number): number {
  return clamp01(0.22 + body * 0.52 + hardness * 0.12);
}

interface Engine {
  src: AudioBufferSourceNode;
  shaper: WaveShaperNode;
  makeup: GainNode;
  delay: DelayNode;
  damp: BiquadFilterNode;
  feedback: GainNode;
  wet: GainNode;
  dry: GainNode;
  curve: Float32Array<ArrayBuffer>; // the live transfer curve (also drawn)
  wave: Uint8Array<ArrayBuffer>;
}

function applyAudio(
  ctx: AudioContext,
  eng: Engine,
  hardness: number,
  body: number,
): void {
  const now = ctx.currentTime;
  const tc = 0.12; // matches the visual smoothing
  eng.makeup.gain.setTargetAtTime(makeupFor(hardness, body), now, tc);
  eng.delay.delayTime.setTargetAtTime(delaySecFor(body), now, tc);
  eng.feedback.gain.setTargetAtTime(feedbackFor(body), now, tc);
  eng.damp.frequency.setTargetAtTime(dampHzFor(body, hardness), now, tc);
  const wet = wetFor(body, hardness);
  eng.wet.gain.setTargetAtTime(wet, now, tc);
  eng.dry.gain.setTargetAtTime(0.95 - wet * 0.45, now, tc);
}

// ── VISUAL — the living material ingot (Canvas2D only) ───────────────────────
function drawScene(
  c2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  hardness: number,
  body: number,
  curve: Float32Array<ArrayBuffer> | null,
  wave: Uint8Array<ArrayBuffer> | null,
  rms: number,
  t: number,
): void {
  // phosphor persistence — fade the previous frame toward near-black violet.
  c2d.globalCompositeOperation = "source-over";
  c2d.fillStyle = "rgba(7, 5, 15, 0.22)";
  c2d.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const unit = Math.min(w, h);
  const hue = 262 + hardness * 26; // 262 (felt) … 288 (glass), always violet
  const pulse = 1 + rms * 0.5;

  // ── the resonant RING HALO — body size made visible around the ingot ──
  // Bigger body = larger, more numerous rings (the cavern); ring cadence tracks
  // the comb delay. They breathe on the audio RMS.
  c2d.globalCompositeOperation = "lighter";
  const ringCount = Math.round(2 + body * 6);
  const baseR = unit * (0.14 + body * 0.34) * pulse;
  for (let i = 0; i < ringCount; i++) {
    const f = (i + 1) / ringCount;
    const phase = Math.sin(t * 0.0012 + i * 0.7) * 0.5 + 0.5;
    const r = baseR * (0.55 + f) + phase * unit * 0.02 * body;
    c2d.beginPath();
    c2d.arc(cx, cy, r, 0, Math.PI * 2);
    const a = (1 - f) * (0.05 + body * 0.1 + rms * 0.12);
    c2d.strokeStyle = `hsla(${hue}, 80%, ${60 + rms * 20}%, ${a})`;
    c2d.lineWidth = Math.max(0.6, unit * 0.001 * (1 + body));
    c2d.stroke();
  }

  // ── the INGOT itself — a polygon whose corners morph soft↔hard ──
  // Hard = many sharp crystalline facets, tight bright specular.
  // Soft = few rounded lobes, broad molten diffuse glow.
  const sides = Math.round(lerp(5, 9, hardness)); // more facets as it hardens
  const round = lerp(0.42, 0.015, hardness); // corner rounding: molten → sharp
  const rad = unit * (0.08 + body * 0.17) * pulse; // scale tracks BODY SIZE
  const spin = t * 0.00018 * (0.4 + hardness * 0.8);

  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const ang = spin + (i / sides) * Math.PI * 2 - Math.PI / 2;
    // soft bodies wobble (molten); hard bodies are rigid.
    const wob = 1 + Math.sin(t * 0.0016 + i * 1.3) * (0.1 * (1 - hardness));
    pts.push([cx + Math.cos(ang) * rad * wob, cy + Math.sin(ang) * rad * wob]);
  }

  // body fill — a radial gradient: hard = tight hot specular core; soft = broad.
  const specR = rad * lerp(1.5, 0.55, hardness);
  const grad = c2d.createRadialGradient(
    cx - rad * 0.22,
    cy - rad * 0.22,
    1,
    cx,
    cy,
    specR,
  );
  const coreL = clamp(60 + rms * 30 + hardness * 14, 55, 96);
  grad.addColorStop(0, `hsla(${hue + 6}, 70%, ${coreL}%, ${0.5 + hardness * 0.4})`);
  grad.addColorStop(0.5, `hsla(${hue}, 85%, ${lerp(46, 58, hardness)}%, 0.5)`);
  grad.addColorStop(1, `hsla(${hue}, 80%, 24%, 0.08)`);

  // draw the morphing polygon with rounded or sharp corners.
  c2d.beginPath();
  for (let i = 0; i <= sides; i++) {
    const p0 = pts[i % sides];
    const p1 = pts[(i + 1) % sides];
    if (i === 0) {
      c2d.moveTo(lerp(p0[0], p1[0], round), lerp(p0[1], p1[1], round));
    } else {
      // quadratic through the corner — round controls how far from the vertex we
      // start/end the smoothing (large round = molten, tiny = crystalline point).
      c2d.quadraticCurveTo(
        p0[0],
        p0[1],
        lerp(p0[0], p1[0], round),
        lerp(p0[1], p1[1], round),
      );
    }
  }
  c2d.closePath();
  c2d.fillStyle = grad;
  c2d.shadowColor = `hsla(${hue}, 90%, 70%, ${0.5 + hardness * 0.4})`;
  c2d.shadowBlur = lerp(34, 10, hardness) + rms * 24; // soft glows wide, glass is crisp
  c2d.fill();
  c2d.shadowBlur = 0;

  // rim — bone/graphite outline; crisp & bright when hard, faint when soft.
  c2d.strokeStyle = `rgba(237, 233, 246, ${0.22 + hardness * 0.5})`;
  c2d.lineWidth = Math.max(1, unit * 0.0016 * (1 + hardness));
  c2d.stroke();

  // internal FACETS — crystalline web that only resolves as it hardens.
  if (hardness > 0.12) {
    c2d.strokeStyle = `hsla(${hue + 8}, 85%, 82%, ${(hardness - 0.1) * 0.5})`;
    c2d.lineWidth = Math.max(0.5, unit * 0.0008);
    for (let i = 0; i < sides; i++) {
      c2d.beginPath();
      c2d.moveTo(cx, cy);
      c2d.lineTo(pts[i][0], pts[i][1]);
      c2d.stroke();
    }
    // facet chords (short → long as it hardens) give a cut-gem read.
    for (let i = 0; i < sides; i++) {
      const a = pts[i];
      const b = pts[(i + 2) % sides];
      c2d.beginPath();
      c2d.moveTo(a[0], a[1]);
      c2d.lineTo(b[0], b[1]);
      c2d.globalAlpha = (hardness - 0.1) * 0.35;
      c2d.stroke();
      c2d.globalAlpha = 1;
    }
  } else {
    // SOFT: molten concentric contours instead of facets.
    for (let r = 1; r <= 3; r++) {
      c2d.beginPath();
      c2d.arc(cx, cy, rad * (r / 4), 0, Math.PI * 2);
      c2d.strokeStyle = `hsla(${hue}, 70%, 70%, ${0.12 * (1 - hardness)})`;
      c2d.lineWidth = Math.max(0.6, unit * 0.001);
      c2d.stroke();
    }
  }

  c2d.globalCompositeOperation = "source-over";

  // ── INSET 1: the live waveshaper TRANSFER CURVE (the actual Float32Array) ──
  const pad = Math.round(unit * 0.03);
  const iw = Math.round(clamp(unit * 0.2, 120, 240));
  const ih = iw;
  const ix = pad;
  const iy = h - ih - pad;
  c2d.fillStyle = "rgba(10, 7, 20, 0.55)";
  c2d.strokeStyle = "rgba(237, 233, 246, 0.18)";
  c2d.lineWidth = 1;
  c2d.fillRect(ix, iy, iw, ih);
  c2d.strokeRect(ix, iy, iw, ih);
  // reference diagonal (linear = no shaping)
  c2d.strokeStyle = "rgba(167, 139, 250, 0.22)";
  c2d.beginPath();
  c2d.moveTo(ix, iy + ih);
  c2d.lineTo(ix + iw, iy);
  c2d.stroke();
  if (curve) {
    c2d.beginPath();
    for (let i = 0; i < CURVE_LEN; i += 4) {
      const fx = i / (CURVE_LEN - 1);
      const px = ix + fx * iw;
      const py = iy + ih - ((curve[i] + 1) / 2) * ih;
      if (i === 0) c2d.moveTo(px, py);
      else c2d.lineTo(px, py);
    }
    c2d.strokeStyle = `hsla(${hue + 6}, 90%, 76%, 0.95)`;
    c2d.lineWidth = Math.max(1.4, unit * 0.0016);
    c2d.shadowColor = `hsla(${hue}, 90%, 70%, 0.8)`;
    c2d.shadowBlur = 8;
    c2d.stroke();
    c2d.shadowBlur = 0;
  }

  // ── INSET 2: live amplitude (the tamed analyser waveform) ──
  if (wave) {
    const ax = ix;
    const ay = iy - Math.round(unit * 0.09) - 8;
    const awh = Math.round(unit * 0.09);
    c2d.fillStyle = "rgba(10, 7, 20, 0.5)";
    c2d.fillRect(ix, ay, iw, awh);
    c2d.strokeStyle = "rgba(237, 233, 246, 0.14)";
    c2d.strokeRect(ix, ay, iw, awh);
    c2d.beginPath();
    const n = wave.length;
    for (let i = 0; i < n; i += 2) {
      const fx = i / (n - 1);
      const v = (wave[i] - 128) / 128;
      const px = ax + fx * iw;
      const py = ay + awh / 2 - v * (awh / 2) * 0.92;
      if (i === 0) c2d.moveTo(px, py);
      else c2d.lineTo(px, py);
    }
    c2d.strokeStyle = `hsla(${hue}, 85%, 72%, 0.85)`;
    c2d.lineWidth = Math.max(1, unit * 0.0012);
    c2d.stroke();
  }
}

type AudioPhase = "idle" | "loading" | "running" | "error";
type CamState = "off" | "requesting" | "live" | "denied" | "failed";
type Mode = "camera" | "pointer" | "idle";

const DESCRIPTION =
  "Forge Karel's real piano into a different physical material in real time, on two independent physical axes you move by hand. HARDNESS (left↔right) is a nonlinear waveshaper: soften it toward felt or harden it to glass — see the transfer curve bend in the inset. BODY SIZE (up↔down) is a feedback comb resonator: shrink it to a music-box or swell it to a cathedral. The two axes couple — the hardness feeds the body, so the same pair of hands sweeps a whole 2-D space of timbres, not two separate knobs. No camera needed: your pointer or the arrow keys drive the identical chain. Allow the camera to conduct it with both palms.";

const HOW_TO = [
  "Press Play to sound Karel's piano, then forge it",
  "Move left↔right to harden or soften the material (the transfer curve bends live)",
  "Move up↕down to shrink or swell its body (top = music-box, bottom = cathedral)",
  "Arrow keys nudge both axes; no camera is needed at all",
  "Show BOTH hands to conduct it with your palms — left hand height = hardness, right hand height = body",
  "Press i for info, f for fullscreen",
];

export default function PhysforgePage() {
  const { immersive, toggle } = useImmersive();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camWantRef = useRef(false);
  const camStateRef = useRef<CamState>("off");

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const lastHandsRef = useRef(0);

  // the two axes: smoothed (what drives) + the raw target this frame.
  const hardRef = useRef(0.35);
  const bodyRef = useRef(0.4);
  const hardTargetRef = useRef(0.35);
  const bodyTargetRef = useRef(0.4);

  // pointer / keyboard control (first-class): x → hardness, y → body.
  const pointerHardRef = useRef(0.35);
  const pointerBodyRef = useRef(0.4);
  const lastInputRef = useRef(0); // last pointer / key activity timestamp

  // throttled waveshaper-curve regeneration (~17 Hz, NOT every frame).
  const lastCurveHardRef = useRef(-1);
  const lastCurveTimeRef = useRef(0);

  const [phase, setPhase] = useState<AudioPhase>("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [handsSeen, setHandsSeen] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState({ hard: 0.35, body: 0.4, ms: 0, fb: 0 });
  const readoutRef = useRef(readout);
  const handsSeenRef = useRef(false);
  const modeRef = useRef<Mode>("idle");

  camStateRef.current = camState;
  handsSeenRef.current = handsSeen;
  modeRef.current = mode;

  // ── canvas sizing (DPR-aware) ───────────────────────────────────────────────
  const resize = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const wpx = cv.clientWidth || window.innerWidth;
    const hpx = cv.clientHeight || window.innerHeight;
    cv.width = Math.max(1, Math.round(wpx * dpr));
    cv.height = Math.max(1, Math.round(hpx * dpr));
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── the frame loop — camera / pointer / idle all converge on two axes ────────
  const runFrame = useCallback(() => {
    const now = performance.now();
    const prev = lastTimeRef.current || now;
    const dt = Math.min(0.1, (now - prev) / 1000);
    lastTimeRef.current = now;

    // 1. resolve the control target (camera-2-hands > pointer/keys > idle drift).
    let haveHands = false;
    const camOn = camWantRef.current && camStateRef.current === "live";
    if (
      camOn &&
      trackerRef.current &&
      videoRef.current &&
      videoRef.current.readyState >= 2
    ) {
      try {
        const res = trackerRef.current.detectForVideo(videoRef.current, now);
        if (res.landmarks && res.landmarks.length >= 2) {
          const f0 = computeHandFeatures(res.landmarks[0]);
          const f1 = computeHandFeatures(res.landmarks[1]);
          // left hand = smaller cx (screen-left after mirror) → HARDNESS.
          const left = f0.cx <= f1.cx ? f0 : f1;
          const right = f0.cx <= f1.cx ? f1 : f0;
          hardTargetRef.current = clamp01(left.height);
          bodyTargetRef.current = clamp01(right.height);
          lastHandsRef.current = now;
          haveHands = true;
        }
      } catch {
        /* a dropped detect frame is harmless */
      }
      const live = now - lastHandsRef.current < 600;
      if (live !== handsSeenRef.current) setHandsSeen(live);
    }

    const pointerRecent = now - lastInputRef.current < 2000;
    let nextMode: Mode;
    if (haveHands) {
      nextMode = "camera";
    } else if (pointerRecent && !camOn) {
      hardTargetRef.current = pointerHardRef.current;
      bodyTargetRef.current = pointerBodyRef.current;
      nextMode = "pointer";
    } else if (pointerRecent && camOn) {
      // camera is on but no 2-hand read → fall back to pointer meanwhile.
      hardTargetRef.current = pointerHardRef.current;
      bodyTargetRef.current = pointerBodyRef.current;
      nextMode = "pointer";
    } else {
      // IDLE: auto-drift both axes on slow INDEPENDENT sinusoids — never blank.
      hardTargetRef.current = 0.5 + 0.42 * Math.sin(now * 0.00031);
      bodyTargetRef.current = 0.5 + 0.42 * Math.sin(now * 0.00019 + 1.7);
      nextMode = "idle";
    }
    if (nextMode !== modeRef.current) setMode(nextMode);

    // 2. smooth toward the target (~0.12 s — immediate but not twitchy).
    const a = 1 - Math.exp(-dt / 0.12);
    hardRef.current += (hardTargetRef.current - hardRef.current) * a;
    bodyRef.current += (bodyTargetRef.current - bodyRef.current) * a;
    const hardness = hardRef.current;
    const body = bodyRef.current;

    // 3. drive the sound with the SAME two axes.
    const ctx = ctxRef.current;
    const eng = engineRef.current;
    let rms = 0;
    let wave: Uint8Array<ArrayBuffer> | null = null;
    let curve: Float32Array<ArrayBuffer> | null = null;
    if (ctx && eng && masterRef.current) {
      applyAudio(ctx, eng, hardness, body);
      // throttled curve regen (~17 Hz), only when hardness actually moved.
      if (
        now - lastCurveTimeRef.current > 58 &&
        Math.abs(hardness - lastCurveHardRef.current) > 0.004
      ) {
        fillHardnessCurve(eng.curve, hardness);
        eng.shaper.curve = eng.curve;
        lastCurveHardRef.current = hardness;
        lastCurveTimeRef.current = now;
      }
      masterRef.current.analyser.getByteTimeDomainData(eng.wave);
      wave = eng.wave;
      curve = eng.curve;
      let sum = 0;
      for (let i = 0; i < eng.wave.length; i++) {
        const v = (eng.wave[i] - 128) / 128;
        sum += v * v;
      }
      rms = clamp01(Math.sqrt(sum / eng.wave.length) * 2.4);
    }

    // 4. draw with the SAME two axes → see == hear.
    const cv = canvasRef.current;
    const c2d = cv?.getContext("2d");
    if (cv && c2d)
      drawScene(c2d, cv.width, cv.height, hardness, body, curve, wave, rms, now);

    // 5. live readout (throttled on change) — makes the 2-D coupling explicit.
    const ms = Math.round(delaySecFor(body) * 1000);
    const fb = feedbackFor(body);
    const prevR = readoutRef.current;
    if (
      Math.abs(prevR.hard - hardness) > 0.02 ||
      Math.abs(prevR.body - body) > 0.02 ||
      Math.abs(prevR.ms - ms) > 1 ||
      Math.abs(prevR.fb - fb) > 0.02
    ) {
      const next = { hard: hardness, body, ms, fb };
      readoutRef.current = next;
      setReadout(next);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // one rAF for the whole lifetime so idle is always alive.
  useEffect(() => {
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [runFrame]);

  // ── start the audio (works with no camera — pointer drives it) ─────────────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrMsg("");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;

      const master = createSafeMaster(ctx);
      masterRef.current = master;

      let loaded;
      try {
        loaded = await loadRealTrackBuffer(ctx, trackId);
      } catch {
        setErrMsg(
          "Karel's recording could not load — check the connection and press Play again.",
        );
        master.disconnect();
        await ctx.close();
        ctxRef.current = null;
        masterRef.current = null;
        setPhase("error");
        return;
      }
      setTrackTitle(loaded.title);

      // ── the console: ONE source of HIS buffer, forged. Zero oscillators. ──
      const src = ctx.createBufferSource();
      src.buffer = loaded.buffer;
      src.loop = true;

      // AXIS X — the HARDNESS waveshaper.
      const shaper = ctx.createWaveShaper();
      shaper.oversample = "4x";
      const curve = new Float32Array(CURVE_LEN);
      fillHardnessCurve(curve, hardRef.current);
      shaper.curve = curve;

      const makeup = ctx.createGain();
      makeup.gain.value = makeupFor(hardRef.current, bodyRef.current);

      // AXIS Y — the BODY-SIZE feedback comb (delay + damping + feedback).
      const delay = ctx.createDelay(0.5);
      delay.delayTime.value = delaySecFor(bodyRef.current);

      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = dampHzFor(bodyRef.current, hardRef.current);
      damp.Q.value = 0.5;

      const feedback = ctx.createGain();
      feedback.gain.value = feedbackFor(bodyRef.current);

      const wetGain = ctx.createGain();
      wetGain.gain.value = wetFor(bodyRef.current, hardRef.current);
      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.95 - wetGain.gain.value * 0.45;

      // wiring: src → shaper → makeup → {dry, comb(delay→wet)}; comb loop damped.
      src.connect(shaper);
      shaper.connect(makeup);
      makeup.connect(dryGain);
      dryGain.connect(master.input);
      makeup.connect(delay); // the HARDENED excitation feeds the BODY — coupling.
      delay.connect(wetGain);
      wetGain.connect(master.input);
      delay.connect(damp);
      damp.connect(feedback);
      feedback.connect(delay); // bounded feedback comb (fb ≤ 0.82).

      engineRef.current = {
        src,
        shaper,
        makeup,
        delay,
        damp,
        feedback,
        wet: wetGain,
        dry: dryGain,
        curve,
        wave: new Uint8Array(master.analyser.fftSize),
      };

      src.start();
      setPhase("running");
    } catch (e) {
      setErrMsg(
        e instanceof Error ? e.message : "Web Audio is unavailable in this browser.",
      );
      setPhase("error");
    }
  }, [phase, trackId]);

  // ── camera opt-in: the richer layer on top of the pointer ──────────────────
  const enableCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("failed");
      return;
    }
    if (!videoRef.current) return;
    setCamState("requesting");
    setErrMsg("");
    try {
      const tracker = await createHandTracker(2);
      trackerRef.current = tracker;
      const stream = await startCamera(videoRef.current);
      streamRef.current = stream;
      camWantRef.current = true;
      lastHandsRef.current = 0;
      setCamState("live");
    } catch (e) {
      camWantRef.current = false;
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const msg = e instanceof Error ? e.message : "";
      setCamState(/denied|Permission|NotAllowed/i.test(msg) ? "denied" : "failed");
    }
  }, []);

  const disableCamera = useCallback(() => {
    camWantRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      trackerRef.current?.close();
    } catch {
      /* noop */
    }
    trackerRef.current = null;
    setHandsSeen(false);
    setCamState("off");
  }, []);

  // ── pointer control (first-class): x → hardness, y → body ──────────────────
  const pointerMove = useCallback((e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    const ny = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    pointerHardRef.current = nx; // left = soft felt, right = hard glass
    pointerBodyRef.current = 1 - ny; // top = small music-box, bottom = cathedral
    lastInputRef.current = performance.now();
  }, []);
  const pointerDown = useCallback(
    (e: React.PointerEvent) => {
      pointerMove(e);
    },
    [pointerMove],
  );

  // ── keyboard conducting (a11y) — same two axes as the pointer ──────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      )
        return;
      let handled = false;
      if (e.key === "ArrowRight") {
        pointerHardRef.current = clamp01(pointerHardRef.current + 0.05);
        handled = true;
      } else if (e.key === "ArrowLeft") {
        pointerHardRef.current = clamp01(pointerHardRef.current - 0.05);
        handled = true;
      } else if (e.key === "ArrowUp") {
        pointerBodyRef.current = clamp01(pointerBodyRef.current - 0.05); // up = smaller
        handled = true;
      } else if (e.key === "ArrowDown") {
        pointerBodyRef.current = clamp01(pointerBodyRef.current + 0.05); // down = larger
        handled = true;
      }
      if (handled) {
        lastInputRef.current = performance.now();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.src.stop();
        } catch {
          /* already stopped */
        }
        const nodes: AudioNode[] = [
          eng.src,
          eng.shaper,
          eng.makeup,
          eng.delay,
          eng.damp,
          eng.feedback,
          eng.wet,
          eng.dry,
        ];
        for (const nd of nodes) {
          try {
            nd.disconnect();
          } catch {
            /* noop */
          }
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        trackerRef.current?.close();
      } catch {
        /* noop */
      }
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── derived UI state ───────────────────────────────────────────────────────
  const running = phase === "running";
  const camLive = camState === "live" && handsSeen && mode === "camera";
  const camLost = camState === "live" && !camLive;
  const camBad = camState === "denied" || camState === "failed";

  const statusText = camLive
    ? "tracking · live — two hands forging"
    : camLost
      ? "show BOTH hands, shoulders in frame — pointer still live"
      : mode === "idle"
        ? "autonomous · drifting — move the pointer to take control"
        : running
          ? "pointer · live — move to forge (no camera needed)"
          : "pointer · ready — move to forge, or press Play";

  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnGhost =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  const labelCls =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="fixed inset-0 overflow-hidden bg-background text-foreground">
      {/* the material IS the page */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: "#07050f", cursor: "crosshair" }}
        onPointerMove={pointerMove}
        onPointerDown={pointerDown}
      />

      {/* mirrored camera preview — small, corner, only when live */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute right-3 top-3 z-20 h-24 w-32 scale-x-[-1] rounded-md border border-border/40 object-cover opacity-70"
        style={{ display: camState === "live" ? "block" : "none" }}
        playsInline
        muted
      />

      {/* live readout — the 2-D coupling, made explicit */}
      <div
        className={`pointer-events-none absolute left-4 top-4 z-30 ${labelCls} text-primary`}
      >
        hardness {readout.hard.toFixed(2)} · body {readout.body.toFixed(2)} · comb{" "}
        {readout.ms} ms · fb {readout.fb.toFixed(2)}
      </div>

      {/* tracking / fallback status — functional, stays in immersive too */}
      <div
        className={`pointer-events-none absolute left-4 top-10 z-30 ${labelCls} ${
          camLost
            ? "text-destructive"
            : camLive
              ? "text-primary"
              : "text-muted-foreground"
        }`}
      >
        {statusText}
      </div>
      {phase === "error" && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-destructive">
          {errMsg || "Could not start audio."} Press Play to retry.
        </div>
      )}
      {camBad && (
        <div className="absolute left-4 top-16 z-30 max-w-xs text-sm text-destructive">
          {camState === "denied" ? "Camera denied" : "Camera unavailable"} —
          forging with the pointer (move) or arrow keys instead.
        </div>
      )}

      {/* FULL write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/70 to-transparent p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-xl">
              <p className={labelCls}>Material console · two physical axes</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Physforge
              </h1>
              <p className="mt-1 text-base leading-relaxed text-muted-foreground">
                Forge Karel&rsquo;s piano into a different material — soften it to
                felt or harden it to glass, shrink its body to a music-box or
                swell it to a cathedral. Two independent physical axes, moved by
                hand.
                {running && (
                  <span className="text-muted-foreground/70">
                    {" "}
                    Now playing: {trackTitle}.
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className={`${btnGhost} shrink-0`}
            >
              Read the design notes
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <button
                type="button"
                onClick={begin}
                className={btnPrimary}
                disabled={phase === "loading"}
              >
                {phase === "loading" ? "Loading…" : "Play"}
              </button>
            ) : (
              <span className={`${labelCls} text-primary`}>
                live · {trackTitle}
              </span>
            )}

            {camState !== "live" ? (
              <button
                type="button"
                onClick={enableCamera}
                className={btnGhost}
                disabled={camState === "requesting"}
              >
                {camState === "requesting"
                  ? "Starting camera…"
                  : "Use camera (two hands)"}
              </button>
            ) : (
              <button type="button" onClick={disableCamera} className={btnGhost}>
                camera · live — switch off
              </button>
            )}

            <label className={`${labelCls} flex items-center gap-2`}>
              <span className="sr-only">Track</span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={running || phase === "loading"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-50"
              >
                {COLLECTIONS.map((g) => (
                  <optgroup key={g.name} label={g.name}>
                    {g.tracks.map((tk) => (
                      <option key={tk.id} value={tk.id}>
                        {tk.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Physforge"
              description={DESCRIPTION}
              howTo={HOW_TO}
            />
          </div>
        </div>
      )}

      {/* While immersive: only art + status + HUD. A minimal Play if not sounding. */}
      {immersive && !running && phase !== "loading" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button type="button" onClick={begin} className={btnPrimary}>
            Play
          </button>
        </div>
      )}
      {immersive && (
        <ImmersiveHud
          immersive={immersive}
          onToggle={toggle}
          title="Physforge"
          description={DESCRIPTION}
          howTo={HOW_TO}
        />
      )}

      {/* design-notes modal (mirrors README.md) */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Physforge — design notes
              </h2>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className={btnGhost}
                aria-label="Close"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The one question: what if you could forge Karel&rsquo;s recorded
                piano into a different physical{" "}
                <span className="text-foreground">material</span> in real time —
                soften it to felt or harden it to glass, shrink its body to a
                music-box or swell it to a cathedral — with two{" "}
                <span className="text-foreground">independent</span> physical
                axes you move by hand?
              </p>
              <p>
                <span className="text-foreground">Axis X — hardness</span> is a
                nonlinear waveshaper. Its transfer curve (a 2048-sample
                Float32Array, regenerated ~17&nbsp;Hz as you move) morphs from a
                gentle near-linear tanh (felt) to a steep sigmoid plus
                wavefolding (glass/metal). Harder means more harmonics and edge;
                the makeup gain is pulled down as drive rises so hard settings
                never blast.
              </p>
              <p>
                <span className="text-foreground">Axis Y — body size</span> is a
                feedback comb resonator, not a bandpass bank: a delay line
                (~3&nbsp;ms boxy music-box up to ~120&nbsp;ms cavern) with a
                feedback gain capped at 0.82 and a damping lowpass inside the
                loop. It is a genuinely different block diagram from
                &ldquo;N bandpasses summed onto the dry take&rdquo; — a physical
                body that rings, with its own decay.
              </p>
              <p>
                The axes are{" "}
                <span className="text-foreground">many-to-many</span>: the
                waveshaper feeds the comb, so the hardness sets the excitation the
                body rings with; body size scales the wet/dry blend; and the
                in-loop damping is darkened by BOTH a bigger body and a harder
                drive (a large, hard-driven body absorbs its own extra
                harmonics). Moving both is genuinely different from moving either
                alone — a 2-D space of timbres, not two separable knobs.
              </p>
              <p>
                It is{" "}
                <span className="text-foreground">pointer-first</span>: pointer X
                is hardness (left soft, right hard), pointer Y is body size (top
                small, bottom large), arrow keys nudge both, and this drives the
                identical chain with no webcam. The two-hand camera is the richer
                layer on top — left hand height to hardness, right hand height to
                body. Fewer than two hands, denied, or failed shows a visible
                notice and keeps full pointer control; idle gently auto-drifts
                both axes so the piece is never blank.
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                Reference
              </p>
              <p>
                PhysicsSliders (arXiv:2610.18597, announced 2026-10-14) —
                learning independent physical control axes over a sound.
                Physforge gives you two such axes by hand, as DSP you can see:
                the transfer curve bends and the body rings in front of you.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
