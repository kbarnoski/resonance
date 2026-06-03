"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ───────────────────────────────────────────────────────────────────────────
   280-kids-echo-canyon — sing across the canyon, a creature sings back

   A call-and-response toy for kids (4+). The child hums or sings into the mic;
   a friendly paper creature ("Echo") on the far cliff catches the phrase and
   sings it back across the canyon, then layers a gentle harmony — the child
   learns to listen and answer (the oldest musical game there is).

   - Pitch is detected by time-domain autocorrelation (Chris Wilson's canonical
     Web Audio method, YIN family) and quantised to the LYDIAN mode, so nothing
     ever sounds "wrong" and the sound is deliberately NOT C-major pentatonic.
   - The whole thing is drawn as matte cut-paper on Canvas2D (pure source-over,
     drop-shadow only) — no glow, no additive, no WebGL.
   - No mic / denied → a self-playing demo where the two creatures sing to each
     other, so it is always demoable.
─────────────────────────────────────────────────────────────────────────── */

// C-Lydian, one octave: C D E F# G A B (the #4 is what makes it shimmer)
const ROOT = 261.63; // C4
const LYDIAN_SEMI = [0, 2, 4, 6, 7, 9, 11];
const NOTE_HZ = LYDIAN_SEMI.map((s) => ROOT * Math.pow(2, s / 12));
const N_DEG = LYDIAN_SEMI.length;

// One bold, matte hue per scale degree (color = pitch, the kids convention)
const DEG_COLOR = [
  "#d98a6a", // C  terracotta
  "#e0b15a", // D  amber
  "#9fc27a", // E  sage
  "#6fc2b0", // F# teal
  "#6f9fd9", // G  dusty blue
  "#9a8ad9", // A  periwinkle
  "#c87ab0", // B  mauve
];
const DEG_DARK = [
  "#8a4a32", "#8f6a26", "#5a7a40", "#356f62",
  "#345a85", "#564a85", "#7a3a62",
];

type Side = "near" | "far";
interface Bird {
  side: Side; // which cliff it launches from
  deg: number;
  born: number; // ms (performance.now)
  dur: number; // ms flight time
  arc: number; // px arc height
}
interface PendingNote {
  playAt: number; // ms
  deg: number;
  harmony: boolean;
}

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  analyser: AnalyserNode | null;
  buf: Float32Array<ArrayBuffer>;
  mediaStream: MediaStream | null;
  mode: "mic" | "demo";
  // phrase capture
  listening: boolean;
  lastLoudMs: number;
  lastSampleMs: number;
  lastPushedDeg: number;
  captured: number[];
  // playback
  pending: PendingNote[];
  // animation
  birds: Bird[];
  echoActiveUntil: number; // ms — Echo is "singing" (bobs) until this time
  childGlowUntil: number; // ms — child creature pulses while it sings
  // demo timing
  nextDemoMs: number;
  startMs: number;
  // loop
  raf: number;
}

// Chris Wilson / YIN-family time-domain autocorrelation. Returns Hz or -1.
function detectPitchHz(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.012) return -1; // too quiet to be a sung note

  // trim leading / trailing near-silence
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  }
  const trimmed = buf.subarray(r1, r2);
  const n = trimmed.length;
  if (n < 128) return -1;

  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n - i; j++) sum += trimmed[j] * trimmed[j + i];
    c[i] = sum;
  }

  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  if (maxpos <= 0) return -1;

  let t0 = maxpos;
  const x1 = c[t0 - 1];
  const x2 = c[t0];
  const x3 = c[t0 + 1] ?? x2;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) t0 = t0 - b / (2 * a);

  const hz = sampleRate / t0;
  if (hz < 70 || hz > 1200) return -1; // outside plausible singing range
  return hz;
}

// Fold any Hz into a Lydian scale-degree index 0..6 (octave-collapsed),
// so a high or low child voice both map to the same comfortable register.
function hzToDeg(hz: number): number {
  const semis = 12 * Math.log2(hz / ROOT);
  const pc = ((Math.round(semis) % 12) + 12) % 12;
  let best = 0;
  let bestDist = 99;
  for (let i = 0; i < N_DEG; i++) {
    let dd = Math.abs(pc - LYDIAN_SEMI[i]);
    dd = Math.min(dd, 12 - dd);
    if (dd < bestDist) { bestDist = dd; best = i; }
  }
  return best;
}

