"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// 719 — KIDS STOMP ZOO
// "What if a kid could make a whole parade of googly creatures jump by
//  STOMPING their feet in front of the camera?"
//
// Off-glass whole-body input: the front camera watches the lower band of the
// frame (feet/legs). A sharp rise in lower-band frame-difference energy = a
// STOMP. Each stomp launches a ripple through a parade of googly creatures,
// fires dust puffs + screen-shake + warm flash, and bonks a comical tuba note
// that walks a silly marching bassline. NOT a chord progression — a GROOVE.
// ---------------------------------------------------------------------------

// Marching bassline — low octave, walks a groovy figure (rhythm, not cadence).
const BASS_HZ = [55, 49, 62, 44, 58];

// Bold saturated creature colors.
const CREATURE_COLORS = [
  "#ff3b6b", // hot pink-red
  "#ff9f1c", // orange
  "#ffd23f", // sunny yellow
  "#3ddc97", // mint green
  "#4cc9f0", // sky blue
  "#b15cff", // violet
];

const NUM_CREATURES = 6;
const PROC_W = 64;
const PROC_H = 48;
const REFRACTORY_MS = 180;
const IDLE_MS = 2500;
const FREEZE_EVERY_MS = 20000;
const FREEZE_DUR_MS = 1500;

interface Creature {
  baseX: number; // fraction of width
  color: string;
  y: number; // current vertical offset (0 = grounded, negative = up)
  vy: number;
  squash: number; // 0 = round, >0 = squashed flat
  launching: boolean;
  eyePhase: number;
  eyeWobble: number;
  hueShift: number;
}

interface Dust {
  x: number; y: number;
  vx: number; vy: number;
  life: number; // 1 -> 0
  r: number;
}

function makeCreatures(): Creature[] {
  const arr: Creature[] = [];
  for (let i = 0; i < NUM_CREATURES; i++) {
    arr.push({
      baseX: (i + 0.5) / NUM_CREATURES,
      color: CREATURE_COLORS[i % CREATURE_COLORS.length],
      y: 0,
      vy: 0,
      squash: 0,
      launching: false,
      eyePhase: Math.random() * Math.PI * 2,
      eyeWobble: 0,
      hueShift: 0,
    });
  }
  return arr;
}

// A friendly tuba-honk BONK: filtered sawtooth + sine sub. Short, warm, round.
function makeBonk(ac: AudioContext, dest: AudioNode, hz: number) {
  const t = ac.currentTime;

  // Body: sawtooth through a gentle lowpass -> warm tuba timbre.
  const saw = ac.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.setValueAtTime(hz * 1.5, t);
  saw.frequency.exponentialRampToValueAtTime(hz, t + 0.06);

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(400, t + 0.25);
  lp.Q.value = 4;

  const bodyGain = ac.createGain();
  bodyGain.gain.setValueAtTime(0, t);
  bodyGain.gain.linearRampToValueAtTime(0.22, t + 0.02);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

  saw.connect(lp);
  lp.connect(bodyGain);
  bodyGain.connect(dest);

  // Sub: sine an octave under for round bottom.
  const sub = ac.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(hz * 0.5, t);
  const subGain = ac.createGain();
  subGain.gain.setValueAtTime(0, t);
  subGain.gain.linearRampToValueAtTime(0.18, t + 0.03);
  subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  sub.connect(subGain);
  subGain.connect(dest);

  saw.start(t); saw.stop(t + 0.5);
  sub.start(t); sub.stop(t + 0.55);
}

