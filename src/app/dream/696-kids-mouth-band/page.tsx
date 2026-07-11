"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/*
  696-kids-mouth-band — "Mouth Band"
  Make mouth noises (boom / tss / pop / brrr). A goofy creature catches each one,
  fires a punchy drum sound, and loops them into a groove the kid can bop to.

  Audio chain (kids-safe):
    voices -> masterGain(0.28) -> lowpass(7.5kHz) -> compressor(brick-wall limiter) -> destination
  Mic is ANALYSIS ONLY (RMS onset + AnalyserNode spectrum). Never recorded/stored/sent.
*/

// ---- drum voices ---------------------------------------------------------
type Voice = "kick" | "snare" | "hihat" | "brrr";
const VOICES: Voice[] = ["kick", "snare", "hihat", "brrr"];

const VOICE_COLOR: Record<Voice, string> = {
  kick: "#ef4444", // red
  snare: "#facc15", // yellow
  hihat: "#22d3ee", // cyan
  brrr: "#a855f7", // purple
};
const VOICE_LABEL: Record<Voice, string> = {
  kick: "BOOM",
  snare: "POP",
  hihat: "TSS",
  brrr: "BRRR",
};

const STEPS = 16; // 16-step loop
const BPM = 100;

// ---- groove model --------------------------------------------------------
// each step can hold a set of voices that were laid down there
type Loop = (Voice | null)[][]; // [step][slot]

function emptyLoop(): Loop {
  return Array.from({ length: STEPS }, () => []);
}

