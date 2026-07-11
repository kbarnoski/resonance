"use client";
import { useEffect, useRef, useState } from "react";

/**
 * 626 — Empty Room
 * An eyes-closed, audio-first binaural piece. Invisible "presences" drift
 * around the listener in 3D space; turn to face one and it opens up.
 * Input: DeviceOrientation (phone) with pointer-drag fallback (desktop).
 * Output: Web Audio HRTF binaural + an austere near-black compass aid.
 */

// ---- Dark / modal pitch material (Phrygian-ish over a low drone) -----------
// Frequencies in Hz. Low, close, with semitone + tritone tension available.
const DARK_SET = [
  98.0,   // G2
  103.83, // G#2  (b2 — Phrygian half-step, unsettling)
  130.81, // C3
  138.59, // C#3  (b2 again, higher)
  146.83, // D3
  185.0,  // F#3  (tritone over C)
  196.0,  // G3
  233.08, // Bb3
];

interface Presence {
  // orbit
  azBase: number;      // base azimuth (radians)
  azRate: number;      // orbital drift rate (rad/s), can be +/-
  radBase: number;     // base radius
  radAmp: number;      // radius wobble amplitude
  radRate: number;     // radius wobble rate
  yOff: number;        // small vertical offset for depth
  // voice
  freq: number;        // current fundamental
  freqDrift: number;   // slow detune target offset
  driftPhase: number;
  // audio nodes
  panner: PannerNode | StereoPannerNode;
  voiceGain: GainNode;     // faced-brightness envelope
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  bright: BiquadFilterNode; // opens when faced
  // runtime
  faced: number;       // 0..1 smoothed alignment
  // current computed position (for drawing)
  curAz: number;
  curRad: number;
}

type Mode = "orientation" | "drag" | null;

