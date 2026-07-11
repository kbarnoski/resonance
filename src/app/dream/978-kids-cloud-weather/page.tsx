"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// 978 — KIDS CLOUD WEATHER ("Conduct the Sky")
//
// "What if a 4-year-old conducted a bright musical SKY with their whole BODY —
//  and the QUALITY of their movement (gentle vs. big, fast vs. slow, high vs.
//  low) shaped the music — never a finger on glass?"
//
// Front webcam -> tiny offscreen frame-difference -> three movement QUALITIES
// (Laban Effort theory): body height, movement size/energy, and suddenness.
// These drive a real C-LYDIAN melody (C D E F# G A B — the bright, dreamy mode
// with the raised 4th) over an always-on soft Lydian pad bed. The child paints
// a living daytime sky: sun, drifting clouds, blooming flowers, birds/sparkles.
// ---------------------------------------------------------------------------

// C Lydian scale, ascending across two-and-a-bit octaves. The F# (raised 4th)
// is the characteristic Lydian color tone — NOT pentatonic, a real mode.
// Degrees:  C  D  E  F#  G  A  B   (octaves stacked)
const LYDIAN_HZ = [
  130.81, // C3
  146.83, // D3
  164.81, // E3
  185.0, // F#3
  196.0, // G3
  220.0, // A3
  246.94, // B3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  369.99, // F#4
  392.0, // G4
  440.0, // A4
  493.88, // B4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  739.99, // F#5
];

const PROC_W = 64;
const PROC_H = 48;
const IDLE_MS = 2500; // no motion this long -> ghost auto-conductor takes over
const NUM_CLOUDS = 6;

interface Cloud {
  x: number; // 0..1 fraction
  y: number; // 0..1 fraction (sky band)
  scale: number;
  speed: number; // parallax drift
  puffSeed: number;
}

interface Flower {
  x: number;
  y: number;
  hue: number;
  age: number; // 0..1 grows then settles
  size: number;
  petals: number;
  sustained: boolean; // legato bloom vs sparkle pluck
}

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 -> 0
  flap: number;
  sparkle: boolean; // true = sparkle star, false = winged bird
}

function makeClouds(): Cloud[] {
  const arr: Cloud[] = [];
  for (let i = 0; i < NUM_CLOUDS; i++) {
    arr.push({
      x: Math.random(),
      y: 0.08 + Math.random() * 0.38,
      scale: 0.6 + Math.random() * 0.9,
      speed: 0.004 + Math.random() * 0.01,
      puffSeed: Math.random() * 1000,
    });
  }
  return arr;
}

// Snap a 0..1 "height" position to a Lydian scale degree frequency.
function lydianForHeight(height01: number): number {
  const idx = Math.min(
    LYDIAN_HZ.length - 1,
    Math.max(0, Math.floor(height01 * LYDIAN_HZ.length))
  );
  return LYDIAN_HZ[idx];
}