export default function MouthBand() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [micOk, setMicOk] = useState<boolean | null>(null); // null = unknown
  const [notice, setNotice] = useState<string>("");
  const [hasLoop, setHasLoop] = useState(false);

  // audio graph refs
  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const schedTimerRef = useRef<number | null>(null);

  // analysis buffers
  const freqRef = useRef<Uint8Array | null>(null);
  const timeRef = useRef<Float32Array | null>(null);

  // onset state
  const rmsHistRef = useRef<number[]>([]);
  const lastOnsetRef = useRef(0);

  // groove state
  const loopRef = useRef<Loop>(emptyLoop());
  const stepRef = useRef(0);
  const nextNoteTimeRef = useRef(0);

  // visual creature state (mutated by audio, read by rAF)
  const visRef = useRef({
    mouth: 0.18, // 0..1 openness
    eye: 0.5, // 0..1 bug
    bounce: 0, // squash impulse
    lastVoice: "kick" as Voice,
    flashColor: VOICE_COLOR.kick,
    flash: 0,
    t: 0,
    listening: 0, // ambient wiggle when nothing happening
  });

  // ghost / idle demo
  const ghostModeRef = useRef(false); // true when mic denied -> ghost beatboxes
  const lastInputRef = useRef(0); // ms of last real onset

  // -----------------------------------------------------------------------
  // SOUND SYNTHESIS — each voice is short & punchy, fired immediately
  // -----------------------------------------------------------------------
  function dest(): AudioNode {
    return masterRef.current ?? acRef.current!.destination;
  }

  function playVoice(v: Voice, when?: number, vel = 1) {
    const ac = acRef.current;
    if (!ac) return;
    const t = when ?? ac.currentTime;
    const out = dest();
    if (v === "kick") {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9 * vel, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.3);
    } else if (v === "snare") {
      // noise burst + mid tone
      const nb = noiseBuffer(ac, 0.2);
      const ns = ac.createBufferSource();
      ns.buffer = nb;
      const nf = ac.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 1800;
      nf.Q.value = 0.8;
      const ng = ac.createGain();
      ng.gain.setValueAtTime(0.6 * vel, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      ns.connect(nf).connect(ng).connect(out);
      const o = ac.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(330, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.1);
      const og = ac.createGain();
      og.gain.setValueAtTime(0.35 * vel, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(og).connect(out);
      ns.start(t);
      ns.stop(t + 0.2);
      o.start(t);
      o.stop(t + 0.16);
    } else if (v === "hihat") {
      const nb = noiseBuffer(ac, 0.08);
      const ns = ac.createBufferSource();
      ns.buffer = nb;
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5000;
      const ng = ac.createGain();
      ng.gain.setValueAtTime(0.4 * vel, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      ns.connect(hp).connect(ng).connect(out);
      ns.start(t);
      ns.stop(t + 0.08);
    } else {
      // brrr — comedic buzzy raspberry: low sawtooth with fast amplitude wobble
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(90, t);
      o.frequency.linearRampToValueAtTime(70, t + 0.3);
      const lf = ac.createBiquadFilter();
      lf.type = "lowpass";
      lf.frequency.value = 900;
      const g = ac.createGain();
      // wobble via a tremolo LFO
      const lfo = ac.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = 22;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = 0.28;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.02);
      g.gain.setValueAtTime(0.5 * vel, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      lfo.connect(lfoGain).connect(g.gain);
      o.connect(lf).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.44);
      lfo.start(t);
      lfo.stop(t + 0.44);
    }
  }

  function noiseBuffer(ac: AudioContext, dur: number) {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ambientBed(ac: AudioContext, out: AudioNode) {
    // soft always-on pad so it never feels broken
    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = 98; // G2
    o2.frequency.value = 146.83; // D3
    const g = ac.createGain();
    g.gain.value = 0.05;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    // slow tremolo
    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.15;
    const lfoG = ac.createGain();
    lfoG.gain.value = 0.02;
    lfo.connect(lfoG).connect(g.gain);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(out);
    o1.start();
    o2.start();
    lfo.start();
  }

  // -----------------------------------------------------------------------
  // CLASSIFIER — heuristic on AnalyserNode spectrum
  // -----------------------------------------------------------------------
  function classify(): Voice {
    const an = analyserRef.current;
    const freq = freqRef.current;
    if (!an || !freq) return "snare";
    an.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>);
    const sr = acRef.current!.sampleRate;
    const binHz = sr / 2 / freq.length;

    let total = 0;
    let weighted = 0;
    let low = 0; // < 300 Hz
    let mid = 0; // 300 - 2500
    let high = 0; // >= 2500 Hz (bright / noisy → hihat)
    for (let i = 1; i < freq.length; i++) {
      const hz = i * binHz;
      const m = freq[i];
      total += m;
      weighted += m * hz;
      if (hz < 300) low += m;
      else if (hz < 2500) mid += m;
      else high += m;
    }
    if (total < 1) return "snare";
    const centroid = weighted / total; // Hz
    const lowFrac = low / total;
    const highFrac = high / total;
    const midFrac = mid / total;

    // flatness-ish proxy: how spread the energy is (noisy = hihat)
    // brrr detection: lots of low energy but also rough harmonics -> low + some mid
    if (lowFrac > 0.45) {
      // distinguish kick (clean thump) from brrr (buzzy: low + meaningful mid harmonics)
      if (midFrac > 0.28) return "brrr";
      return "kick";
    }
    if (highFrac > 0.32 || centroid > 4200) return "hihat";
    if (centroid < 700 && midFrac < 0.25) return "kick";
    return "snare"; // mid burst default
  }

  // -----------------------------------------------------------------------
  // ONSET DETECTION (energy gate) — runs in rAF
  // -----------------------------------------------------------------------
  function rms(): number {
    const an = analyserRef.current;
    const td = timeRef.current;
    if (!an || !td) return 0;
    an.getFloatTimeDomainData(td as Float32Array<ArrayBuffer>);
    let s = 0;
    for (let i = 0; i < td.length; i++) s += td[i] * td[i];
    return Math.sqrt(s / td.length);
  }

  function detectOnset(now: number) {
    const cur = rms();
    const hist = rmsHistRef.current;
    hist.push(cur);
    if (hist.length > 8) hist.shift();
    const avg = hist.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, hist.length - 1);
    // sharp rise above recent average, with a noise floor & refractory period
    const isOnset =
      cur > 0.045 && cur > avg * 1.8 + 0.02 && now - lastOnsetRef.current > 110;
    if (isOnset) {
      lastOnsetRef.current = now;
      const v = classify();
      onHit(v, true);
    }
  }

  // -----------------------------------------------------------------------
  // HIT — fire sound + record into loop + kick the visuals
  // -----------------------------------------------------------------------
  function onHit(v: Voice, fromInput: boolean) {
    playVoice(v); // immediate
    if (fromInput) lastInputRef.current = performance.now();
    // record into nearest upcoming step (quantize to current step pointer)
    const step = stepRef.current;
    const slot = loopRef.current[step];
    if (!slot.includes(v) && slot.length < 4) slot.push(v);
    setHasLoop(true);
    kickVisual(v);
  }

  function kickVisual(v: Voice) {
    const vis = visRef.current;
    vis.mouth = 1;
    vis.eye = 1;
    vis.bounce = 1;
    vis.lastVoice = v;
    vis.flashColor = VOICE_COLOR[v];
    vis.flash = 1;
  }

  // -----------------------------------------------------------------------
  // SCHEDULER (Chris Wilson look-ahead) — plays the recorded loop
  // -----------------------------------------------------------------------
  function scheduler() {
    const ac = acRef.current;
    if (!ac) return;
    const secPerStep = 60 / BPM / 4; // 16th notes
    const lookahead = 0.1; // seconds
    while (nextNoteTimeRef.current < ac.currentTime + lookahead) {
      const step = stepRef.current;
      const slot = loopRef.current[step];
      for (const v of slot) {
        if (v) {
          playVoice(v, nextNoteTimeRef.current, 0.9);
          // schedule a visual pop close to playback
          const delay = (nextNoteTimeRef.current - ac.currentTime) * 1000;
          window.setTimeout(() => kickVisual(v), Math.max(0, delay));
        }
      }
      nextNoteTimeRef.current += secPerStep;
      stepRef.current = (step + 1) % STEPS;
    }
    schedTimerRef.current = window.setTimeout(scheduler, 25);
  }

  // -----------------------------------------------------------------------
  // GHOST / IDLE auto-demo
  // -----------------------------------------------------------------------
  const ghostPattern: (Voice | null)[] = [
    "kick", null, "hihat", null,
    "snare", null, "hihat", "brrr",
    "kick", "kick", "hihat", null,
    "snare", null, "hihat", null,
  ];
  const ghostStepRef = useRef(0);

  function maybeGhost(now: number) {
    // If mic denied -> always ghost. If mic OK but idle >2.5s -> tease a demo lick.
    const idle = now - lastInputRef.current;
    if (ghostModeRef.current) return; // handled by scheduler injection below
    if (micOkRef.current === false) return;
    if (idle > 2500 && !hasLoopRef.current) {
      // gently inject a ghost hit so a glance is alive
      if (now - lastGhostRef.current > 350) {
        lastGhostRef.current = now;
        const v = ghostPattern[ghostStepRef.current % ghostPattern.length];
        ghostStepRef.current++;
        if (v) {
          playVoice(v, undefined, 0.7);
          kickVisual(v);
        }
      }
    }
  }
  const lastGhostRef = useRef(0);
  // mirror state into refs for use inside loops
  const micOkRef = useRef<boolean | null>(null);
  const hasLoopRef = useRef(false);
  useEffect(() => {
    micOkRef.current = micOk;
  }, [micOk]);
  useEffect(() => {
    hasLoopRef.current = hasLoop;
  }, [hasLoop]);

  // -----------------------------------------------------------------------
  // GHOST loop (mic denied): write the ghost pattern straight into the loop
  // -----------------------------------------------------------------------
  function installGhostGroove() {
    const l = emptyLoop();
    ghostPattern.forEach((v, i) => {
      if (v) l[i].push(v);
    });
    loopRef.current = l;
    setHasLoop(true);
  }

  // -----------------------------------------------------------------------
  // RENDER LOOP
  // -----------------------------------------------------------------------
  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    const W = canvas.width;
    const H = canvas.height;
    const vis = visRef.current;
    vis.t += 1;

    // decay
    vis.mouth += (0.18 - vis.mouth) * 0.18;
    vis.eye += (0.5 - vis.eye) * 0.12;
    vis.bounce *= 0.85;
    vis.flash *= 0.9;

    const now = performance.now();
    if (!ghostModeRef.current) maybeGhost(now);

    // onset detection (only if mic mode)
    if (analyserRef.current && !ghostModeRef.current) detectOnset(now);

    // background — bright goofy gradient, flashes voice color on hit
    const cx = W / 2;
    const cy = H / 2;
    ctx.fillStyle = "#1a103a";
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(cx, cy, 40, cx, cy, Math.max(W, H) * 0.7);
    const fc = vis.flashColor;
    g.addColorStop(0, hexA(fc, 0.18 + vis.flash * 0.4));
    g.addColorStop(1, "rgba(20,10,50,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // confetti-ish bopping dots around
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + vis.t * 0.01;
      const r = Math.min(W, H) * 0.42 + Math.sin(vis.t * 0.05 + i) * 12 + vis.bounce * 20;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      ctx.fillStyle = hexA(VOICE_COLOR[VOICES[i % 4]], 0.7);
      ctx.beginPath();
      ctx.arc(x, y, 7 + vis.bounce * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- the creature ----
    const baseR = Math.min(W, H) * 0.26;
    const squash = 1 + vis.bounce * 0.18;
    const stretch = 1 - vis.bounce * 0.12;
    const bodyR = baseR;
    const bob = Math.sin(vis.t * 0.06) * 6 - vis.bounce * 14;

    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.scale(squash, stretch);

    // body (bright, tinted toward last voice)
    const bodyColor = mix("#34d399", vis.flashColor, vis.flash * 0.6);
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
    ctx.fill();
    // cheeks
    ctx.fillStyle = "rgba(255,120,160,0.45)";
    ctx.beginPath();
    ctx.arc(-bodyR * 0.5, bodyR * 0.18, bodyR * 0.18, 0, Math.PI * 2);
    ctx.arc(bodyR * 0.5, bodyR * 0.18, bodyR * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // eyes (bug out on hit)
    const eyeR = bodyR * (0.16 + vis.eye * 0.12);
    const eyeY = -bodyR * 0.32;
    const eyeX = bodyR * 0.36;
    for (const sx of [-1, 1]) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(sx * eyeX, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      // pupil looks slightly up & toward center, jiggles
      const pjx = Math.sin(vis.t * 0.2 + sx) * 2;
      ctx.fillStyle = "#16213a";
      ctx.beginPath();
      ctx.arc(sx * eyeX + pjx, eyeY - eyeR * 0.2, eyeR * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    // eyebrows (goofy)
    ctx.strokeStyle = "#16213a";
    ctx.lineWidth = bodyR * 0.05;
    ctx.lineCap = "round";
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * eyeX - eyeR, eyeY - eyeR * 1.5 - vis.eye * 6);
      ctx.lineTo(sx * eyeX + eyeR, eyeY - eyeR * 1.3 - vis.eye * 10);
      ctx.stroke();
    }

    // MOUTH — big open O on hit, lined with the voice color
    const mY = bodyR * 0.32;
    const mW = bodyR * (0.3 + vis.mouth * 0.55);
    const mH = bodyR * (0.12 + vis.mouth * 0.6);
    ctx.fillStyle = "#2a0a1a";
    ctx.strokeStyle = vis.flashColor;
    ctx.lineWidth = bodyR * 0.04;
    ctx.beginPath();
    ctx.ellipse(0, mY, mW, mH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // tongue
    ctx.fillStyle = "#ff5e8a";
    ctx.beginPath();
    ctx.ellipse(0, mY + mH * 0.4, mW * 0.55, mH * 0.4 * vis.mouth + 4, 0, 0, Math.PI);
    ctx.fill();

    ctx.restore();

    // ---- step strip at bottom (visual loop, no reading needed) ----
    const stripY = H - 46;
    const cell = Math.min(28, (W - 40) / STEPS);
    const startX = cx - (cell * STEPS) / 2;
    for (let i = 0; i < STEPS; i++) {
      const x = startX + i * cell;
      const active = i === stepRef.current && (hasLoopRef.current || ghostModeRef.current);
      ctx.fillStyle = active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)";
      roundRect(ctx, x + 2, stripY, cell - 4, 14, 4);
      ctx.fill();
      const slot = loopRef.current[i];
      slot.forEach((v, k) => {
        if (!v) return;
        ctx.fillStyle = VOICE_COLOR[v];
        ctx.beginPath();
        ctx.arc(x + cell / 2, stripY - 10 - k * 9, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    rafRef.current = requestAnimationFrame(draw);
  }

  // -----------------------------------------------------------------------
  // START / TEARDOWN
  // -----------------------------------------------------------------------
  async function start() {
    if (started) return;
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;

    // kids-safe master chain
    const master = ac.createGain();
    master.gain.value = 0.28;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7500;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    master.connect(lp).connect(comp).connect(ac.destination);
    masterRef.current = master;

    ambientBed(ac, master);

    // try mic
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.1;
      src.connect(an); // analysis only — NOT connected to destination
      analyserRef.current = an;
      freqRef.current = new Uint8Array(an.frequencyBinCount);
      timeRef.current = new Float32Array(an.fftSize);
      setMicOk(true);
      micOkRef.current = true;
      setNotice("");
      lastInputRef.current = performance.now();
    } catch {
      // graceful degrade: ghost beatboxes on its own
      setMicOk(false);
      micOkRef.current = false;
      ghostModeRef.current = true;
      installGhostGroove();
      setNotice("No mic — the ghost is beatboxing for you. Tap CLEAR to hush, then make noises if you turn the mic on.");
    }

    // start groove scheduler + render loop
    nextNoteTimeRef.current = ac.currentTime + 0.1;
    scheduler();
    rafRef.current = requestAnimationFrame(draw);
    setStarted(true);
  }

  function clearLoop() {
    loopRef.current = emptyLoop();
    stepRef.current = 0;
    ghostStepRef.current = 0;
    if (ghostModeRef.current) {
      // re-arm ghost so it stays alive when no mic
      window.setTimeout(() => {
        if (ghostModeRef.current) installGhostGroove();
      }, 1500);
    }
    setHasLoop(false);
    hasLoopRef.current = false;
    lastInputRef.current = performance.now();
    // little celebratory bop
    kickVisual("hihat");
  }

  useEffect(() => {
    // size canvas to its box
    const canvas = canvasRef.current;
    if (canvas) {
      const resize = () => {
        const r = canvas.parentElement?.getBoundingClientRect();
        if (r) {
          canvas.width = Math.max(320, Math.floor(r.width));
          canvas.height = Math.max(320, Math.floor(r.height));
        }
      };
      resize();
      window.addEventListener("resize", resize);
      // run an idle preview rAF before start so the page is alive visually
      if (!started && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(draw);
      }
      return () => window.removeEventListener("resize", resize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (schedTimerRef.current != null) clearTimeout(schedTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const ac = acRef.current;
      if (ac && ac.state !== "closed") ac.close();
    };
  }, []);

  // -----------------------------------------------------------------------
  return (
    <main className="relative min-h-screen w-full bg-[#120a2e] text-foreground font-sans overflow-hidden">
      <div className="absolute inset-0">
        <canvas ref={canvasRef} className="h-full w-full block" />
      </div>

      {/* header */}
      <div className="relative z-10 px-5 pt-5 pointer-events-none">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          🎤 Mouth Band
        </h1>
        <p className="text-base text-muted-foreground mt-1 max-w-md">
          Make noises with your mouth — <span className="font-mono">boom · tss · pop · brrr</span> — and watch the goofy guy loop them into a beat!
        </p>
        {micOk === false && (
          <p className="text-base text-violet-300 mt-2 max-w-md">{notice}</p>
        )}
      </div>

      {/* voice legend (visual, color-coded) */}
      <div className="absolute z-10 top-5 right-5 flex flex-col gap-1.5 pointer-events-none">
        {VOICES.map((v) => (
          <div key={v} className="flex items-center gap-2 justify-end">
            <span className="font-mono text-sm text-muted-foreground">{VOICE_LABEL[v]}</span>
            <span
              className="inline-block w-5 h-5 rounded-full"
              style={{ backgroundColor: VOICE_COLOR[v] }}
            />
          </div>
        ))}
      </div>

      {/* controls */}
      <div className="absolute z-10 bottom-16 left-0 right-0 flex items-center justify-center gap-4 px-5">
        {!started ? (
          <button
            onClick={start}
            className="min-h-[44px] px-8 py-3 rounded-2xl bg-violet-400 text-[#120a2e] text-xl font-bold shadow-lg active:scale-95 transition"
          >
            ▶ START
          </button>
        ) : (
          <button
            onClick={clearLoop}
            className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-violet-500 text-foreground text-lg font-bold shadow-lg active:scale-95 transition"
          >
            🔄 CLEAR
          </button>
        )}
      </div>

      {/* design notes link */}
      <Link
        href="/dream/696-kids-mouth-band/README.md"
        className="absolute z-10 bottom-3 right-4 text-sm font-mono text-muted-foreground underline decoration-dotted hover:text-foreground"
      >
        Read the design notes
      </Link>
    </main>
  );
}

// ---- canvas helpers --------------------------------------------------------
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex: string, a: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function parseHex(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function mix(a: string, b: string, t: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bl = Math.round(A.b + (B.b - A.b) * t);
  return `rgb(${r},${g},${bl})`;
}