export default function EmptyRoomPage() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [hrtf, setHrtf] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // shared mutable runtime (avoids re-renders in the audio loop)
  const headingRef = useRef(0);            // listener forward azimuth (radians)
  const lastInputRef = useRef(0);          // ms timestamp of last real input
  const startTimeRef = useRef(0);
  const dragRef = useRef<{ active: boolean; lastX: number }>({ active: false, lastX: 0 });

  useEffect(() => {
    if (!started) return;

    let cancelled = false;
    const AC: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    const ac = new AC();
    void ac.resume();

    const master = ac.createGain();
    master.gain.value = 0.0;
    master.connect(ac.destination);
    // gentle fade-in from silence (entering the dark)
    master.gain.setValueAtTime(0.0001, ac.currentTime);
    master.gain.linearRampToValueAtTime(0.55, ac.currentTime + 4);

    // soft global reverb-ish tail via a feedback delay (empty-cathedral sense)
    const wet = ac.createGain();
    wet.gain.value = 0.32;
    const delay = ac.createDelay(1.5);
    delay.delayTime.value = 0.37;
    const fb = ac.createGain();
    fb.gain.value = 0.45;
    const damp = ac.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1600;
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    // ---- Feature-detect HRTF panner ----
    let canHrtf = true;
    try {
      const test = ac.createPanner();
      test.panningModel = "HRTF";
      if (test.panningModel !== "HRTF") canHrtf = false;
      test.disconnect();
    } catch {
      canHrtf = false;
    }
    if (!cancelled) setHrtf(canHrtf);

    // ---- Listener orientation helpers (feature-detect modern vs legacy) ----
    const listener = ac.listener;
    function applyHeading(az: number) {
      // forward vector on the horizontal plane; up is +Y
      const fx = Math.sin(az);
      const fz = -Math.cos(az);
      if (listener.forwardX) {
        const t = ac.currentTime;
        listener.forwardX.setValueAtTime(fx, t);
        listener.forwardY.setValueAtTime(0, t);
        listener.forwardZ.setValueAtTime(fz, t);
        listener.upX.setValueAtTime(0, t);
        listener.upY.setValueAtTime(1, t);
        listener.upZ.setValueAtTime(0, t);
      } else if (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        typeof (listener as any).setOrientation === "function"
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (listener as any).setOrientation(fx, 0, fz, 0, 1, 0);
      }
    }
    applyHeading(0);

    // ---- Build presences ----
    const COUNT = 5;
    const presences: Presence[] = [];
    for (let i = 0; i < COUNT; i++) {
      const voiceGain = ac.createGain();
      voiceGain.gain.value = 0.0001;

      // brightness filter — closed (muffled, distant) until faced
      const bright = ac.createBiquadFilter();
      bright.type = "lowpass";
      bright.frequency.value = 520;
      bright.Q.value = 0.7;

      // panner
      let panner: PannerNode | StereoPannerNode;
      if (canHrtf) {
        const p = ac.createPanner();
        p.panningModel = "HRTF";
        p.distanceModel = "inverse";
        p.refDistance = 1;
        p.maxDistance = 30;
        p.rolloffFactor = 1.1;
        p.coneInnerAngle = 360;
        panner = p;
      } else {
        panner = ac.createStereoPanner();
      }

      // two slightly detuned oscillators for a breathing, alive voice
      const oscA = ac.createOscillator();
      const oscB = ac.createOscillator();
      oscA.type = "sine";
      oscB.type = "triangle";
      const f = DARK_SET[i % DARK_SET.length];
      oscA.frequency.value = f;
      oscB.frequency.value = f * 1.005; // gentle beating
      oscB.detune.value = 4;

      // subtle amplitude tremolo (breath) per voice
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.12 + Math.random() * 0.18;
      lfoGain.gain.value = 0.18;
      const trem = ac.createGain();
      trem.gain.value = 0.82;
      lfo.connect(lfoGain);
      lfoGain.connect(trem.gain);

      oscA.connect(bright);
      oscB.connect(bright);
      bright.connect(trem);
      trem.connect(voiceGain);
      voiceGain.connect(panner);
      // dry + send to shared tail
      panner.connect(master);
      panner.connect(delay);

      oscA.start();
      oscB.start();
      lfo.start();

      presences.push({
        azBase: (i / COUNT) * Math.PI * 2 + Math.random() * 0.4,
        azRate: (Math.random() < 0.5 ? -1 : 1) * (0.012 + Math.random() * 0.02),
        radBase: 3.2 + Math.random() * 2.4,
        radAmp: 1.4 + Math.random() * 1.6,
        radRate: 0.02 + Math.random() * 0.04,
        yOff: (Math.random() - 0.5) * 1.2,
        freq: f,
        freqDrift: 0,
        driftPhase: Math.random() * Math.PI * 2,
        panner,
        voiceGain,
        oscA,
        oscB,
        bright,
        faced: 0,
        curAz: 0,
        curRad: 3.2,
      });
    }

    // ---- Canvas ----
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function resize() {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    startTimeRef.current = performance.now();
    lastInputRef.current = performance.now();

    let rafId = 0;
    let prev = performance.now();

    function drawFrame(now: number) {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = (now - startTimeRef.current) / 1000;

      // ---- Idle auto-demo: if no input for 2.5s, slowly rotate heading ----
      const idle = now - lastInputRef.current > 2500;
      if (idle) {
        headingRef.current += 0.22 * dt; // ~20s per full turn
      }
      const heading = headingRef.current;
      applyHeading(heading);

      // ---- Update each presence ----
      for (const p of presences) {
        // slow orbit + occasional close pass via radius wobble
        const az = p.azBase + p.azRate * t;
        const rad = Math.max(
          0.6,
          p.radBase + p.radAmp * Math.sin(t * p.radRate * Math.PI * 2 + p.driftPhase)
        );
        p.curAz = az;
        p.curRad = rad;

        // world position: az is absolute world azimuth; +Y up
        const wx = Math.sin(az) * rad;
        const wz = -Math.cos(az) * rad;
        if ("positionX" in p.panner) {
          const ct = ac.currentTime;
          p.panner.positionX.setValueAtTime(wx, ct);
          p.panner.positionY.setValueAtTime(p.yOff, ct);
          p.panner.positionZ.setValueAtTime(wz, ct);
        } else {
          // stereo fallback: pan by az relative to heading
          let rel = az - heading;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          (p.panner as StereoPannerNode).pan.value = Math.max(
            -1,
            Math.min(1, Math.sin(rel))
          );
        }

        // alignment: how directly are we facing this presence?
        let rel = az - heading;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        const align = Math.max(0, Math.cos(rel)); // 1 when faced, 0 at 90deg+
        const target = Math.pow(align, 3.2);       // sharpen the "facing" sweet spot
        // smooth toward target
        p.faced += (target - p.faced) * Math.min(1, dt * 4);

        // faced -> louder + brighter + slightly nearer presence in the mix
        const gain = 0.05 + p.faced * 0.5;
        p.voiceGain.gain.setTargetAtTime(gain, ac.currentTime, 0.18);
        const cutoff = 420 + p.faced * 2600;
        p.bright.frequency.setTargetAtTime(cutoff, ac.currentTime, 0.2);

        // slow generative pitch drift (different at minute 4 than minute 1)
        p.driftPhase += dt * 0.03;
        const drift = Math.sin(t * 0.018 + p.driftPhase) * 3.5; // cents-ish
        p.oscA.detune.setTargetAtTime(drift, ac.currentTime, 1.5);
        p.oscB.detune.setTargetAtTime(4 - drift, ac.currentTime, 1.5);
      }

      drawCompass(ctx, canvas, dpr, heading, presences, idle, t);
      rafId = requestAnimationFrame(drawFrame);
    }
    rafId = requestAnimationFrame(drawFrame);

    // ---- Input: device orientation ----
    function onOrient(e: DeviceOrientationEvent) {
      if (e.alpha == null) return;
      // alpha: compass heading 0..360. Map to radians; invert so turning
      // your body right brings right-side presences forward.
      headingRef.current = (-e.alpha * Math.PI) / 180;
      lastInputRef.current = performance.now();
    }
    window.addEventListener("deviceorientation", onOrient);

    // ---- Input: pointer drag fallback ----
    function onDown(e: PointerEvent) {
      dragRef.current.active = true;
      dragRef.current.lastX = e.clientX;
      lastInputRef.current = performance.now();
    }
    function onMove(e: PointerEvent) {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.lastX;
      dragRef.current.lastX = e.clientX;
      headingRef.current += dx * 0.006;
      lastInputRef.current = performance.now();
    }
    function onUp() {
      dragRef.current.active = false;
    }
    const c = canvas;
    c.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("deviceorientation", onOrient);
      c.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      try {
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 0.4);
      } catch {
        /* noop */
      }
      setTimeout(() => {
        void ac.close().catch(() => {});
      }, 500);
    };
  }, [started]);

  // ---- Start handler: must create/resume AudioContext inside gesture ----
  async function handleEnter() {
    setErr(null);
    // Request orientation permission (iOS 13+) inside the gesture.
    let resolvedMode: Mode = "drag";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DOE = window.DeviceOrientationEvent as any;
      if (DOE && typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res === "granted") resolvedMode = "orientation";
        else {
          setErr("Motion access was declined — drag the screen to turn instead.");
          resolvedMode = "drag";
        }
      } else if (typeof window.DeviceOrientationEvent !== "undefined") {
        // Non-iOS: orientation may fire without a prompt (real devices only).
        resolvedMode = "orientation";
      }
    } catch {
      setErr("Could not request motion access — drag the screen to turn instead.");
      resolvedMode = "drag";
    }
    setMode(resolvedMode);
    setStarted(true);
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* full-viewport compass canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-hidden="true"
      />

      {!started && (
        <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-violet-300">
            626 · empty room
          </p>
          <h1 className="mt-5 text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
            An empty room, in the dark, with company you can only hear.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Close your eyes. Several unseen presences drift around you in 3D space,
            each a soft, sustained voice. Turn to face one and it opens up and sings;
            the others recede. There is almost nothing to see — the payoff is in your
            headphones.
          </p>
          <button
            onClick={handleEnter}
            className="mt-8 min-h-[44px] rounded-full bg-violet-500/20 px-6 py-2.5 font-mono text-base text-violet-300 ring-1 ring-violet-300/40 transition hover:bg-violet-500/30"
          >
            Enter the dark — put on headphones
          </button>
          <p className="mt-4 font-mono text-sm text-muted-foreground">
            Headphones strongly recommended. On a phone, hold it up and turn your body.
          </p>
        </div>
      )}

      {started && (
        <>
          {/* minimal heads-up text, kept faint so the dark dominates */}
          <div className="pointer-events-none absolute left-0 right-0 top-6 z-10 text-center">
            <p className="font-mono text-sm tracking-[0.25em] text-muted-foreground">
              {mode === "orientation"
                ? "TURN YOUR BODY TO FACE A PRESENCE"
                : "DRAG TO TURN · FACE A PRESENCE"}
            </p>
            {!hrtf && (
              <p className="mt-2 font-mono text-sm text-violet-300/95">
                HRTF binaural unavailable — using stereo panning fallback.
              </p>
            )}
          </div>

          {err && (
            <div className="absolute left-0 right-0 top-20 z-10 text-center">
              <p className="mx-auto max-w-md px-6 font-mono text-base text-violet-300">
                {err}
              </p>
            </div>
          )}
        </>
      )}

      {/* design notes corner */}
      <div className="absolute bottom-4 right-4 z-20 max-w-sm text-right">
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] rounded-md px-4 py-2.5 font-mono text-sm text-muted-foreground transition hover:text-foreground"
        >
          {showNotes ? "hide notes" : "read the design notes"}
        </button>
        {showNotes && (
          <div className="mt-2 rounded-lg bg-black/70 p-4 text-left ring-1 ring-border backdrop-blur">
            <p className="text-base leading-relaxed text-muted-foreground">
              Eyes-closed, audio-first binaural piece. Each presence is panned with a
              Web Audio <span className="text-violet-300">HRTF</span> PannerNode; the
              listener orientation rotates as you turn. Facing a presence brightens and
              swells it. After ~2.5s of stillness the heading auto-rotates so the room
              sweeps past on its own.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              In the lineage of Janet Cardiff (<em>The Forty Part Motet</em>,{" "}
              <em>Her Long Black Hair</em>) and Pauline Oliveros (<em>Deep Listening</em>).
            </p>
            <a
              href="/dream/626-empty-room/README.md"
              className="mt-3 inline-block font-mono text-sm text-violet-300 underline decoration-violet-300/40 underline-offset-4"
            >
              full README →
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

// --------------------------------------------------------------------------
// Austere compass / radar. Near-black, one accent color. An AID, not the show.
// --------------------------------------------------------------------------
function drawCompass(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  dpr: number,
  heading: number,
  presences: Presence[],
  idle: boolean,
  t: number
) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = W / dpr;
  const h = H / dpr;

  // near-black wash with a faint vignette
  ctx.fillStyle = "#040406";
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.32;

  // faint compass ring
  ctx.strokeStyle = "rgba(167,139,250,0.16)"; // violet-400, very dim
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  // inner radius rings
  ctx.strokeStyle = "rgba(167,139,250,0.07)";
  for (const f of [0.66, 0.33]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
    ctx.stroke();
  }

  // forward indicator (always points "up" = where you face)
  ctx.strokeStyle = "rgba(167,139,250,0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - R - 10);
  ctx.stroke();
  // tiny forward chevron
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy - R - 4);
  ctx.lineTo(cx, cy - R - 12);
  ctx.lineTo(cx + 5, cy - R - 4);
  ctx.stroke();

  // presences plotted relative to heading (forward = up = -Y on screen)
  for (const p of presences) {
    let rel = p.curAz - heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    // distance -> radial position (clamped)
    const dn = Math.min(1, p.curRad / 6);
    const rr = R * (0.18 + dn * 0.82);
    const px = cx + Math.sin(rel) * rr;
    const py = cy - Math.cos(rel) * rr;

    const lit = p.faced; // 0..1
    const size = 2.5 + lit * 6;

    // halo when faced
    if (lit > 0.05) {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, 18 + lit * 22);
      grad.addColorStop(0, `rgba(196,181,253,${0.28 * lit})`);
      grad.addColorStop(1, "rgba(196,181,253,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, 18 + lit * 22, 0, Math.PI * 2);
      ctx.fill();
    }

    // dot — dim when distant/unfaced, bright accent when faced
    const a = 0.22 + lit * 0.7;
    ctx.fillStyle = `rgba(196,181,253,${a})`;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // center: the listener
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // idle hint (faint, only when auto-rotating)
  if (idle) {
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.5);
    ctx.globalAlpha = 0.4 + pulse * 0.4;
    ctx.fillText("· listening · turn to take the helm ·", cx, cy + R + 28);
    ctx.globalAlpha = 1;
  }
}