export default function EchoCanyon() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engRef = useRef<Engine | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const [started, setStarted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // ── one soft tone, played in real time when its note comes due ───────────
  const playTone = useCallback((deg: number, harmony: boolean, childVoice: boolean) => {
    const e = engRef.current;
    if (!e) return;
    const ctx = e.ctx;
    const t = ctx.currentTime;
    let freq = NOTE_HZ[deg];
    if (harmony) {
      // a diatonic third above, in mode
      const hi = (deg + 2) % N_DEG;
      freq = NOTE_HZ[hi] * (deg + 2 >= N_DEG ? 2 : 1);
    }
    const o = ctx.createOscillator();
    o.type = childVoice ? "sine" : "triangle";
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = childVoice ? 0.12 : 0.22;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = childVoice ? 1700 : 2300;
    const peak = harmony ? 0.085 : childVoice ? 0.13 : 0.16;
    const dur = harmony ? 1.5 : 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(lp);
    lp.connect(e.master);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
  }, []);

  // ── Echo answers a captured phrase: echo it, then layer a third ──────────
  const scheduleEcho = useCallback((phrase: number[], now: number) => {
    const e = engRef.current;
    if (!e || phrase.length === 0) return;
    const gap = 520; // ms breath before Echo replies
    const step = 360; // ms between echoed notes
    phrase.forEach((deg, i) => {
      const at = now + gap + i * step;
      e.pending.push({ playAt: at, deg, harmony: false });
      // a gentle harmony a beat later for the round-like shimmer
      e.pending.push({ playAt: at + 150, deg, harmony: true });
    });
  }, []);

  const handleStart = useCallback(async () => {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    // always-on calm drone (C + G), so the canyon is never silent
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.06;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);
    [ROOT / 2, (ROOT / 2) * 1.5].forEach((f) => {
      const d = ctx.createOscillator();
      d.type = "sine";
      d.frequency.value = f;
      d.connect(droneGain);
      d.start();
    });
    lfo.start();
    droneGain.connect(master);

    let mode: Engine["mode"] = "demo";
    let analyser: AnalyserNode | null = null;
    let mediaStream: MediaStream | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      mediaStream = stream;
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser); // analysis only — the child's voice is not played back
      mode = "mic";
    } catch {
      setMicError(
        "No microphone — so the two creatures will sing to each other for you. (Allow the mic to sing along!)"
      );
      mode = "demo";
    }

    const now = performance.now();
    engRef.current = {
      ctx,
      master,
      analyser,
      buf: new Float32Array(2048),
      mediaStream,
      mode,
      listening: false,
      lastLoudMs: 0,
      lastSampleMs: 0,
      lastPushedDeg: -1,
      captured: [],
      pending: [],
      birds: [],
      echoActiveUntil: 0,
      childGlowUntil: 0,
      nextDemoMs: now + 1400,
      startMs: now,
      raf: 0,
    };

    setStarted(true);
  }, []);

  // ── the engine + render loop ─────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const e = engRef.current;
    if (!canvas || !e) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      sizeRef.current = { w, h, dpr };
    };
    resize();
    window.addEventListener("resize", resize);

    // spawn a bird and (for the child side) make its sound now
    const launchBird = (side: Side, deg: number, childVoice: boolean) => {
      const t = performance.now();
      e.birds.push({ side, deg, born: t, dur: 1500, arc: 120 + Math.random() * 80 });
      if (childVoice) {
        playTone(deg, false, true);
        e.childGlowUntil = t + 520;
      }
    };

    // ── demo phrase: the near (child) creature sings, then Echo answers ─────
    const runDemoPhrase = (now: number) => {
      const len = 3 + Math.floor(Math.random() * 3); // 3..5 notes
      const phrase: number[] = [];
      let prev = -1;
      for (let i = 0; i < len; i++) {
        let d = Math.floor(Math.random() * N_DEG);
        if (d === prev) d = (d + 1 + Math.floor(Math.random() * 2)) % N_DEG;
        prev = d;
        phrase.push(d);
      }
      // the near creature "sings" the phrase note by note (audio + rising birds)
      phrase.forEach((deg, i) => {
        window.setTimeout(() => {
          if (engRef.current !== e) return;
          launchBird("near", deg, true);
        }, i * 360);
      });
      // then Echo answers, just after the last child note lands
      scheduleEcho(phrase, now + len * 360);
    };

    const SILENCE_THRESH = 0.014;

    const frame = () => {
      const now = performance.now();
      const { w, h } = sizeRef.current;

      // 1) MIC: analyse, detect pitch, capture phrase ------------------------
      if (e.mode === "mic" && e.analyser) {
        e.analyser.getFloatTimeDomainData(e.buf);
        let rms = 0;
        for (let i = 0; i < e.buf.length; i++) rms += e.buf[i] * e.buf[i];
        rms = Math.sqrt(rms / e.buf.length);

        if (rms > SILENCE_THRESH) {
          e.lastLoudMs = now;
          if (!e.listening) {
            e.listening = true;
            e.captured = [];
            e.lastPushedDeg = -1;
          }
          e.childGlowUntil = now + 180;
          // sample a note about every 130ms
          if (now - e.lastSampleMs > 130) {
            e.lastSampleMs = now;
            const hz = detectPitchHz(e.buf, e.ctx.sampleRate);
            if (hz > 0) {
              const deg = hzToDeg(hz);
              if (deg !== e.lastPushedDeg && e.captured.length < 10) {
                e.captured.push(deg);
                e.lastPushedDeg = deg;
                launchBird("near", deg, false); // child's own voice IS the sound
              }
            }
          }
        } else if (e.listening && now - e.lastLoudMs > 620) {
          // phrase finished → Echo answers
          e.listening = false;
          if (e.captured.length > 0) {
            scheduleEcho(e.captured, now);
            e.captured = [];
          }
        }
      }

      // 2) DEMO: occasionally run a call-and-response by itself --------------
      if (e.mode === "demo" && now > e.nextDemoMs && e.pending.length === 0) {
        runDemoPhrase(now);
        e.nextDemoMs = now + 6500;
      }

      // 3) play any notes that have come due (Echo's reply) ------------------
      if (e.pending.length) {
        const still: PendingNote[] = [];
        for (const p of e.pending) {
          if (now >= p.playAt) {
            playTone(p.deg, p.harmony, false);
            if (!p.harmony) {
              launchBird("far", p.deg, false);
              e.echoActiveUntil = now + 420;
            }
          } else {
            still.push(p);
          }
        }
        e.pending = still;
      }

      // 4) DRAW (matte cut-paper) -------------------------------------------
      const g = ctx2d;
      const dpr = sizeRef.current.dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      // dusk sky — flat matte gradient
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#2b2740");
      sky.addColorStop(0.55, "#3c3350");
      sky.addColorStop(1, "#52415e");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);

      // paper moon
      g.fillStyle = "#e9dcc2";
      g.beginPath();
      g.arc(w * 0.5, h * 0.2, Math.min(w, h) * 0.06, 0, Math.PI * 2);
      g.fill();

      // far cliff (right) and near cliff (left), with drop-shadow lips
      const cliffTopL = h * 0.6;
      const cliffTopR = h * 0.55;
      // near (left) cliff
      g.fillStyle = "#241d30";
      g.beginPath();
      g.moveTo(0, cliffTopL);
      g.lineTo(w * 0.34, cliffTopL);
      g.lineTo(w * 0.27, h);
      g.lineTo(0, h);
      g.closePath();
      g.fill();
      g.fillStyle = "#3a2f4a";
      g.fillRect(0, cliffTopL, w * 0.34, 10);
      // far (right) cliff
      g.fillStyle = "#241d30";
      g.beginPath();
      g.moveTo(w, cliffTopR);
      g.lineTo(w * 0.66, cliffTopR);
      g.lineTo(w * 0.73, h);
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      g.fillStyle = "#3a2f4a";
      g.fillRect(w * 0.66, cliffTopR, w * 0.34, 10);

      const childX = w * 0.17;
      const childY = cliffTopL - 6;
      const echoX = w * 0.83;
      const echoY = cliffTopR - 6;

      // birds in flight (paper triangles / petals on a bezier arc)
      const stillBirds: Bird[] = [];
      for (const b of e.birds) {
        const p = (now - b.born) / b.dur;
        if (p >= 1) continue;
        stillBirds.push(b);
        const fromX = b.side === "near" ? childX : echoX;
        const toX = b.side === "near" ? echoX : childX;
        const fromY = b.side === "near" ? childY - 24 : echoY - 24;
        const toY = b.side === "near" ? echoY - 24 : childY - 24;
        const x = fromX + (toX - fromX) * p;
        const y =
          fromY + (toY - fromY) * p - Math.sin(p * Math.PI) * b.arc;
        const sz = 16 + Math.sin(p * Math.PI) * 8;
        g.save();
        g.translate(x, y);
        g.rotate(Math.sin(now * 0.02 + b.born) * 0.3);
        g.fillStyle = DEG_DARK[b.deg];
        g.beginPath();
        g.ellipse(1.5, 2.5, sz, sz * 0.66, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = DEG_COLOR[b.deg];
        g.beginPath();
        g.ellipse(0, 0, sz, sz * 0.66, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      e.birds = stillBirds;

      // a paper creature: round body, eyes, beak; bobs when singing
      const drawCreature = (
        cx: number,
        cy: number,
        bob: number,
        face: number, // -1 faces left, +1 faces right
        body: string,
        dark: string,
        singing: boolean
      ) => {
        const r = 40;
        const yy = cy - bob;
        // listening / singing ring (matte, not glow)
        if (singing) {
          g.strokeStyle = "rgba(255,255,255,0.22)";
          g.lineWidth = 3;
          g.beginPath();
          g.arc(cx, yy - r * 0.2, r + 14, 0, Math.PI * 2);
          g.stroke();
        }
        // drop shadow
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.beginPath();
        g.ellipse(cx + 3, cy + r * 0.7, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        // body
        g.fillStyle = dark;
        g.beginPath();
        g.arc(cx + 2, yy - r * 0.2 + 3, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = body;
        g.beginPath();
        g.arc(cx, yy - r * 0.2, r, 0, Math.PI * 2);
        g.fill();
        // eyes
        g.fillStyle = "#fffaf0";
        g.beginPath();
        g.arc(cx + face * 10 - 7, yy - r * 0.35, 8, 0, Math.PI * 2);
        g.arc(cx + face * 10 + 9, yy - r * 0.35, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#2a2230";
        g.beginPath();
        g.arc(cx + face * 12 - 7, yy - r * 0.35, 3.4, 0, Math.PI * 2);
        g.arc(cx + face * 12 + 9, yy - r * 0.35, 3.4, 0, Math.PI * 2);
        g.fill();
        // beak (opens when singing)
        const open = singing ? 8 : 2;
        g.fillStyle = "#e0a24a";
        g.beginPath();
        g.moveTo(cx + face * 22, yy - r * 0.15 - open / 2);
        g.lineTo(cx + face * 36, yy - r * 0.1);
        g.lineTo(cx + face * 22, yy - r * 0.1 + open / 2);
        g.closePath();
        g.fill();
      };

      const childBob = now < e.childGlowUntil ? Math.sin(now * 0.03) * 5 + 5 : 0;
      const echoBob = now < e.echoActiveUntil ? Math.sin(now * 0.03) * 6 + 6 : 0;
      drawCreature(childX, childY, childBob, 1, "#e8c9a0", "#9a7a52", now < e.childGlowUntil);
      drawCreature(echoX, echoY, echoBob, -1, "#9fb6d9", "#5a6f95", now < e.echoActiveUntil);

      // gentle intro hint (fades after ~7s) — labelling, not gating
      const age = now - e.startMs;
      if (age < 7000) {
        const a = age < 5500 ? 0.85 : 0.85 * (1 - (age - 5500) / 1500);
        g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        g.font = "600 22px ui-sans-serif, system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText(
          e.mode === "mic" ? "Sing or hum — Echo will sing back" : "Listen — they are singing to each other",
          w / 2,
          h * 0.4
        );
        g.textAlign = "start";
      }

      e.raf = requestAnimationFrame(frame);
    };

    e.raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(e.raf);
      window.removeEventListener("resize", resize);
      try {
        e.mediaStream?.getTracks().forEach((t) => t.stop());
        void e.ctx.close();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // ── intro screen ─────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-6 px-6 text-center"
        style={{ height: "100dvh", background: "#2b2740" }}
      >
        <h1 className="text-3xl font-semibold text-white/95">Echo Canyon</h1>
        <p className="max-w-md text-lg text-white/80">
          Sing, hum, or call across the canyon. A little paper creature will
          catch your song and sing it right back to you — then add a friend.
        </p>
        <p className="max-w-md text-base text-white/60">
          For kids (4+). Best with the sound on. Nothing you sing is ever wrong.
        </p>
        {micError && <p className="max-w-md text-base text-rose-300">{micError}</p>}
        <button
          onClick={handleStart}
          className="min-h-[64px] rounded-2xl px-10 py-4 text-xl font-bold transition-transform active:scale-95"
          style={{ background: "#9fb6d9", color: "#1c1726" }}
        >
          ▶ start singing
        </button>
        <Link
          href="/dream"
          className="text-base text-white/55 transition-colors hover:text-white/80"
        >
          ← dream lab
        </Link>
      </div>
    );
  }

  // ── play screen ──────────────────────────────────────────────────────────
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "100dvh", background: "#2b2740" }}
    >
      {micError && (
        <div className="pointer-events-none absolute left-0 right-0 top-4 z-20 flex justify-center px-4">
          <p className="rounded-xl bg-black/55 px-4 py-2 text-base text-rose-300">
            {micError}
          </p>
        </div>
      )}
      <canvas ref={canvasRef} className="absolute inset-0" />
      <Link
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/280-kids-echo-canyon/README.md"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 z-10 text-white/45 transition-colors hover:text-white/70"
        style={{ fontSize: 12 }}
      >
        design notes
      </Link>
    </div>
  );
}