export default function CloudWeatherPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const [camNote, setCamNote] = useState<string | null>(null);

  // Audio graph.
  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const padGainRef = useRef<GainNode | null>(null);
  const padTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Camera + frame-diff.
  const streamRef = useRef<MediaStream | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameRef = useRef<Float32Array | null>(null);
  const baselineRef = useRef(0);
  const prevEnergyRef = useRef(0);

  // Loop / world state.
  const rafRef = useRef<number | null>(null);
  const cloudsRef = useRef<Cloud[]>(makeClouds());
  const flowersRef = useRef<Flower[]>([]);
  const birdsRef = useRef<Bird[]>([]);
  const lastMotionTsRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastNoteRef = useRef(0);
  const sunGlowRef = useRef(0.5);
  const flashRef = useRef(0);

  // Smoothed movement-quality signals (Laban Effort).
  const qHeightRef = useRef(0.5); // vertical centroid 0(bottom)..1(top)
  const qEnergyRef = useRef(0); // total motion energy 0..~1
  const qSuddenRef = useRef(0); // |d(energy)/dt| 0..~1

  // Play one Lydian melody note. Quality args shape the expression.
  // height -> pitch; energy -> loudness & flower bloom; sudden -> articulation.
  function playNote(now: number, height: number, energy: number, sudden: number) {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;

    // Rhythm gate: sudden bursts can retrigger fast; sustained motion is slower.
    const minGap = sudden > 0.5 ? 120 : 240;
    if (now - lastNoteRef.current < minGap) return;
    lastNoteRef.current = now;
    lastMotionTsRef.current = now;

    const hz = lydianForHeight(height);
    const t = ac.currentTime;
    const loud = 0.06 + Math.min(0.18, energy * 0.45); // dynamics from energy

    const staccato = sudden > 0.45; // SUDDEN -> sparkly short pluck
    const attack = staccato ? 0.015 : 0.06; // sustained keeps attack >= 15ms
    const dur = staccato ? 0.35 : 1.1; // legato sung tone vs pluck

    // Melody voice: triangle core + soft sine octave for a sweet bell/voice.
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(hz, t);

    const sub = ac.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(hz * 2, t);
    const subG = ac.createGain();
    subG.gain.value = staccato ? 0.5 : 0.22;

    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(loud, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    // Gentle per-note lowpass so nothing is harsh; brighter on sparkles.
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = staccato ? 4200 : 2600;
    lp.Q.value = 0.5;

    osc.connect(g);
    sub.connect(subG);
    subG.connect(g);
    g.connect(lp);
    lp.connect(master);

    osc.start(t);
    osc.stop(t + dur + 0.05);
    sub.start(t);
    sub.stop(t + dur + 0.05);

    // VISUAL response: bloom a flower (size = energy), bird/sparkle on sudden.
    spawnBloom(height, energy, staccato);
    if (staccato) {
      spawnSparkleOrBird(true);
    }
    sunGlowRef.current = Math.min(1, sunGlowRef.current + energy * 0.4 + 0.1);
    flashRef.current = Math.min(1, flashRef.current + (staccato ? 0.35 : 0.12));
  }

  function spawnBloom(height: number, energy: number, sparkleStyle: boolean) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Higher body -> flower nearer the meadow's bright back row; energy -> count.
    const count = 1 + Math.floor(Math.min(4, energy * 8));
    const meadowTop = h * 0.66;
    for (let i = 0; i < count; i++) {
      flowersRef.current.push({
        x: w * (0.08 + Math.random() * 0.84),
        y: meadowTop + Math.random() * (h * 0.28),
        hue: 280 + Math.random() * 80 + height * 40, // pinks / violets / warm
        age: 0,
        size: (sparkleStyle ? 14 : 22) + energy * 40 + Math.random() * 14,
        petals: 5 + Math.floor(Math.random() * 4),
        sustained: !sparkleStyle,
      });
    }
    // Cap the meadow so it never grows unbounded.
    if (flowersRef.current.length > 90) {
      flowersRef.current.splice(0, flowersRef.current.length - 90);
    }
  }

  function spawnSparkleOrBird(sparkle: boolean) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const fromLeft = Math.random() > 0.5;
    birdsRef.current.push({
      x: fromLeft ? -40 : w + 40,
      y: h * (0.12 + Math.random() * 0.4),
      vx: (fromLeft ? 1 : -1) * (2.5 + Math.random() * 2.5),
      vy: (Math.random() - 0.5) * 1.5,
      life: 1,
      flap: Math.random() * Math.PI * 2,
      sparkle: sparkle && Math.random() > 0.4,
    });
    if (birdsRef.current.length > 24) birdsRef.current.shift();
  }

  // Always-on soft Lydian pad bed: Cmaj add9 lifting to D/C (the II that gives
  // Lydian its dreamy buoyancy). Slow crossfade so it never feels broken.
  function startPad() {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;

    const padGain = ac.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(master);
    padGainRef.current = padGain;

    // Two chord "colors" of the Lydian bed.
    const chordA = [130.81, 196.0, 246.94, 329.63, 293.66]; // C E? -> C G B E D9 (Cadd9)
    const chordB = [146.83, 220.0, 293.66, 369.99]; // D A D F#  (D/C lift, raised 4th feel)

    let useA = true;
    const voices: { osc: OscillatorNode; g: GainNode }[] = [];
    // Pre-build a fixed pool of detuned sine voices we retune on each change.
    for (let i = 0; i < 5; i++) {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = chordA[i % chordA.length];
      osc.detune.value = (Math.random() - 0.5) * 8;
      const g = ac.createGain();
      g.gain.value = 0.0;
      osc.connect(g);
      g.connect(padGain);
      osc.start();
      voices.push({ osc, g });
    }

    function applyChord(chord: number[]) {
      if (!acRef.current) return;
      const t = acRef.current.currentTime;
      voices.forEach((v, i) => {
        const hz = chord[i % chord.length];
        v.osc.frequency.setTargetAtTime(hz, t, 0.6);
        v.g.gain.setTargetAtTime(0.05, t, 0.8);
      });
    }
    applyChord(chordA);

    // Soft slow crossfade between the two colors every ~6s.
    padTimerRef.current = setInterval(() => {
      useA = !useA;
      applyChord(useA ? chordA : chordB);
    }, 6000);

    // Fade the whole bed in gently.
    const t = ac.currentTime;
    padGain.gain.setValueAtTime(0, t);
    padGain.gain.linearRampToValueAtTime(1, t + 2.0);
  }

  async function start() {
    if (started) return;

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new Ctor();
    await ac.resume();
    acRef.current = ac;

    // Kid-safe master chain: gain<=0.3 -> lowpass ~7k -> compressor -> dest.
    const master = ac.createGain();
    master.gain.value = 0.28;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    master.connect(lp);
    lp.connect(comp);
    comp.connect(ac.destination);
    masterRef.current = master;

    startPad();

    // Camera in the SAME gesture (iOS requirement).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setCamNote(null);
    } catch {
      setCamNote(
        "No camera — that's okay! The sky paints and sings all by itself. Wave along!"
      );
    }

    const now = performance.now();
    startedAtRef.current = now;
    lastMotionTsRef.current = now;
    setStarted(true);
  }

  // Main render + motion loop.
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const proc = document.createElement("canvas");
    proc.width = PROC_W;
    proc.height = PROC_H;
    procCanvasRef.current = proc;
    const pctx = proc.getContext("2d", { willReadFrequently: true });

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function drawSun(cx: number, cy: number, r: number, glow: number, t: number) {
      // Outer warm halo.
      const halo = ctx!.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * (2.6 + glow));
      halo.addColorStop(0, `rgba(255,236,160,${0.55 + glow * 0.3})`);
      halo.addColorStop(0.4, "rgba(255,214,120,0.22)");
      halo.addColorStop(1, "rgba(255,214,120,0)");
      ctx!.fillStyle = halo;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r * (2.6 + glow), 0, Math.PI * 2);
      ctx!.fill();

      // Rays (gentle rotation).
      ctx!.save();
      ctx!.translate(cx, cy);
      ctx!.rotate(t * 0.00012);
      ctx!.strokeStyle = `rgba(255,224,140,${0.25 + glow * 0.35})`;
      ctx!.lineWidth = 6;
      ctx!.lineCap = "round";
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r1 = r * 1.25;
        const r2 = r * (1.7 + Math.sin(t * 0.002 + i) * 0.12 + glow * 0.4);
        ctx!.beginPath();
        ctx!.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx!.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx!.stroke();
      }
      ctx!.restore();

      // Sun disc.
      const disc = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r);
      disc.addColorStop(0, "#fff6d8");
      disc.addColorStop(0.6, "#ffd95e");
      disc.addColorStop(1, "#ffb73d");
      ctx!.fillStyle = disc;
      ctx!.beginPath();
      ctx!.arc(cx, cy, r, 0, Math.PI * 2);
      ctx!.fill();
    }

    function drawCloud(c: Cloud, w: number, h: number, t: number) {
      const cx = c.x * w;
      const cy = c.y * h;
      const s = c.scale * Math.min(w, h) * 0.12;
      const bob = Math.sin(t * 0.0008 + c.puffSeed) * s * 0.06;
      ctx!.save();
      ctx!.translate(cx, cy + bob);
      // Soft shadow under cloud.
      ctx!.fillStyle = "rgba(150,180,220,0.22)";
      ctx!.beginPath();
      ctx!.ellipse(0, s * 0.5, s * 1.5, s * 0.4, 0, 0, Math.PI * 2);
      ctx!.fill();
      // Puffs.
      ctx!.fillStyle = "rgba(255,255,255,0.96)";
      const puffs = [
        [-s, 0, 0.8],
        [-s * 0.3, -s * 0.4, 1.0],
        [s * 0.5, -s * 0.2, 0.95],
        [s, 0.1 * s, 0.8],
        [0, s * 0.15, 1.15],
      ];
      for (const [px, py, pr] of puffs) {
        ctx!.beginPath();
        ctx!.arc(px, py, s * pr, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.restore();
    }

    function drawFlower(f: Flower) {
      const grow = Math.min(1, f.age * 3);
      const r = f.size * grow;
      if (r < 0.5) return;
      ctx!.save();
      ctx!.translate(f.x, f.y);
      // Stem.
      ctx!.strokeStyle = "rgba(70,170,90,0.8)";
      ctx!.lineWidth = Math.max(2, r * 0.12);
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.moveTo(0, r * 0.2);
      ctx!.lineTo(0, r * 1.4);
      ctx!.stroke();
      // Petals.
      ctx!.fillStyle = `hsla(${f.hue}, 80%, 72%, ${0.92})`;
      for (let i = 0; i < f.petals; i++) {
        const a = (i / f.petals) * Math.PI * 2;
        ctx!.beginPath();
        ctx!.ellipse(
          Math.cos(a) * r * 0.55,
          Math.sin(a) * r * 0.55,
          r * 0.42,
          r * 0.26,
          a,
          0,
          Math.PI * 2
        );
        ctx!.fill();
      }
      // Center.
      ctx!.fillStyle = "#fff2a8";
      ctx!.beginPath();
      ctx!.arc(0, 0, r * 0.32, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }

    function drawBird(b: Bird) {
      ctx!.save();
      ctx!.translate(b.x, b.y);
      ctx!.globalAlpha = Math.max(0, b.life);
      if (b.sparkle) {
        // Twinkly star sparkle.
        const r = 14 + Math.sin(b.flap * 4) * 4;
        ctx!.strokeStyle = "rgba(255,255,255,0.95)";
        ctx!.lineWidth = 3;
        ctx!.lineCap = "round";
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI + b.flap * 0.5;
          ctx!.beginPath();
          ctx!.moveTo(-Math.cos(a) * r, -Math.sin(a) * r);
          ctx!.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx!.stroke();
        }
        ctx!.fillStyle = "rgba(255,245,200,0.95)";
        ctx!.beginPath();
        ctx!.arc(0, 0, 4, 0, Math.PI * 2);
        ctx!.fill();
      } else {
        // Little winged bird (two flapping arcs).
        const flap = Math.sin(b.flap) * 0.5 + 0.5;
        ctx!.strokeStyle = "rgba(60,70,110,0.85)";
        ctx!.lineWidth = 4;
        ctx!.lineCap = "round";
        const dir = b.vx >= 0 ? 1 : -1;
        ctx!.beginPath();
        ctx!.moveTo(-12 * dir, 0);
        ctx!.quadraticCurveTo(0, -10 - flap * 8, 12 * dir, 0);
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.moveTo(-12 * dir, 4);
        ctx!.quadraticCurveTo(0, 0 + flap * 4, 12 * dir, 4);
        ctx!.stroke();
      }
      ctx!.restore();
      ctx!.globalAlpha = 1;
    }

    let last = performance.now();

    function frame() {
      const now = performance.now();
      const dt = Math.min(now - last, 50);
      last = now;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // ---- MOTION QUALITY DETECTION (whole-frame frame-difference) ----
      const v = videoRef.current;
      const haveCam = !!streamRef.current && !!v && v.readyState >= 2;
      let detectedMotion = false;
      if (haveCam && pctx) {
        pctx.drawImage(v!, 0, 0, PROC_W, PROC_H);
        const img = pctx.getImageData(0, 0, PROC_W, PROC_H).data;
        const cur = new Float32Array(PROC_W * PROC_H);
        for (let i = 0; i < PROC_W * PROC_H; i++) {
          const o = i * 4;
          cur[i] = (img[o] + img[o + 1] + img[o + 2]) / 3;
        }
        const prev = prevFrameRef.current;
        if (prev) {
          let energy = 0;
          let wY = 0; // y-weighted by motion (for vertical centroid)
          let mass = 0;
          for (let yy = 0; yy < PROC_H; yy++) {
            for (let xx = 0; xx < PROC_W; xx++) {
              const idx = yy * PROC_W + xx;
              const d = Math.abs(cur[idx] - prev[idx]);
              if (d > 18) {
                energy += d;
                wY += yy * d;
                mass += d;
              }
            }
          }
          const norm = energy / (PROC_W * PROC_H * 255);
          // Adaptive baseline self-calibrates to room lighting/noise.
          baselineRef.current = baselineRef.current * 0.95 + norm * 0.05;
          const active = norm - baselineRef.current;

          if (active > 0.006 && mass > 0) {
            detectedMotion = true;
            // (a) energy quality.
            const e = Math.min(1, active * 22);
            qEnergyRef.current = qEnergyRef.current * 0.6 + e * 0.4;
            // (b) vertical centroid -> body height (invert: top of frame = high).
            const cy = wY / mass; // 0..PROC_H
            const height01 = 1 - cy / PROC_H;
            qHeightRef.current = qHeightRef.current * 0.7 + height01 * 0.3;
            // (c) suddenness = |d(energy)/dt|.
            const dE = Math.abs(norm - prevEnergyRef.current);
            const sud = Math.min(1, dE * 40);
            qSuddenRef.current = qSuddenRef.current * 0.5 + sud * 0.5;
          } else {
            qEnergyRef.current *= 0.9;
            qSuddenRef.current *= 0.85;
          }
          prevEnergyRef.current = norm;
        }
        prevFrameRef.current = cur;
      }

      // Decide whether the GHOST auto-conductor should drive things.
      const idle = now - lastMotionTsRef.current > IDLE_MS;
      let height = qHeightRef.current;
      let energy = qEnergyRef.current;
      let sudden = qSuddenRef.current;

      if (idle || !haveCam) {
        // Invisible performer drifts a figure-8 of height + energy so the sky
        // paints itself and a gentle Lydian phrase plays on its own.
        const tt = (now - startedAtRef.current) * 0.001;
        const fig8x = Math.sin(tt * 0.9);
        const fig8y = Math.sin(tt * 1.8) * 0.5;
        height = 0.5 + fig8y * 0.45 + fig8x * 0.05;
        energy = 0.22 + (Math.sin(tt * 0.6) * 0.5 + 0.5) * 0.25;
        // Occasional gentle sparkle so birds appear too.
        sudden = Math.sin(tt * 0.45) > 0.92 ? 0.7 : 0.1;
        // Trigger ghost notes on a calm pulse (~ every 600ms varying).
        const pulse = (now - startedAtRef.current) % 640;
        if (pulse < 24) {
          playNote(now, Math.min(1, Math.max(0, height)), energy, sudden);
        }
      } else if (detectedMotion) {
        // Live: play when there is enough energy; richer energy -> more notes.
        if (energy > 0.12) {
          playNote(now, Math.min(1, Math.max(0, height)), energy, sudden);
        }
      }

      // ---- WORLD UPDATE ----
      // Clouds always drift (alive even with zero motion). Energy speeds drift.
      for (const c of cloudsRef.current) {
        c.x += (c.speed + energy * 0.01) * (dt / 16.67);
        if (c.x > 1.2) c.x = -0.2;
      }
      // Flowers age + settle.
      for (const f of flowersRef.current) {
        f.age += (dt / 16.67) * 0.04;
      }
      flowersRef.current = flowersRef.current.filter((f) => f.age < 18);
      // Birds fly + fade.
      for (const b of birdsRef.current) {
        b.x += b.vx * (dt / 16.67);
        b.y += b.vy * (dt / 16.67);
        b.flap += 0.3 * (dt / 16.67);
        b.life -= 0.006 * (dt / 16.67);
      }
      birdsRef.current = birdsRef.current.filter(
        (b) => b.life > 0 && b.x > -80 && b.x < w + 80
      );
      // Sun glow + flash decay; glow has a calm floor so it always shines.
      sunGlowRef.current = Math.max(0.35, sunGlowRef.current * 0.97);
      flashRef.current *= 0.92;

      // ---- DRAW ----
      // Sky gradient (warm saturated daylight).
      const sky = ctx!.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#7cc7ff");
      sky.addColorStop(0.45, "#a8dcff");
      sky.addColorStop(0.62, "#dff1ff");
      sky.addColorStop(0.66, "#bfe9a6");
      sky.addColorStop(1, "#7fc96a");
      ctx!.fillStyle = sky;
      ctx!.fillRect(0, 0, w, h);

      // Sun upper-right, glow reacts to play.
      drawSun(w * 0.8, h * 0.2, Math.min(w, h) * 0.07, sunGlowRef.current, now);

      // Clouds (sorted by scale for soft parallax: smaller behind).
      const clouds = [...cloudsRef.current].sort((a, b) => a.scale - b.scale);
      for (const c of clouds) drawCloud(c, w, h, now);

      // Meadow horizon band already in gradient; add gentle rolling hills.
      ctx!.fillStyle = "rgba(110,200,110,0.55)";
      ctx!.beginPath();
      ctx!.moveTo(0, h * 0.7);
      for (let x = 0; x <= w; x += 40) {
        ctx!.lineTo(x, h * 0.7 + Math.sin(x * 0.006 + now * 0.0003) * 12);
      }
      ctx!.lineTo(w, h);
      ctx!.lineTo(0, h);
      ctx!.closePath();
      ctx!.fill();

      // Flowers (meadow).
      for (const f of flowersRef.current) drawFlower(f);

      // Birds + sparkles (in the sky).
      for (const b of birdsRef.current) drawBird(b);

      // Warm bloom flash (very gentle — no scary transients).
      if (flashRef.current > 0.01) {
        ctx!.fillStyle = `rgba(255,248,210,${flashRef.current * 0.18})`;
        ctx!.fillRect(0, 0, w, h);
      }

      // Tiny live "quality" meter dots (top-left) — color, not reading.
      const baseY = 18;
      const bars: [number, string][] = [
        [Math.min(1, height), "#ffd95e"], // height
        [Math.min(1, energy), "#ff7eb3"], // energy
        [Math.min(1, sudden), "#7ce0ff"], // suddenness
      ];
      bars.forEach((bar, i) => {
        const [val, col] = bar;
        const bx = 18 + i * 30;
        ctx!.fillStyle = "rgba(255,255,255,0.35)";
        ctx!.fillRect(bx, baseY, 16, 70);
        ctx!.fillStyle = col;
        ctx!.fillRect(bx, baseY + 70 - val * 70, 16, val * 70);
      });

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (padTimerRef.current) clearInterval(padTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") ac.close().catch(() => {});
      acRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#7cc7ff] font-sans text-foreground">
      {/* Hidden video feeding the frame-diff processor. */}
      <video ref={videoRef} playsInline muted className="hidden" />

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Title */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center px-4 pt-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground drop-shadow-[0_2px_6px_rgba(60,90,140,0.6)] sm:text-4xl">
          CONDUCT THE SKY
        </h1>
        <p className="mt-1 text-base font-semibold text-foreground drop-shadow-[0_1px_4px_rgba(60,90,140,0.6)]">
          Move your whole body — gentle, BIG, high, low — and paint the music!
        </p>
      </div>

      {/* Camera / permission notice */}
      {camNote && (
        <div className="pointer-events-none absolute left-1/2 top-28 z-20 max-w-md -translate-x-1/2 px-4 text-center">
          <p className="rounded-xl bg-black/30 px-4 py-2 text-base text-violet-300 drop-shadow">
            {camNote}
          </p>
        </div>
      )}

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#7cc7ff]/85 px-6 text-center backdrop-blur-sm">
          <div className="mb-6 text-7xl">☀️🌸🐦</div>
          <h2 className="mb-2 text-2xl font-extrabold text-foreground drop-shadow">
            Conduct the Sky
          </h2>
          <p className="mb-8 max-w-sm text-base font-medium text-foreground drop-shadow">
            Stand back so the camera can see you. Reach UP high, sway gently,
            make a BIG wave — the sky sings and blooms with your moves!
          </p>
          <button
            onClick={start}
            className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-full bg-[#ffd95e] px-12 py-5 text-2xl font-extrabold text-[#3a5a8a] shadow-2xl transition-transform active:scale-95"
          >
            ▶ PLAY THE SKY!
          </button>
          <p className="mt-6 max-w-sm text-base font-medium text-foreground drop-shadow">
            Everything stays on your device. Nothing is recorded or sent.
          </p>
        </div>
      )}

      {/* Design notes corner link */}
      <Link
        href="/dream/978-kids-cloud-weather/README.md"
        className="absolute bottom-3 right-3 z-10 rounded-md bg-black/30 px-3 py-2 text-base text-foreground hover:text-foreground"
      >
        notes
      </Link>
    </main>
  );
}