export default function StompZooPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const [camNote, setCamNote] = useState<string | null>(null);
  const [stompCount, setStompCount] = useState(0);

  // Audio graph refs.
  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const bedGainRef = useRef<GainNode | null>(null);

  // Camera refs.
  const streamRef = useRef<MediaStream | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevFrameRef = useRef<Float32Array | null>(null);

  // Loop / state refs.
  const rafRef = useRef<number | null>(null);
  const creaturesRef = useRef<Creature[]>(makeCreatures());
  const dustRef = useRef<Dust[]>([]);
  const bassIdxRef = useRef(0);
  const lastStompRef = useRef(0);
  const lastMotionTsRef = useRef(0);
  const shakeRef = useRef(0);
  const flashRef = useRef(0);
  const baselineRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastFreezeRef = useRef(0);
  const frozenUntilRef = useRef(0);
  const bedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Trigger one stomp: ripple the parade, fire dust + flash + shake + bonk.
  function triggerStomp(now: number) {
    if (now - lastStompRef.current < REFRACTORY_MS) return;
    lastStompRef.current = now;
    lastMotionTsRef.current = now;

    // Ripple: stagger creature launches left -> right.
    const creatures = creaturesRef.current;
    creatures.forEach((c, i) => {
      window.setTimeout(() => {
        c.squash = 1;
        window.setTimeout(() => {
          if (frozenUntilRef.current > performance.now()) return;
          c.launching = true;
          c.vy = -(9 + Math.random() * 3);
          c.squash = 0;
          c.eyeWobble = 1;
          c.hueShift = (Math.random() - 0.5) * 40;
        }, 70);
      }, i * 55);
    });

    // Bonk: walk the bassline.
    const ac = acRef.current;
    const master = masterRef.current;
    if (ac && master && frozenUntilRef.current <= now) {
      const hz = BASS_HZ[bassIdxRef.current % BASS_HZ.length];
      bassIdxRef.current++;
      makeBonk(ac, master, hz);
    }

    // Screen shake + warm flash.
    shakeRef.current = 14;
    flashRef.current = 1;

    setStompCount((n) => n + 1);
  }

  function startBed() {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;

    // Gentle, always-on oom-pah + shaker bed so it's never silent.
    const bedGain = ac.createGain();
    bedGain.gain.value = 0.0;
    bedGain.connect(master);
    bedGainRef.current = bedGain;

    // Soft pad drone (oom) so silence never feels broken.
    const drone = ac.createOscillator();
    drone.type = "triangle";
    drone.frequency.value = 55;
    const droneGain = ac.createGain();
    droneGain.gain.value = 0.05;
    drone.connect(droneGain);
    droneGain.connect(bedGain);
    drone.start();

    // Oom-pah pulse + shaker on a steady marching tempo (~108 bpm).
    let beat = 0;
    const interval = 555; // ms per beat
    bedTimerRef.current = setInterval(() => {
      if (!acRef.current || !bedGainRef.current) return;
      if (frozenUntilRef.current > performance.now()) return;
      const t = ac.currentTime;

      // OOM on beat, PAH on offbeat (soft).
      const oom = beat % 2 === 0;
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = oom ? 49 : 73.5;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(oom ? 0.08 : 0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g);
      g.connect(bedGain);
      o.start(t); o.stop(t + 0.25);

      // Shaker: short filtered noise burst (soft, never harsh).
      const noiseLen = 0.08;
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * noiseLen), ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
      const src = ac.createBufferSource();
      src.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 5000;
      bp.Q.value = 0.7;
      const ng = ac.createGain();
      ng.gain.setValueAtTime(0.035, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + noiseLen);
      src.connect(bp); bp.connect(ng); ng.connect(bedGain);
      src.start(t); src.stop(t + noiseLen);

      beat++;
    }, interval);

    // Fade bed in gently.
    const t = ac.currentTime;
    bedGain.gain.setValueAtTime(0, t);
    bedGain.gain.linearRampToValueAtTime(1, t + 1.2);
  }

  async function start() {
    if (started) return;

    // Create + resume AudioContext inside the gesture (iOS).
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctor();
    await ac.resume();
    acRef.current = ac;

    // Master safety chain: gain<=0.3 -> lowpass<=7000 -> compressor -> dest.
    const master = ac.createGain();
    master.gain.value = 0.28;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    master.connect(lp);
    lp.connect(comp);
    comp.connect(ac.destination);
    masterRef.current = master;

    startBed();

    // Try camera. Request in the same gesture.
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
        "No camera — that's okay! The parade keeps stomping on its own. Stomp along!"
      );
    }

    startedAtRef.current = performance.now();
    lastMotionTsRef.current = performance.now();
    lastFreezeRef.current = performance.now();
    setStarted(true);
  }

  // Main render + motion loop.
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Offscreen processing canvas for frame-diff.
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

    function drawCreature(c: Creature, cx: number, groundY: number, scale: number, t: number) {
      const bob = Math.sin(t * 0.003 + c.eyePhase) * 3;
      const y = groundY + c.y + bob;
      const squashY = 1 - c.squash * 0.45;
      const squashX = 1 + c.squash * 0.4;
      const w = scale * squashX;
      const h = scale * squashY;

      ctx!.save();
      ctx!.translate(cx, y);

      // Body shadow on ground.
      ctx!.save();
      ctx!.globalAlpha = 0.18;
      ctx!.fillStyle = "#000";
      const shadowSquash = 1 + Math.max(0, -c.y) / 120;
      ctx!.beginPath();
      ctx!.ellipse(0, groundY - y + scale * 0.55, w * 0.55 * shadowSquash, scale * 0.12, 0, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();

      // Body — rounded blob.
      ctx!.fillStyle = c.color;
      ctx!.beginPath();
      ctx!.ellipse(0, 0, w * 0.55, h * 0.6, 0, 0, Math.PI * 2);
      ctx!.fill();

      // Little feet.
      ctx!.fillStyle = c.color;
      ctx!.beginPath();
      ctx!.ellipse(-w * 0.28, h * 0.52, w * 0.18, h * 0.12, 0, 0, Math.PI * 2);
      ctx!.ellipse(w * 0.28, h * 0.52, w * 0.18, h * 0.12, 0, 0, Math.PI * 2);
      ctx!.fill();

      // Big wobbly googly eyes.
      const eyeR = scale * 0.22;
      const eyeOff = scale * 0.24;
      const eyeY = -h * 0.18;
      const wob = c.eyeWobble;
      for (const sx of [-1, 1]) {
        const ex = sx * eyeOff;
        ctx!.fillStyle = "#fff";
        ctx!.beginPath();
        ctx!.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
        ctx!.fill();
        // Pupil swings with wobble + jump velocity.
        const px = ex + Math.cos(t * 0.012 + c.eyePhase + sx) * eyeR * 0.35 * (0.3 + wob);
        const py = eyeY + eyeR * 0.4 + c.vy * 0.02 * eyeR;
        ctx!.fillStyle = "#111";
        ctx!.beginPath();
        ctx!.arc(px, py, eyeR * 0.5, 0, Math.PI * 2);
        ctx!.fill();
        // Shine.
        ctx!.fillStyle = "rgba(255,255,255,0.85)";
        ctx!.beginPath();
        ctx!.arc(px - eyeR * 0.18, py - eyeR * 0.18, eyeR * 0.16, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Smile.
      ctx!.strokeStyle = "rgba(0,0,0,0.45)";
      ctx!.lineWidth = scale * 0.05;
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.arc(0, h * 0.12, scale * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx!.stroke();

      ctx!.restore();
    }

    let last = performance.now();

    function frame() {
      const now = performance.now();
      const dt = Math.min(now - last, 50);
      last = now;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // ---- MOTION DETECTION (lower-band frame-difference) ----
      const v = videoRef.current;
      const haveCam = !!streamRef.current && !!v && v.readyState >= 2;
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
          // Lower 45% band only (feet/legs).
          const startRow = Math.floor(PROC_H * 0.55);
          let energy = 0;
          let count = 0;
          for (let yy = startRow; yy < PROC_H; yy++) {
            for (let xx = 0; xx < PROC_W; xx++) {
              const idx = yy * PROC_W + xx;
              const d = Math.abs(cur[idx] - prev[idx]);
              if (d > 18) energy += d;
              count++;
            }
          }
          const norm = energy / (count * 255);
          // Adaptive baseline so lighting/jitter doesn't false-trigger.
          baselineRef.current = baselineRef.current * 0.9 + norm * 0.1;
          const rise = norm - baselineRef.current;
          // Forgiving threshold: a sharp RISE above baseline = stomp.
          if (rise > 0.012 && norm > 0.02) {
            triggerStomp(now);
          }
        }
        prevFrameRef.current = cur;
      }

      // ---- IDLE GHOST AUTO-STOMPER ----
      // If no motion for IDLE_MS (or no camera), fire a groovy auto-rhythm.
      if (now - lastMotionTsRef.current > IDLE_MS) {
        // Groovy pattern: stomp on a swung two-beat with occasional skip.
        const phase = (now - startedAtRef.current) % 1110; // 2 beats @ ~108bpm
        if (phase < 30 && now - lastStompRef.current > 400) {
          triggerStomp(now);
        }
      }

      // ---- FREEZE-DANCE moment (giggle beat) ----
      if (now - lastFreezeRef.current > FREEZE_EVERY_MS && frozenUntilRef.current < now) {
        frozenUntilRef.current = now + FREEZE_DUR_MS;
        lastFreezeRef.current = now;
        // Duck the bed during freeze.
        const ac = acRef.current;
        const bg = bedGainRef.current;
        if (ac && bg) {
          const tt = ac.currentTime;
          bg.gain.cancelScheduledValues(tt);
          bg.gain.setValueAtTime(bg.gain.value, tt);
          bg.gain.linearRampToValueAtTime(0.0, tt + 0.1);
          bg.gain.setValueAtTime(0.0, tt + FREEZE_DUR_MS / 1000 - 0.1);
          bg.gain.linearRampToValueAtTime(1.0, tt + FREEZE_DUR_MS / 1000 + 0.4);
        }
      }
      const frozen = frozenUntilRef.current > now;

      // ---- PHYSICS ----
      const groundY = h * 0.74;
      const scale = Math.min(w / (NUM_CREATURES + 1), 130);
      const g = 0.6;
      const creatures = creaturesRef.current;
      for (const c of creatures) {
        if (!frozen) {
          if (c.launching) {
            c.vy += g * (dt / 16.67);
            c.y += c.vy * (dt / 16.67);
            if (c.y >= 0) {
              c.y = 0;
              c.vy = 0;
              c.launching = false;
              // Landing puff.
              const lx = (c.baseX) * w;
              for (let k = 0; k < 5; k++) {
                dustRef.current.push({
                  x: lx + (Math.random() - 0.5) * scale * 0.4,
                  y: groundY + scale * 0.5,
                  vx: (Math.random() - 0.5) * 3,
                  vy: -Math.random() * 2 - 0.5,
                  life: 1,
                  r: 6 + Math.random() * 8,
                });
              }
            }
          }
          c.eyeWobble *= 0.94;
          c.eyePhase += 0.02 * (dt / 16.67);
        }
      }

      // Dust physics.
      const dust = dustRef.current;
      for (const d of dust) {
        if (!frozen) {
          d.x += d.vx;
          d.y += d.vy;
          d.vy += 0.12;
          d.life -= 0.02 * (dt / 16.67);
        }
      }
      dustRef.current = dust.filter((d) => d.life > 0);

      // Shake + flash decay.
      shakeRef.current *= 0.85;
      flashRef.current *= 0.9;

      // ---- DRAW ----
      ctx!.save();
      // Background gradient (warm circus sky).
      const grad = ctx!.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#1a1030");
      grad.addColorStop(0.6, "#2a1840");
      grad.addColorStop(1, "#3a1530");
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, 0, w, h);

      // Screen shake offset.
      const sh = shakeRef.current;
      ctx!.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

      // Ground stripe.
      ctx!.fillStyle = "#241038";
      ctx!.fillRect(-20, groundY + scale * 0.55, w + 40, h);
      ctx!.strokeStyle = "rgba(255,255,255,0.08)";
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(-20, groundY + scale * 0.55);
      ctx!.lineTo(w + 20, groundY + scale * 0.55);
      ctx!.stroke();

      // Dust puffs (behind creatures).
      for (const d of dust) {
        ctx!.globalAlpha = Math.max(0, d.life) * 0.5;
        ctx!.fillStyle = "#e8d5c0";
        ctx!.beginPath();
        ctx!.arc(d.x, d.y, d.r * (1.2 - d.life * 0.4), 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      // Parade.
      for (const c of creatures) {
        drawCreature(c, c.baseX * w, groundY, scale, now);
      }

      // Warm flash overlay.
      if (flashRef.current > 0.01) {
        ctx!.fillStyle = `rgba(255,210,120,${flashRef.current * 0.25})`;
        ctx!.fillRect(-50, -50, w + 100, h + 100);
      }

      // FREEZE banner (visual only, no reading required — big snowflake-ish star).
      if (frozen) {
        ctx!.globalAlpha = 0.5 + Math.sin(now * 0.02) * 0.2;
        ctx!.fillStyle = "#bfe9ff";
        ctx!.font = `${Math.min(w * 0.2, 160)}px serif`;
        ctx!.textAlign = "center";
        ctx!.textBaseline = "middle";
        ctx!.fillText("❄", w / 2, h * 0.3);
        ctx!.globalAlpha = 1;
      }

      ctx!.restore();

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
      if (bedTimerRef.current) clearInterval(bedTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") ac.close().catch(() => {});
      acRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#1a1030] font-mono text-white/95">
      {/* Hidden video element feeding the frame-diff processor. */}
      <video ref={videoRef} playsInline muted className="hidden" />

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header / title */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center px-4 pt-5">
        <h1 className="text-2xl font-bold tracking-tight text-white/95 drop-shadow-lg sm:text-4xl">
          STOMP ZOO
        </h1>
        <p className="mt-1 text-base text-white/75">
          Jump and STOMP your feet — the parade jumps too!
        </p>
        {started && (
          <p className="mt-1 text-base text-white/75">
            stomps: <span className="text-white/95">{stompCount}</span>
          </p>
        )}
      </div>

      {/* Camera / permission notice */}
      {camNote && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-20 max-w-md -translate-x-1/2 px-4 text-center">
          <p className="text-base text-rose-300 drop-shadow">{camNote}</p>
        </div>
      )}

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#1a1030]/80 px-6 text-center backdrop-blur-sm">
          <div className="mb-6 text-7xl">🦛🐸🦒</div>
          <h2 className="mb-2 text-2xl font-bold text-white/95">Stomp Zoo</h2>
          <p className="mb-8 max-w-sm text-base text-white/75">
            Stand back so the camera can see your feet. Then JUMP and STOMP to
            make the googly parade bonk and fly!
          </p>
          <button
            onClick={start}
            className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-full bg-[#ff9f1c] px-12 py-5 text-2xl font-bold text-[#1a1030] shadow-2xl transition-transform active:scale-95"
          >
            ▶ STOMP!
          </button>
          <p className="mt-6 max-w-sm text-base text-white/75">
            Everything stays on your device. Nothing is recorded or sent.
          </p>
        </div>
      )}

      {/* Design notes corner link */}
      <Link
        href="/dream/719-kids-stomp-zoo/README.md"
        className="absolute bottom-3 right-3 z-10 rounded-md bg-black/30 px-3 py-2 text-base text-white/75 hover:text-white/95"
      >
        notes
      </Link>
    </main>
  );
}
