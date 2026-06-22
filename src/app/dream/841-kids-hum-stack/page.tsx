"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ============================================================================
 * 841 — KIDS HUM STACK
 * Hum any note → a glowing "root creature" sits at your pitch and follows it.
 * Tap big flavor buttons to STACK friendly harmony creatures on top of YOUR
 * voice: WARM (third), BRIGHT (fifth/octave), SPICY (seventh/tritone).
 * Each creature sings its interval relative to the child's live detected pitch.
 * Spicy stacks shimmer + add a playful beating detune (mood, not "wrong").
 * No-mic fallback: pick a colored root pad and stack harmony on that.
 * Pitch detection is our own MPM/autocorrelation (no library).
 * ========================================================================== */

// ---- Interval flavors (semitones above the root) ----------------------------
type Flavor = "warm" | "bright" | "spicy";

interface FlavorDef {
  id: Flavor;
  label: string;
  // semitone choices cycled as the child stacks more of the same flavor
  semis: number[];
  hex: string;
  glyph: string; // simple emoji-ish glyph, color-coded not word-dependent
  spicy: boolean;
}

const FLAVORS: FlavorDef[] = [
  { id: "warm", label: "warm", semis: [3, 4, 8], hex: "#fb923c", glyph: "♥", spicy: false }, // thirds / sixth
  { id: "bright", label: "bright", semis: [7, 12, 19], hex: "#38bdf8", glyph: "★", spicy: false }, // fifth / octave
  { id: "spicy", label: "spicy", semis: [10, 2, 6], hex: "#f472b6", glyph: "✦", spicy: true }, // seventh / second / tritone
];

const MAX_STACK = 5; // cap voices so it never gets harsh

// Friendly root-pad colors for the no-mic fallback (each a bold saturated hue)
const ROOT_PADS = [
  { hex: "#a78bfa", midi: 55 }, // G3
  { hex: "#34d399", midi: 60 }, // C4
  { hex: "#fbbf24", midi: 64 }, // E4
  { hex: "#f87171", midi: 67 }, // G4
];

// ---- Pitch helpers ----------------------------------------------------------
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/**
 * Monophonic pitch detection via the McLeod Pitch Method (NSDF / normalized
 * square difference function) with parabolic peak refinement.
 * Returns frequency in Hz, or -1 if no confident pitch.
 */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;

  // RMS gate — ignore silence / very quiet input
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  const MAX_LAG = Math.floor(SIZE / 2);
  const nsdf = new Float32Array(MAX_LAG);

  for (let lag = 0; lag < MAX_LAG; lag++) {
    let acf = 0; // autocorrelation
    let m = 0; // squared magnitude (m')
    for (let i = 0; i < SIZE - lag; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      acf += a * b;
      m += a * a + b * b;
    }
    nsdf[lag] = m > 0 ? (2 * acf) / m : 0;
  }

  // Find peaks: pick the first peak above a confidence threshold of the max.
  const positions: number[] = [];
  let lag = 1;
  // skip the descending slope from lag 0
  while (lag < MAX_LAG - 1 && nsdf[lag] > 0) lag++;
  for (; lag < MAX_LAG - 1; lag++) {
    if (nsdf[lag] > 0 && nsdf[lag] > nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
      // local maximum candidate; refine to the actual peak top
      let maxLag = lag;
      let maxVal = nsdf[lag];
      let j = lag + 1;
      while (j < MAX_LAG - 1 && nsdf[j] > 0) {
        if (nsdf[j] > maxVal) {
          maxVal = nsdf[j];
          maxLag = j;
        }
        if (nsdf[j] <= 0) break;
        j++;
      }
      positions.push(maxLag);
      lag = j;
    }
  }
  if (positions.length === 0) return -1;

  let highest = 0;
  for (const p of positions) if (nsdf[p] > highest) highest = nsdf[p];
  const threshold = 0.8 * highest;
  if (highest < 0.4) return -1; // not periodic enough

  let chosen = -1;
  for (const p of positions) {
    if (nsdf[p] >= threshold) {
      chosen = p;
      break;
    }
  }
  if (chosen <= 0) return -1;

  // Parabolic interpolation for a sub-sample peak.
  const x0 = chosen - 1;
  const x2 = chosen + 1;
  const y0 = nsdf[x0];
  const y1 = nsdf[chosen];
  const y2 = nsdf[x2];
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const period = chosen + shift;

  const freq = sampleRate / period;
  if (freq < 70 || freq > 1100) return -1; // human hum range
  return freq;
}

