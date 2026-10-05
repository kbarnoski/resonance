"use client";

/* ── 18960 · Surgeline ────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if your body's MOTION DYNAMICS composed the energy ARC of
 *  one of Karel's real piano recordings over minutes — a journey-engine where
 *  sustained broad movement BUILDS the piece and stillness lets it recede?
 *
 *  Not another instrument. The headline is the JOURNEY: a single tension
 *  envelope, earned slowly. The camera reads the seated upper body as VELOCITY
 *  (not position); that velocity is split into a SLOW band (the long-form build)
 *  and a FAST band (momentary articulation). Slow energy fills a leaky
 *  integrator and drains gently, so minute-3 is a materially bigger space than
 *  minute-0. See engine.ts for the arc math and README.md for the full write-up.
 *
 *  Anchor (inverted): Dyna2Music, "Where the Body Keeps the Beat…"
 *  (arXiv:2610.00726). There body-velocity slow/fast bands supervise GENERATED
 *  music dynamics; under the lab's absolute rule we never generate — the same
 *  decomposition instead conducts a TRANSFORMATION of Karel's real recording.
 *
 *  OUTPUT: a raw WebGL2 fragment field (stormglass palette), Canvas2D fallback.
 *  AUDIO : one real buffer, vertically layered, all through the safe master.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { README_TEXT } from "./readme-text";
import {
  makeArcState,
  stepArc,
  arcPhase,
  demoEnergy,
  pointerEnergy,
  createGLRenderer,
  createCanvas2DRenderer,
  type ArcState,
  type FieldRenderer,
} from "./engine";

const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Welcome Home")?.id ?? REAL_TRACKS[0].id;

type Driver = "demo" | "pointer" | "live";

interface Engine {
  startAudio: () => void;
  stopAudio: () => void;
  startCam: () => Promise<void>;
  setTrack: (id: string) => void;
}

interface Readout {
  driver: Driver;
  lost: boolean;
  arc: number;
  phase: string;
  elapsed: string;
  title: string;
}

function formatElapsed(sec: number): string {
  if (sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SurgelinePage() {
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const { immersive, toggle } = useImmersive();

  const [soundOn, setSoundOn] = useState(false);
  const [camState, setCamState] = useState<"idle" | "starting" | "on" | "failed">(
    "idle",
  );
  const [webglOk, setWebglOk] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [readout, setReadout] = useState<Readout>({
    driver: "demo",
    lost: false,
    arc: 0.08,
    phase: "stillness",
    elapsed: "0:00",
    title: REAL_TRACKS.find((t) => t.id === DEFAULT_TRACK)?.title ?? "Welcome Home",
  });

  // ── one engine, built once; React buttons reach it via engineRef ────────────
  useEffect(() => {
    const stage = stageRef.current;
    const glCanvas = glCanvasRef.current;
    const fbCanvas = fbCanvasRef.current;
    if (!stage || !glCanvas || !fbCanvas) return;

    // ── renderer (raw WebGL2, Canvas2D fallback) ──────────────────────────────
    let renderer: FieldRenderer | null = createGLRenderer(glCanvas);
    if (!renderer) {
      renderer = createCanvas2DRenderer(fbCanvas);
      glCanvas.style.display = "none";
      fbCanvas.style.display = "block";
      setWebglOk(false);
    }

    const swapToFallback = () => {
      if (!renderer || renderer.kind === "2d") return;
      try {
        renderer.dispose();
      } catch {
        /* ignore */
      }
      renderer = createCanvas2DRenderer(fbCanvas);
      glCanvas.style.display = "none";
      fbCanvas.style.display = "block";
      setWebglOk(false);
      const r = stage.getBoundingClientRect();
      renderer.resize(r.width, r.height);
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      swapToFallback();
    };
    glCanvas.addEventListener("webglcontextlost", onContextLost);

    // size to the stage
    const ro = new ResizeObserver(() => {
      const r = stage.getBoundingClientRect();
      if (renderer) renderer.resize(r.width, r.height);
    });
    ro.observe(stage);
    {
      const r = stage.getBoundingClientRect();
      renderer.resize(r.width, r.height);
    }

    // ── arc / motion state ────────────────────────────────────────────────────
    const arcState: ArcState = makeArcState(0.08);
    let spark = 0; // visual articulation envelope (decays)
    let playStart = 0; // performance.now()/1000 when audio began

    // ── audio ─────────────────────────────────────────────────────────────────
    let ctx: AudioContext | null = null;
    let master: SafeMaster | null = null;
    let buffer: AudioBuffer | null = null;
    let sources: AudioBufferSourceNode[] = [];
    let baseLP: BiquadFilterNode | null = null;
    let baseGain: GainNode | null = null;
    let wetGain: GainNode | null = null;
    let subGain: GainNode | null = null;
    let shimGain: GainNode | null = null;
    let accentBus: GainNode | null = null;
    let specBuf: Uint8Array<ArrayBuffer> | null = null;
    let wantTrack = DEFAULT_TRACK;
    let loadingTrack = false;
    let liveGrains = 0;
    let lastArticAt = 0;
    let rms = 0;

    function buildVoices() {
      if (!ctx || !master || !buffer) return;
      // dry base voice — a lowpass that opens as the arc rises
      baseLP = ctx.createBiquadFilter();
      baseLP.type = "lowpass";
      baseLP.frequency.value = 700;
      baseLP.Q.value = 0.6;
      baseGain = ctx.createGain();
      baseGain.gain.value = 0.55;
      baseLP.connect(baseGain);
      baseGain.connect(master.input);

      // reverb-wet voice — convolver IR is a windowed, decaying slice of HIS buffer
      const conv = ctx.createConvolver();
      conv.buffer = impulseFromBuffer(ctx, buffer);
      wetGain = ctx.createGain();
      wetGain.gain.value = 0.0;
      baseLP.connect(conv); // send the dry base into the hall
      conv.connect(wetGain);
      wetGain.connect(master.input);

      // sub voice — half speed, low-passed, weight through the middle of the arc
      const subLP = ctx.createBiquadFilter();
      subLP.type = "lowpass";
      subLP.frequency.value = 420;
      subGain = ctx.createGain();
      subGain.gain.value = 0.0;
      subLP.connect(subGain);
      subGain.connect(master.input);

      // shimmer voice — double speed + high-shelf lift, at the crest
      const shimShelf = ctx.createBiquadFilter();
      shimShelf.type = "highshelf";
      shimShelf.frequency.value = 2600;
      shimShelf.gain.value = 6;
      shimGain = ctx.createGain();
      shimGain.gain.value = 0.0;
      shimShelf.connect(shimGain);
      shimGain.connect(master.input);

      // accent bus — short grain taps on fast articulation
      accentBus = ctx.createGain();
      accentBus.gain.value = 0.9;
      accentBus.connect(master.input);

      const mk = (rate: number, dest: AudioNode, offset: number) => {
        const src = ctx!.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.playbackRate.value = rate;
        src.connect(dest);
        try {
          src.start(0, Math.min(offset, buffer!.duration * 0.5));
        } catch {
          /* ignore */
        }
        sources.push(src);
        return src;
      };
      mk(1.0, baseLP, 0); // base + wet both fed from baseLP
      mk(0.5, subLP, buffer.duration * 0.33);
      mk(2.0, shimShelf, buffer.duration * 0.17);
    }

    function impulseFromBuffer(c: AudioContext, buf: AudioBuffer): AudioBuffer {
      const sr = buf.sampleRate;
      const len = Math.min(Math.floor(sr * 1.8), buf.length);
      const start = Math.min(buf.length - len, Math.floor(buf.length * 0.25));
      const chN = Math.min(2, buf.numberOfChannels);
      const ir = c.createBuffer(chN, len, sr);
      const fadeIn = Math.max(1, Math.floor(sr * 0.01));
      for (let ch = 0; ch < chN; ch++) {
        const srcData = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
        const dst = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const s = srcData[start + i] ?? 0;
          const decay = Math.exp((-3.0 * i) / len);
          const env = i < fadeIn ? (i / fadeIn) * decay : decay;
          dst[i] = s * env;
        }
      }
      return ir;
    }

    function fireGrain(intensity: number) {
      if (!ctx || !accentBus || !buffer || liveGrains > 10) return;
      const now = ctx.currentTime;
      const dur = 0.16;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = Math.random() < 0.5 ? 1.0 : 2.0;
      const g = ctx.createGain();
      const amp = 0.25 + 0.35 * Math.min(1, intensity);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.02);
      g.gain.linearRampToValueAtTime(0, now + dur);
      src.connect(g);
      g.connect(accentBus);
      liveGrains++;
      src.onended = () => {
        liveGrains--;
        try {
          g.disconnect();
          src.disconnect();
        } catch {
          /* ignore */
        }
      };
      const off = Math.max(0, Math.random() * Math.max(0, buffer.duration - dur - 0.05));
      try {
        src.start(now, off, dur + 0.02);
        src.stop(now + dur + 0.02);
      } catch {
        liveGrains--;
      }
    }

    function applyAudioForArc(arc: number) {
      if (!ctx) return;
      const now = ctx.currentTime;
      const tc = 0.3; // ~1 s settle
      // base lowpass opens with the arc (exp sweep 700 Hz -> 13 kHz) + spark boost
      const open = Math.pow(13000 / 700, Math.min(1, arc));
      const cutoff = 700 * open * (1 + spark * 1.1);
      baseLP?.frequency.setTargetAtTime(Math.min(14000, cutoff), now, 0.12);
      // vertical layering — each gain is a smoothstep of the arc
      wetGain?.gain.setTargetAtTime(smooth(0.1, 0.65, arc) * 0.55, now, tc);
      subGain?.gain.setTargetAtTime(smooth(0.22, 0.5, arc) * 0.5, now, tc);
      shimGain?.gain.setTargetAtTime(smooth(0.6, 0.95, arc) * 0.4, now, tc);
    }

    function smooth(e0: number, e1: number, x: number): number {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    }

    async function loadInto(c: AudioContext, id: string) {
      loadingTrack = true;
      try {
        const loaded = await loadRealTrackBuffer(c, id);
        buffer = loaded.buffer;
        setReadout((r) => ({ ...r, title: loaded.title }));
        setNotice(null);
        // (re)build voices for the freshly-decoded buffer
        stopSources();
        buildVoices();
        if (playStart === 0) playStart = performance.now() / 1000;
      } catch {
        buffer = null;
        setNotice(
          "That recording could not be loaded — the field still breathes with your motion, silently.",
        );
      } finally {
        loadingTrack = false;
      }
    }

    function stopSources() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
        try {
          s.disconnect();
        } catch {
          /* ignore */
        }
      }
      sources = [];
    }

    function startAudio() {
      if (ctx) {
        void ctx.resume();
        return;
      }
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AC();
        void ctx.resume();
        master = createSafeMaster(ctx);
        specBuf = new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount));
        void loadInto(ctx, wantTrack);
      } catch {
        ctx = null;
        master = null;
        setNotice("Web Audio is unavailable here — the field still breathes with your motion.");
      }
    }

    function stopAudio() {
      stopSources();
      const dead = ctx;
      ctx = null;
      master = null;
      buffer = null;
      baseLP = baseGain = wetGain = subGain = shimGain = accentBus = null;
      specBuf = null;
      playStart = 0;
      if (dead && dead.state !== "closed") {
        window.setTimeout(() => {
          if (dead.state !== "closed") void dead.close();
        }, 250);
      }
    }

    // ── pose / camera ───────────────────────────────────────────────────────────
    let landmarker: PoseLandmarkerInst | null = null;
    let stream: MediaStream | null = null;
    const prev: Record<string, { x: number; y: number } | null> = {
      ls: null,
      rs: null,
      lw: null,
      rw: null,
    };

    async function startCam() {
      setCamState("starting");
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setCamState("failed");
        setNotice("No camera here — the autonomous demo keeps composing the arc.");
        return;
      }
      try {
        stream = await startCamera(video);
      } catch {
        setCamState("failed");
        setNotice("Camera blocked or off — the autonomous demo keeps composing the arc.");
        return;
      }
      try {
        landmarker = await createPoseTracker(1);
        setCamState("on");
        setNotice(null);
      } catch {
        setCamState("failed");
        setNotice("Body-tracking model couldn't load (offline?) — the demo keeps composing.");
      }
    }

    function setTrack(id: string) {
      wantTrack = id;
      if (ctx && !loadingTrack) void loadInto(ctx, id);
    }

    engineRef.current = { startAudio, stopAudio, startCam, setTrack };

    // ── read the live body → instantaneous motion ENERGY (velocity) ─────────────
    // Gate ONLY on shoulders (+ wrists we actually read); NEVER on hips/legs.
    function liveEnergy(nowMs: number, dt: number): { inst: number; present: boolean } {
      const video = videoRef.current;
      if (!landmarker || !stream || !video || video.readyState < 2) {
        return { inst: 0, present: false };
      }
      let res: { landmarks?: Landmark[][] } | undefined;
      try {
        res = landmarker.detectForVideo(video, nowMs);
      } catch {
        return { inst: 0, present: false };
      }
      const lm = res?.landmarks?.[0];
      if (!lm) {
        prev.ls = prev.rs = prev.lw = prev.rw = null;
        return { inst: 0, present: false };
      }
      const vis = (p?: Landmark) => (p?.visibility ?? 0) > 0.5;
      const ls = lm[POSE_LM.leftShoulder];
      const rs = lm[POSE_LM.rightShoulder];
      const lw = lm[POSE_LM.leftWrist];
      const rw = lm[POSE_LM.rightWrist];
      // presence: BOTH shoulders (the torso reference is the shoulder midpoint)
      if (!vis(ls) || !vis(rs)) {
        prev.ls = prev.rs = prev.lw = prev.rw = null;
        return { inst: 0, present: false };
      }
      // mirror x for a selfie view; sum per-landmark velocity for the tracked points
      let sum = 0;
      const track = (
        key: keyof typeof prev,
        p: Landmark | undefined,
        gate: boolean,
      ) => {
        if (!gate || !p) {
          prev[key] = null;
          return;
        }
        const cur = { x: 1 - p.x, y: p.y };
        const was = prev[key];
        if (was) {
          const dx = cur.x - was.x;
          const dy = cur.y - was.y;
          sum += Math.hypot(dx, dy) / dt;
        }
        prev[key] = cur;
      };
      track("ls", ls, true);
      track("rs", rs, true);
      track("lw", lw, vis(lw)); // wrists contribute only while visible
      track("rw", rw, vis(rw));
      return { inst: sum, present: true };
    }

    // ── pointer fallback (inject motion energy) ─────────────────────────────────
    let pointerHeld = false;
    let pointerLast: { x: number; y: number; t: number } | null = null;
    let pointerSpeed = 0;
    let pointerActiveUntil = 0;

    const onPointerDown = (e: PointerEvent) => {
      pointerHeld = true;
      pointerActiveUntil = performance.now() + 1200;
      pointerLast = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onPointerUp = () => {
      pointerHeld = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      pointerActiveUntil = now + 1200;
      if (pointerLast) {
        const diag = Math.hypot(window.innerWidth, window.innerHeight) || 1;
        const d = Math.hypot(e.clientX - pointerLast.x, e.clientY - pointerLast.y) / diag;
        const dts = Math.max(0.001, (now - pointerLast.t) / 1000);
        pointerSpeed = d / dts;
      }
      pointerLast = { x: e.clientX, y: e.clientY, t: now };
    };
    stage.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    stage.addEventListener("pointermove", onPointerMove);

    // ── main loop ───────────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let lastReadout = 0;

    function frame(nowMs: number) {
      raf = requestAnimationFrame(frame);
      const dt = Math.max(0.001, Math.min(0.1, (nowMs - last) / 1000));
      last = nowMs;
      const nowS = nowMs / 1000;

      // 1. pick the active motion source → instantaneous energy
      let driver: Driver;
      let present = true;
      let inst = 0;
      const camOn = camState === "on";
      const pointerActive = nowMs < pointerActiveUntil;
      if (camOn) {
        driver = "live";
        const r = liveEnergy(nowMs, dt);
        present = r.present;
        inst = present ? r.inst : 0; // lost → no injection, the arc just leaks
      } else if (pointerActive) {
        driver = "pointer";
        inst = pointerEnergy(pointerHeld, pointerSpeed);
        pointerSpeed *= 0.86; // decay the move impulse
      } else {
        driver = "demo";
        inst = demoEnergy(nowS);
      }

      // 2. advance the band decomposition + leaky-integrator arc
      stepArc(arcState, inst, dt);

      // 3. fast-band articulation → grain tap + visual spark
      spark += (0 - spark) * Math.min(1, dt * 2.2); // decay
      const articReady = nowMs - lastArticAt > 110;
      if (arcState.fast > 0.55 && articReady) {
        lastArticAt = nowMs;
        spark = Math.min(1, spark + Math.min(1, (arcState.fast - 0.55) * 1.6));
        if (ctx && buffer) fireGrain(arcState.fast);
      }

      // 4. read audio level + drive voices from the arc
      if (master && specBuf) {
        master.analyser.getByteTimeDomainData(specBuf);
        let acc = 0;
        for (let i = 0; i < specBuf.length; i++) {
          const v = (specBuf[i] - 128) / 128;
          acc += v * v;
        }
        const r = Math.sqrt(acc / specBuf.length);
        rms += (r - rms) * Math.min(1, dt * 6);
        applyAudioForArc(arcState.arc);
      }

      // 5. render the field
      if (renderer) renderer.draw(arcState.arc, rms, spark, nowS);

      // 6. throttled readout
      if (nowMs - lastReadout > 180) {
        lastReadout = nowMs;
        const elapsed = playStart > 0 ? nowS - playStart : 0;
        setReadout((prevR) => {
          const next: Readout = {
            driver,
            lost: driver === "live" && !present,
            arc: arcState.arc,
            phase: arcPhase(arcState.arc),
            elapsed: formatElapsed(elapsed),
            title: prevR.title,
          };
          return next;
        });
      }
    }
    raf = requestAnimationFrame(frame);

    // ── teardown ─────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      glCanvas.removeEventListener("webglcontextlost", onContextLost);
      stage.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      stage.removeEventListener("pointermove", onPointerMove);
      stopAudio();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (landmarker) {
        try {
          landmarker.close();
        } catch {
          /* ignore */
        }
      }
      if (renderer) renderer.dispose();
      engineRef.current = null;
    };
    // built once; buttons drive it through engineRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── button handlers ────────────────────────────────────────────────────────
  const handleSound = useCallback(() => {
    if (soundOn) {
      engineRef.current?.stopAudio();
      setSoundOn(false);
    } else {
      engineRef.current?.startAudio();
      setSoundOn(true);
    }
  }, [soundOn]);

  const handleCam = useCallback(() => {
    void engineRef.current?.startCam();
  }, []);

  const handleTrack = useCallback((id: string) => {
    setTrackId(id);
    engineRef.current?.setTrack(id);
  }, []);

  // ── status line ──────────────────────────────────────────────────────────────
  const arcPct = Math.round(readout.arc * 100);
  const statusEl =
    readout.driver === "live" ? (
      readout.lost ? (
        <span className="text-destructive">
          tracking · lost — sit back, shoulders in frame
        </span>
      ) : (
        <span className="text-foreground">tracking · live</span>
      )
    ) : readout.driver === "pointer" ? (
      <span className="text-muted-foreground/80">pointer · motion</span>
    ) : (
      <span className="text-muted-foreground/70">demo · autonomous</span>
    );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* hidden feed for MediaPipe only */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* full-bleed field (WebGL2 + Canvas2D fallback stacked) */}
      <div ref={stageRef} className="absolute inset-0">
        <canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full" />
        <canvas
          ref={fbCanvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ display: "none" }}
        />
      </div>

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Surgeline"
        description="Your body's motion dynamics compose the energy arc of one of Karel's real piano recordings over minutes. Sustained broad movement builds the piece; stillness lets it recede; quick motion sparks momentary articulation."
        howTo={[
          "Press play and let one of Karel's takes begin.",
          "Move your upper body — broad, sustained motion builds the piece.",
          "Hold still and it recedes; quick motion sparks articulation.",
          "No camera? Hold or move the pointer to inject motion; or watch the demo.",
          "Press f for fullscreen, i for info.",
        ]}
      />

      {/* tracking + arc readout — always visible */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.18em]">
        {statusEl}
        <span className="text-muted-foreground/80">
          arc {arcPct}% · {readout.phase} · {readout.elapsed}
        </span>
      </div>

      {!immersive && (
        <>
          {/* back link */}
          <div className="pointer-events-none absolute right-4 top-4 z-30">
            <Link
              href="/dream"
              className="pointer-events-auto text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              ← dream lab
            </Link>
          </div>

          {/* title + controls strip, bottom-anchored light overlay */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-5 sm:p-7">
            <div className="max-w-xl">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Surgeline
              </h1>
              <p className="mt-1.5 max-w-lg text-base leading-relaxed text-muted-foreground">
                A journey engine: your sustained upper-body motion composes the
                energy arc of Karel&apos;s recording over minutes — the field
                builds toward a jade crest and recedes when you rest.
              </p>
            </div>

            {notice && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-destructive">
                {notice}
              </p>
            )}

            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSound}
                className={
                  soundOn
                    ? "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    : "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                }
              >
                {soundOn ? "Stop" : "Begin the journey"}
              </button>
              {camState !== "on" && (
                <button
                  type="button"
                  onClick={handleCam}
                  disabled={camState === "starting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  {camState === "starting"
                    ? "Enabling camera…"
                    : camState === "failed"
                      ? "Retry camera"
                      : "Enable camera — move to build"}
                </button>
              )}

              <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                take
                <select
                  value={trackId}
                  onChange={(e) => handleTrack(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                >
                  {COLLECTIONS.map((c) => (
                    <optgroup key={c.name} label={c.name}>
                      {c.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>

            {!webglOk && (
              <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                WebGL2 is unavailable here — running the Canvas2D field with the
                same palette and arc.
              </p>
            )}
          </div>

          {/* design-notes modal */}
          {showNotes && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
              onClick={() => setShowNotes(false)}
            >
              <div
                className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    Surgeline — design notes
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowNotes(false)}
                    aria-label="Close"
                    className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
                  >
                    close
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {README_TEXT.split("\n\n").map((para, i) => (
                    <p
                      key={i}
                      className="text-base leading-relaxed text-muted-foreground"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
