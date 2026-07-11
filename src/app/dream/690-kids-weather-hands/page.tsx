"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeWeatherEngine, type WeatherEngine } from "./weather-engine";
import { drawSky, makeSky } from "./sky";

// iOS-prefixed DeviceOrientationEvent.requestPermission typing.
type OrientationPermissionCtor = {
  requestPermission?: () => Promise<"granted" | "denied">;
};
type MotionPermissionCtor = {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type InputMode = "motion" | "mic" | "drift";

export default function Page() {
  const [running, setRunning] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("drift");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // visual energy (mirror of engine smoothed energy) for the on-screen word
  const [weatherWord, setWeatherWord] = useState("sunny");

  // audio refs
  const acRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<WeatherEngine | null>(null);

  // input refs
  const energyRef = useRef(0); // raw incoming energy 0..1 (pre-engine-smoothing)
  const lastTiltRef = useRef<{ b: number; g: number } | null>(null);
  const motionMagRef = useRef(0); // recent device-motion magnitude
  const micRef = useRef<{
    stream: MediaStream;
    analyser: AnalyserNode;
    data: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const lastInteractRef = useRef(Date.now());
  const autoDemoRef = useRef(false);

  // canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const skyRef = useRef(makeSky());
  const lastFrameRef = useRef(performance.now());

  // ---- visual loop: runs ALWAYS (even before audio unlock) so a glance
  // at the page is alive. Reads energyRef + idle auto-demo. ------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let demoPhase = 0;

    const frame = (tNow: number) => {
      const dt = Math.min(0.05, (tNow - lastFrameRef.current) / 1000);
      lastFrameRef.current = tNow;

      // idle auto-demo: ~2.5s after last interaction, gently cycle weather
      const idle = Date.now() - lastInteractRef.current > 2500;
      autoDemoRef.current = idle;
      let energy: number;
      if (idle) {
        demoPhase += dt * 0.35;
        // smooth sun->cloud->sun, never fully extreme so it stays gentle
        energy = (Math.sin(demoPhase) * 0.5 + 0.5) * 0.85 + 0.05;
      } else {
        energy = energyRef.current;
      }

      // feed engine if running
      const eng = engineRef.current;
      if (eng) eng.setEnergy(energy);
      const drawEnergy = eng ? eng.getEnergy() : energy;

      drawSky(
        ctx,
        window.innerWidth,
        window.innerHeight,
        drawEnergy,
        skyRef.current,
        dt,
      );

      const word =
        drawEnergy < 0.3 ? "sunny" : drawEnergy < 0.62 ? "cloudy" : "stormy";
      setWeatherWord((prev) => (prev === word ? prev : word));

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ---- device orientation (tilt) ----
  const onOrient = useCallback((ev: DeviceOrientationEvent) => {
    const b = ev.beta ?? 0; // front-back tilt
    const g = ev.gamma ?? 0; // left-right tilt
    const last = lastTiltRef.current;
    if (last) {
      const d = Math.abs(b - last.b) + Math.abs(g - last.g);
      // accumulate tilt-change as movement energy (decays in the loop below)
      motionMagRef.current = Math.min(1, motionMagRef.current * 0.85 + d * 0.04);
    }
    lastTiltRef.current = { b, g };
    lastInteractRef.current = Date.now();
  }, []);

  // ---- device motion (acceleration) ----
  const onMotion = useCallback((ev: DeviceMotionEvent) => {
    const a = ev.accelerationIncludingGravity;
    if (!a) return;
    // remove ~gravity baseline by looking at deviation magnitude
    const mag = Math.abs(a.x ?? 0) + Math.abs(a.y ?? 0) + Math.abs(a.z ?? 0);
    const lively = Math.abs(mag - 9.8);
    motionMagRef.current = Math.min(
      1,
      motionMagRef.current * 0.9 + lively * 0.03,
    );
    lastInteractRef.current = Date.now();
  }, []);

  // ---- energy aggregation loop (combines motion + mic) ----
  useEffect(() => {
    if (!running) return;
    let id = 0;
    const tick = () => {
      // decay motion energy so stillness returns to sunny
      motionMagRef.current *= 0.96;

      let mic = 0;
      const m = micRef.current;
      if (m) {
        m.analyser.getByteTimeDomainData(m.data);
        let sum = 0;
        for (let i = 0; i < m.data.length; i++) {
          const v = (m.data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / m.data.length);
        // mic RMS is small; gate out room hiss, scale up loud play/humming
        mic = Math.max(0, (rms - 0.02) * 6);
        mic = Math.min(1, mic);
        if (mic > 0.15) lastInteractRef.current = Date.now();
      }

      // combine: movement + voice are ONE energy signal (max-blend so either
      // can drive the storm; both together pushes harder)
      const combined = Math.min(
        1,
        Math.max(motionMagRef.current, mic) * 0.85 +
          Math.min(motionMagRef.current, mic) * 0.4,
      );
      energyRef.current = combined;
      id = window.setTimeout(tick, 40);
    };
    tick();
    return () => window.clearTimeout(id);
  }, [running]);

  // ---- begin (single user gesture: unlock audio + request sensors + mic) ----
  const begin = useCallback(async () => {
    if (running) return;
    lastInteractRef.current = Date.now();

    // 1) AudioContext (inside the gesture)
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new Ctor();
    await ac.resume();
    acRef.current = ac;

    // master chain: limiter/compressor + low-capped master gain (ear-safe)
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 18;
    comp.ratio.value = 12;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;
    const master = ac.createGain();
    master.gain.value = 0.0001;
    comp.connect(master);
    master.connect(ac.destination);
    // gentle master fade-in
    master.gain.setValueAtTime(0.0001, ac.currentTime);
    master.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 1.5);

    const engine = makeWeatherEngine(ac, comp);
    engine.start();
    engineRef.current = engine;

    setRunning(true);

    // 2) Sensors — try motion/orientation, fall back to mic, then drift.
    let gotMotion = false;
    try {
      const orientCtor =
        DeviceOrientationEvent as unknown as OrientationPermissionCtor;
      const motionCtor =
        DeviceMotionEvent as unknown as MotionPermissionCtor;
      let orientOk = true;
      let motionOk = true;
      if (typeof orientCtor.requestPermission === "function") {
        orientOk = (await orientCtor.requestPermission()) === "granted";
      }
      if (typeof motionCtor.requestPermission === "function") {
        motionOk = (await motionCtor.requestPermission()) === "granted";
      }
      if (orientOk && typeof DeviceOrientationEvent !== "undefined") {
        window.addEventListener("deviceorientation", onOrient);
        gotMotion = true;
      }
      if (motionOk && typeof DeviceMotionEvent !== "undefined") {
        window.addEventListener("devicemotion", onMotion);
        gotMotion = true;
      }
    } catch {
      gotMotion = false;
    }

    // 3) Microphone (movement OR voice both count as energy)
    let gotMic = false;
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        const src = ac.createMediaStreamSource(stream);
        src.connect(analyser);
        // NOTE: analyser is NOT connected to destination — no feedback.
        micRef.current = {
          stream,
          analyser,
          data: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
        };
        gotMic = true;
      }
    } catch {
      gotMic = false;
    }

    if (gotMotion) {
      setInputMode("motion");
      setNotice(
        gotMic
          ? null
          : "Move me to change the weather! (Tip me, sway, wave me around.)",
      );
    } else if (gotMic) {
      setInputMode("mic");
      setNotice("Make noise to change the weather! Quiet = sun, loud = storm.");
    } else {
      setInputMode("drift");
      setNotice(
        "No sensors available — the sky will drift on its own. Try a phone or tablet for the full body-play.",
      );
    }
  }, [running, onOrient, onMotion]);

  // ---- teardown on unmount ----
  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("devicemotion", onMotion);
      const m = micRef.current;
      if (m) {
        m.stream.getTracks().forEach((t) => t.stop());
        micRef.current = null;
      }
      engineRef.current?.dispose();
      engineRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        ac.close().catch(() => {});
      }
      acRef.current = null;
    };
  }, [onOrient, onMotion]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#221c2e] text-foreground">
      {/* full-bleed breathing sky — the whole "screen" */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* tiny weather word — readable but unobtrusive; no reading needed to play */}
      <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
        <span className="rounded-full bg-black/25 px-4 py-2 text-xl font-semibold text-foreground backdrop-blur-sm">
          {running ? weatherWord : "weather in your hands"}
        </span>
      </div>

      {/* Begin overlay (single gesture) */}
      {!running && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="max-w-md text-2xl font-semibold text-foreground">
            Weather in Your Hands
          </h1>
          <p className="max-w-sm text-base text-muted-foreground">
            Hold me like a tray. Be still for sunshine. Move and play to bring
            the storm. Listen with your whole body.
          </p>
          <button
            type="button"
            onClick={begin}
            className="min-h-[64px] min-w-[64px] rounded-full bg-violet-300/90 px-10 py-4 text-xl font-semibold text-[#221c2e] shadow-lg transition-transform active:scale-95"
          >
            Begin
          </button>
          <p className="max-w-xs text-base text-muted-foreground">
            Sound and motion. Best on a phone or tablet you can tip and wave.
          </p>
        </div>
      )}

      {/* running notice / sensor errors */}
      {running && notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-6">
          <p
            className={`max-w-md rounded-2xl bg-black/35 px-4 py-2.5 text-center text-base backdrop-blur-sm ${
              inputMode === "drift" ? "text-violet-300" : "text-muted-foreground"
            }`}
          >
            {notice}
          </p>
        </div>
      )}

      {/* design notes link/toggle (corner, small but >= /55) */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-3 right-3 z-30 rounded-full bg-black/40 px-4 py-2.5 text-base text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      >
        {showNotes ? "close" : "design notes"}
      </button>

      {/* back link (corner, large enough) */}
      <Link
        href="/dream"
        className="absolute left-3 top-3 z-30 flex min-h-[44px] items-center rounded-full bg-black/40 px-4 py-2.5 text-base text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      >
        ← back
      </Link>

      {/* design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-black/80 px-6 py-16 backdrop-blur-md">
          <div className="mx-auto max-w-xl space-y-4 text-base leading-relaxed text-foreground">
            <h2 className="text-2xl font-semibold text-foreground">Design notes</h2>
            <p>
              <span className="text-foreground">For kids (4+).</span> The screen
              is nearly empty on purpose — all the play is in your ears and your
              body. Hold the device like a tray. When you are calm and still,
              the music sits in a bright, sunny world. As you sway, rock, wave
              the device, or hum and shout, the harmony smoothly darkens toward
              a stormy minor — then glides back to sun the moment you settle.
            </p>
            <p>
              <span className="text-foreground">The harmonic trick.</span> Your
              movement and voice become one &ldquo;energy&rdquo; signal that
              continuously <em>morphs the musical mode</em>. The chord&rsquo;s
              third and sixth physically slide between a bright major / Lydian
              voicing and an Aeolian / Dorian minor voicing over a steady drone.
              This is a real harmonic event — a major&harr;minor mode flip — not
              a pentatonic &ldquo;no wrong notes&rdquo; trick. You are hearing
              the chord change its <em>feeling</em>, controlled by your body.
            </p>
            <p>
              <span className="text-foreground">Why this matters.</span> Music-
              cognition research finds that children&rsquo;s perception of a
              piece&rsquo;s expressive character is shaped by their own (and
              observed) body movement — the embodied basis of Reggio Emilia
              music pedagogy. The generative weather drift is inspired by Brian
              Eno&rsquo;s ambient systems. Together: embodied, expressive
              control of musical mode.
            </p>
            <p className="text-muted-foreground">
              Ear-safe: soft attacks, a compressor/limiter, and a low master
              cap — gentle enough near a sleeping sibling. No sensors? The sky
              and music drift on their own.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