// ---- A single sustained harmony voice (one stacked creature) ----------------
interface Voice {
  id: number;
  flavor: Flavor;
  semis: number; // interval above root in semitones
  hex: string;
  spicy: boolean;
  osc: OscillatorNode;
  osc2: OscillatorNode | null; // detuned partner for spicy beating
  gain: GainNode;
  lfo: OscillatorNode | null; // shimmer LFO for spicy
}

let voiceSeq = 1;

export default function KidsHumStack() {
  const [started, setStarted] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [stackCount, setStackCount] = useState(0); // drives button enable/disable
  const [rootPadMidi, setRootPadMidi] = useState<number | null>(null); // fallback root

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // audio graph refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const lowpassRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // root creature pitch (Hz), smoothed; -1 = silent/unknown
  const rootFreqRef = useRef<number>(-1);
  const smoothFreqRef = useRef<number>(-1);
  const ampRef = useRef<number>(0); // combined amplitude 0..1
  const voicesRef = useRef<Voice[]>([]);
  const rafRef = useRef<number>(0);
  const pcmRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  // -- create the always-on ambient bed (never silent) ------------------------
  const startAmbient = useCallback((ctx: AudioContext, dest: AudioNode) => {
    // gentle low drone in C, two soft triangle voices an octave apart
    [48, 60].forEach((midi, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = midiToFreq(midi);
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.05 : 0.03;
      // slow tremolo so the bed "breathes"
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.1 + i * 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.015;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(g).connect(dest);
      osc.start();
      lfo.start();
    });
  }, []);

  // -- play a soft "pop" when a creature appears ------------------------------
  const playPop = useCallback((freq: number) => {
    const ctx = ctxRef.current;
    const dest = lowpassRef.current;
    if (!ctx || !dest) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const g = ctx.createGain();
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(g).connect(dest);
    osc.start(now);
    osc.stop(now + 0.45);
  }, []);

  // -- compute current root frequency (live mic OR fallback pad) ---------------
  const currentRootFreq = useCallback((): number => {
    if (hasMic) return smoothFreqRef.current;
    if (rootPadMidi != null) return midiToFreq(rootPadMidi);
    return -1;
  }, [hasMic, rootPadMidi]);

  // -- stack a new harmony creature -------------------------------------------
  const stackVoice = useCallback(
    (flavor: Flavor) => {
      const ctx = ctxRef.current;
      const dest = lowpassRef.current;
      if (!ctx || !dest) return;
      if (voicesRef.current.length >= MAX_STACK) return;

      const root = currentRootFreq();
      if (root <= 0) return; // need a root (hum something, or pick a pad)

      const def = FLAVORS.find((f) => f.id === flavor)!;
      // how many of THIS flavor already stacked → cycle through its intervals
      const sameCount = voicesRef.current.filter((v: Voice) => v.flavor === flavor).length;
      const semis = def.semis[sameCount % def.semis.length];
      const freq = root * Math.pow(2, semis / 12);

      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.12); // gentle attack, modest gain
      gain.connect(dest);

      const osc = ctx.createOscillator();
      osc.type = def.spicy ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(freq, now);

      let osc2: OscillatorNode | null = null;
      let lfo: OscillatorNode | null = null;

      if (def.spicy) {
        // beating detune partner → playful shimmer/wobble
        const partner = ctx.createOscillator();
        partner.type = "sawtooth";
        partner.frequency.setValueAtTime(freq * Math.pow(2, 7 / 1200), now); // +7 cents
        const tameG = ctx.createGain();
        tameG.gain.value = 0.6;
        osc.connect(gain);
        partner.connect(tameG).connect(gain);
        // shimmer LFO modulating gain
        const shimmer = ctx.createOscillator();
        shimmer.type = "sine";
        shimmer.frequency.value = 5.5;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.04;
        shimmer.connect(lfoGain).connect(gain.gain);
        shimmer.start();
        partner.start();
        osc2 = partner;
        lfo = shimmer;
      } else {
        osc.connect(gain);
      }
      osc.start();

      const voice: Voice = {
        id: voiceSeq++,
        flavor,
        semis,
        hex: def.hex,
        spicy: def.spicy,
        osc,
        osc2,
        gain,
        lfo,
      };
      voicesRef.current.push(voice);
      setStackCount(voicesRef.current.length);
      playPop(freq);
    },
    [currentRootFreq, playPop],
  );

  // -- let go: release the top creature ---------------------------------------
  const releaseTop = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const v = voicesRef.current.pop();
    setStackCount(voicesRef.current.length);
    if (!v) return;
    const now = ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + 0.25);
    const stopAt = now + 0.3;
    try {
      v.osc.stop(stopAt);
      v.osc2?.stop(stopAt);
      v.lfo?.stop(stopAt);
    } catch {
      /* already stopped */
    }
  }, []);

  // -- keep harmony voices tracking the live root pitch -----------------------
  const retuneVoices = useCallback((root: number) => {
    const ctx = ctxRef.current;
    if (!ctx || root <= 0) return;
    const now = ctx.currentTime;
    for (const v of voicesRef.current) {
      const f = root * Math.pow(2, v.semis / 12);
      v.osc.frequency.setTargetAtTime(f, now, 0.06);
      if (v.osc2) v.osc2.frequency.setTargetAtTime(f * Math.pow(2, 7 / 1200), now, 0.06);
    }
  }, []);

  // ---- main render + analysis loop ------------------------------------------
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext("2d");
    const analyser = analyserRef.current;

    // --- pitch detection (mic only) ---
    if (hasMic && analyser && pcmRef.current) {
      analyser.getFloatTimeDomainData(pcmRef.current);
      const f = detectPitch(pcmRef.current, ctxRef.current!.sampleRate);
      if (f > 0) {
        rootFreqRef.current = f;
        // smooth toward detected pitch
        if (smoothFreqRef.current < 0) smoothFreqRef.current = f;
        else smoothFreqRef.current += (f - smoothFreqRef.current) * 0.25;
        retuneVoices(smoothFreqRef.current);
      } else {
        rootFreqRef.current = -1; // currently silent
      }
      // amplitude from RMS
      let rms = 0;
      for (let i = 0; i < pcmRef.current.length; i++) {
        rms += pcmRef.current[i] * pcmRef.current[i];
      }
      rms = Math.sqrt(rms / pcmRef.current.length);
      ampRef.current += (Math.min(1, rms * 6) - ampRef.current) * 0.2;
    } else if (rootPadMidi != null) {
      // fallback: steady root, gentle synthetic breathing amplitude
      smoothFreqRef.current = midiToFreq(rootPadMidi);
      const target = 0.45 + 0.15 * Math.sin(performance.now() / 700);
      ampRef.current += (target - ampRef.current) * 0.1;
    } else {
      ampRef.current += (0.12 - ampRef.current) * 0.08;
    }

    // --- draw ---
    if (canvas && ctx2d) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      // dark gradient backdrop
      const bg = ctx2d.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0b1026");
      bg.addColorStop(1, "#150a24");
      ctx2d.fillStyle = bg;
      ctx2d.fillRect(0, 0, W, H);

      const t = performance.now() / 1000;
      const amp = ampRef.current;
      const breath = 1 + amp * 0.18;

      const root = currentRootFreq();
      const singing = hasMic ? rootFreqRef.current > 0 : rootPadMidi != null;

      const cx = W / 2;
      // tower grows upward from a baseline near the bottom
      const baseY = H * 0.82;
      const stepY = Math.min(110, (H * 0.62) / (MAX_STACK + 1));
      const creatureR = Math.min(46, stepY * 0.42) * breath;

      // draw the stack: root at bottom, harmony creatures above
      const voices = voicesRef.current;

      // root creature
      const rootMidi = root > 0 ? freqToMidi(root) : 60;
      // map root pitch to a hue so it feels connected to the child's voice
      const rootHue = ((rootMidi % 12) / 12) * 360;
      drawCreature(
        ctx2d,
        cx,
        baseY,
        creatureR * 1.15,
        `hsl(${rootHue}, 85%, 62%)`,
        t,
        0,
        singing,
        false,
        true,
      );

      voices.forEach((v: Voice, i: number) => {
        const y = baseY - (i + 1) * stepY;
        const bob = Math.sin(t * (2.2 + v.semis * 0.05) + i) * (v.spicy ? 9 : 4) * breath;
        drawCreature(
          ctx2d,
          cx,
          y + bob,
          creatureR,
          v.hex,
          t,
          i + 1,
          true,
          v.spicy,
          false,
        );
        // connecting wisp to the creature below
        ctx2d.strokeStyle = "rgba(255,255,255,0.12)";
        ctx2d.lineWidth = 3;
        ctx2d.beginPath();
        ctx2d.moveTo(cx, y + bob + creatureR);
        const belowY = i === 0 ? baseY - creatureR * 1.15 : baseY - i * stepY;
        ctx2d.lineTo(cx, belowY);
        ctx2d.stroke();
      });

      // prompt when nothing is happening yet
      if (!singing && voices.length === 0) {
        ctx2d.fillStyle = "rgba(255,255,255,0.5)";
        ctx2d.font = "600 22px system-ui, sans-serif";
        ctx2d.textAlign = "center";
        const msg = hasMic ? "hum a note…" : "pick a color below to begin";
        ctx2d.fillText(msg, cx, baseY - 4 * stepY);
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [hasMic, rootPadMidi, retuneVoices, currentRootFreq]);

  // ---- start everything on first gesture ------------------------------------
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    // master chain: voices → lowpass → master → speakers
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    masterRef.current = master;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2600; // soften everything, no harsh transients
    lowpass.connect(master);
    lowpassRef.current = lowpass;

    startAmbient(ctx, lowpass);

    // try mic
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      pcmRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      src.connect(analyser); // analyser only — not routed to output (no feedback)
      analyserRef.current = analyser;
      setHasMic(true);
    } catch {
      setMicError(
        "No microphone yet — that's okay! Pick a color below and stack on it.",
      );
      setHasMic(false);
    }
    // the render/analysis loop is owned by the effect below (keyed on `started`)
  }, [started, startAmbient]);

  // restart loop ref when loop identity changes (deps changed e.g. hasMic)
  useEffect(() => {
    if (!started) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop, started]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      micStreamRef.current?.getTracks().forEach((tr: MediaStreamTrack) => tr.stop());
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ---------------------------------------------------------------------------
  const canStack =
    stackCount < MAX_STACK && (hasMic || rootPadMidi != null);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b1026] select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
      />

      {/* top bar */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-4">
        <h1 className="text-2xl font-bold text-white/95 drop-shadow">
          Hum &amp; Stack
        </h1>
        <Link
          href="/dream"
          className="text-base text-white/40 hover:text-white/70 transition-colors"
        >
          ← dream
        </Link>
      </div>

      {/* start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/55 backdrop-blur-sm p-6">
          <p className="max-w-md text-center text-xl text-white/95">
            Hum a note, then tap the friendly buttons to stack singing creatures
            on top of your own voice.
          </p>
          <button
            onClick={handleStart}
            className="min-h-[64px] rounded-3xl bg-gradient-to-br from-amber-400 to-pink-500 px-12 py-6 text-2xl font-extrabold text-white shadow-xl active:scale-95 transition-transform"
          >
            ▶ tap to start
          </button>
        </div>
      )}

      {/* mic-denied / fallback message — clearly visible */}
      {started && micError && (
        <div className="absolute left-0 right-0 top-16 z-10 px-4">
          <p className="mx-auto max-w-md rounded-2xl bg-black/50 px-4 py-3 text-center text-base font-semibold text-rose-300">
            {micError}
          </p>
        </div>
      )}

      {/* fallback root-pad picker (only when no mic) */}
      {started && !hasMic && (
        <div className="absolute left-0 right-0 top-32 z-10 flex justify-center gap-3 px-4">
          {ROOT_PADS.map((p) => (
            <button
              key={p.midi}
              onClick={() => setRootPadMidi(p.midi)}
              className="min-h-[64px] min-w-[64px] rounded-2xl border-4 shadow-lg active:scale-90 transition-transform"
              style={{
                backgroundColor: p.hex,
                borderColor:
                  rootPadMidi === p.midi ? "#ffffff" : "rgba(255,255,255,0.25)",
              }}
              aria-label="root note"
            />
          ))}
        </div>
      )}

      {/* flavor buttons + let-go */}
      {started && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-4 p-5 pb-8">
          <div className="flex w-full max-w-2xl items-stretch justify-center gap-3">
            {FLAVORS.map((f) => (
              <button
                key={f.id}
                onClick={() => stackVoice(f.id)}
                disabled={!canStack}
                className="flex min-h-[88px] flex-1 flex-col items-center justify-center gap-1 rounded-3xl text-white shadow-xl active:scale-95 transition-transform disabled:opacity-30"
                style={{ backgroundColor: f.hex }}
                aria-label={f.label}
              >
                <span className="text-3xl leading-none">{f.glyph}</span>
                <span className="text-base font-bold lowercase">{f.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={releaseTop}
            disabled={stackCount === 0}
            className="min-h-[64px] rounded-2xl bg-white/15 px-8 text-lg font-bold text-white/90 shadow active:scale-95 transition-transform disabled:opacity-25"
            aria-label="let go of the top creature"
          >
            ↓ let go
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Draw one friendly, bouncy creature (Toca-Boca-ish: round body, two eyes,
 * a smile, a soft glow). Spicy creatures shimmer with sparkles + wobble.
 * -------------------------------------------------------------------------- */
function drawCreature(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  t: number,
  index: number,
  active: boolean,
  spicy: boolean,
  isRoot: boolean,
): void {
  ctx.save();

  // wobble for spicy creatures
  const wob = spicy ? Math.sin(t * 9 + index) * 0.06 : 0;
  ctx.translate(x, y);
  ctx.rotate(wob);

  // outer glow
  const glowR = r * (isRoot ? 2.4 : 1.9);
  const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, glowR);
  const alpha = active ? (spicy ? 0.55 : 0.4) : 0.18;
  glow.addColorStop(0, hexA(color, alpha));
  glow.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();

  // body — squishy ellipse
  const squish = 1 + Math.sin(t * 3 + index) * 0.05;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * squish, r / squish, 0, 0, Math.PI * 2);
  ctx.fill();

  // glossy highlight
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.28, r * 0.2, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  const eyeDX = r * 0.34;
  const eyeY = -r * 0.08;
  const eyeR = r * 0.18;
  [-eyeDX, eyeDX].forEach((dx) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(dx, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // pupil follows a tiny bob
    const pdy = Math.sin(t * 2 + index) * eyeR * 0.25;
    ctx.fillStyle = "#1b1530";
    ctx.beginPath();
    ctx.arc(dx, eyeY + pdy, eyeR * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // mouth — a happy smile
  ctx.strokeStyle = "rgba(27,21,48,0.8)";
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, r * 0.18, r * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // spicy sparkles
  if (spicy) {
    for (let i = 0; i < 5; i++) {
      const a = t * 2 + (i / 5) * Math.PI * 2;
      const rr = r * (1.5 + 0.3 * Math.sin(t * 4 + i));
      const sx = Math.cos(a) * rr;
      const sy = Math.sin(a) * rr;
      const tw = 0.5 + 0.5 * Math.sin(t * 8 + i * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.3 + tw * 0.5})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + tw * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// hex (#rrggbb) + alpha → rgba string; passes through hsl()/rgb() unchanged-ish
function hexA(color: string, a: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  // hsl(...) → hsla(...)
  if (color.startsWith("hsl(")) {
    return color.replace("hsl(", "hsla(").replace(")", `,${a})`);
  }
  return color;
}
