"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { makeMeltAudio, type MeltAudio } from "./audio";
import {
  getWebCodecs,
  type WcVideoDecoder,
  type WcVideoEncoder,
  type WcVideoFrame,
  type WebCodecsHandles,
} from "./webcodecs";

// ── Codec source resolution. Deliberately small so 16px macroblocks read as big
//    chunky slabs when we upscale to the viewport. Smaller source + fixed low
//    bitrate = the DCT blocks bloom on any motion, which is the whole instrument.
const SRC_W = 384;
const SRC_H = 216;

// Fixed encoder config. See README for why we DON'T mutate bitrate at runtime:
// VideoEncoder.configure() forces a keyframe (an instant heal), which fights the
// melt. Instead melt depth drives the amount of high-contrast MOTION we inject at
// a fixed, deliberately starved bitrate — the delta frames can't keep up and the
// blocks explode. Keyframes are only requested to HEAL when things are calm.
const ENCODER_BITRATE = 55_000;
const FRAMERATE = 30;
const FRAME_US = Math.round(1_000_000 / FRAMERATE);

// ── Deterministic PRNG (never Math.random / Date — the lab replays by seed+time).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Playable scale. Home row = a rising just-intonation major scale; top row is
//    the same an octave up. Every key is a synth voice AND a visual comet.
const JUST = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];
const ROOT_HZ = 174.61; // F3
const HOME = ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL"];
const TOP = ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"];

interface NoteDef {
  freq: number;
  hue: number; // iridescent violet-centred
  angle: number; // comet launch direction (pitch steers the melt)
  index: number;
}

function makeNoteMap(): Record<string, NoteDef> {
  const map: Record<string, NoteDef> = {};
  const build = (codes: string[], octaveShift: number) => {
    codes.forEach((code, i) => {
      const octave = Math.floor(i / JUST.length) + octaveShift;
      const ratio = JUST[i % JUST.length] * Math.pow(2, octave);
      const freq = ROOT_HZ * ratio;
      const index = i + octaveShift * codes.length;
      // Violet-centred jewel palette (250°) with a controlled ±58° iridescent swing.
      const hue = 250 + 58 * Math.sin(index * 0.7);
      const angle = index * 2.399963; // golden angle → well-spread launch dirs
      map[code] = { freq, hue, angle, index };
    });
  };
  build(HOME, 0);
  build(TOP, 1);
  return map;
}

// ── A comet: a bright, high-contrast, MOVING stroke. Motion is what makes the
//    codec bloom, so played strokes travel and leave the encoder starved.
interface Comet {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  hue: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Blob {
  bx: number;
  by: number;
  phase: number;
  drift: number;
  radius: number;
  hue: number;
}

export default function CodecMeltPage() {
  const [started, setStarted] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [ready, setReady] = useState(false);

  const displayRef = useRef<HTMLCanvasElement | null>(null);

  // ── Offscreen buffers.
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const readRef = useRef<HTMLCanvasElement | null>(null);
  const writeRef = useRef<HTMLCanvasElement | null>(null);

  // ── WebCodecs handles.
  const wcRef = useRef<WebCodecsHandles | null>(null);
  const encoderRef = useRef<WcVideoEncoder | null>(null);
  const decoderRef = useRef<WcVideoDecoder | null>(null);
  const fallbackRef = useRef(false);

  // ── Audio.
  const acRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<MeltAudio | null>(null);
  const startedRef = useRef(false);

  // ── Loop / state refs (never trigger React re-renders).
  const rafRef = useRef(0);
  const disposedRef = useRef(false);
  const frameIndexRef = useRef(0);
  const lastKeyframeRef = useRef(-999);
  const lastTimeRef = useRef(0);
  const clockRef = useRef(0);
  const meltRef = useRef(0);
  const cometsRef = useRef<Comet[]>([]);
  const blobsRef = useRef<Blob[]>([]);
  const noteMapRef = useRef<Record<string, NoteDef>>({});
  const heldRef = useRef<Set<string>>(new Set());
  const lastInteractRef = useRef(0);
  const idleClockRef = useRef(0);
  const idleIndexRef = useRef(0);
  const reducedRef = useRef(false);
  const prngRef = useRef<() => number>(() => 0.5);
  const sizeRef = useRef({ w: 1, h: 1 });

  // Trigger one note: synth voice + a moving comet + a melt spike.
  const triggerNote = useCallback((code: string) => {
    const note = noteMapRef.current[code];
    if (!note) return;
    const reduced = reducedRef.current;

    // Hammering accumulates melt (keyboards give no velocity, so repeated attacks
    // = "harder" play). Melt eases back down = the note "heals".
    const add = reduced ? 0.28 : 0.45;
    meltRef.current = Math.min(1, meltRef.current + add);
    const melt = meltRef.current;

    // Spawn the comet from centre, launched along the pitch's angle. Bigger/faster
    // with melt so harder play = more visual motion the codec then smears.
    const prng = prngRef.current;
    const cx = SRC_W / 2 + (prng() - 0.5) * SRC_W * 0.2;
    const cy = SRC_H / 2 + (prng() - 0.5) * SRC_H * 0.2;
    const speedBase = reduced ? 34 : 78;
    const speed = speedBase * (0.6 + melt * 0.9);
    const jitter = (prng() - 0.5) * 0.5;
    const ang = note.angle + jitter;
    cometsRef.current.push({
      x: cx,
      y: cy,
      px: cx,
      py: cy,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      hue: note.hue,
      life: 1,
      maxLife: reduced ? 1.6 : 1.1,
      size: (7 + melt * 12) * (SRC_W / 384),
    });
    // Cap comet count (steal oldest) so the source stays legible.
    if (cometsRef.current.length > 18) cometsRef.current.shift();

    if (startedRef.current) {
      audioRef.current?.playNote(note.freq, 0.5 + melt * 0.5);
    }
  }, []);

  // ── Draw the source scene (what we feed the encoder each frame).
  const drawSource = useCallback((dt: number, t: number) => {
    const canvas = sourceRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = reducedRef.current;

    // Slowly-drifting violet field.
    const g = ctx.createLinearGradient(0, 0, SRC_W, SRC_H);
    const wob = 0.5 + 0.5 * Math.sin(t * 0.11);
    g.addColorStop(0, `hsl(${262 + 10 * Math.sin(t * 0.07)} 60% ${5 + wob * 2}%)`);
    g.addColorStop(1, `hsl(${232 + 12 * Math.cos(t * 0.05)} 55% 3%)`);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SRC_W, SRC_H);

    // Soft drifting blobs (the "surface" the melt blooms across).
    ctx.globalCompositeOperation = "lighter";
    for (const b of blobsRef.current) {
      const speed = reduced ? 0.25 : 1;
      const bx = b.bx + Math.cos(t * b.drift * speed + b.phase) * SRC_W * 0.22;
      const by = b.by + Math.sin(t * b.drift * 0.8 * speed + b.phase) * SRC_H * 0.22;
      const rad = b.radius * (0.85 + 0.15 * Math.sin(t * 0.3 + b.phase));
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
      rg.addColorStop(0, `hsla(${b.hue} 80% 55% 0.5)`);
      rg.addColorStop(1, "hsla(262 80% 50% 0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(bx, by, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Comets — bright high-contrast MOVING strokes = codec bloom fuel.
    const comets = cometsRef.current;
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      c.px = c.x;
      c.py = c.y;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.life -= dt / c.maxLife;
      if (c.life <= 0) {
        comets.splice(i, 1);
        continue;
      }
      const a = Math.max(0, c.life);
      ctx.lineCap = "round";
      // Glow underlay then a hot core — maximal local contrast.
      ctx.strokeStyle = `hsla(${c.hue} 95% 62% ${0.55 * a})`;
      ctx.lineWidth = c.size;
      ctx.beginPath();
      ctx.moveTo(c.px, c.py);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.strokeStyle = `hsla(${(c.hue + 40) % 360} 100% 88% ${0.9 * a})`;
      ctx.lineWidth = Math.max(1, c.size * 0.4);
      ctx.beginPath();
      ctx.moveTo(c.px, c.py);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }, []);

  // ── Present a "fresh" frame through the feedback ping-pong (LSD tracers).
  //    Codec path passes the decoded VideoFrame; fallback passes the source canvas.
  const presentFrame = useCallback((fresh: CanvasImageSource, isFallback: boolean) => {
    const display = displayRef.current;
    const read = readRef.current;
    const write = writeRef.current;
    if (!display || !read || !write) return;
    const dctx = display.getContext("2d");
    const wctx = write.getContext("2d");
    if (!dctx || !wctx) return;

    const { w, h } = sizeRef.current;
    const reduced = reducedRef.current;
    const melt = meltRef.current;
    const cx = w / 2;
    const cy = h / 2;

    // Trail persistence + slow zoom/rotate grow with melt (the "tracer" surge),
    // hard-capped and smooth so nothing ever flashes full-frame.
    const decay = (reduced ? 0.6 : 0.68) + melt * (reduced ? 0.12 : 0.2);
    const zoom = 1 + (reduced ? 0.003 : 0.006) + melt * (reduced ? 0.004 : 0.012);
    const rot = (reduced ? 0.0008 : 0.0022) + melt * (reduced ? 0.0006 : 0.0025);
    const hueNudge = (isFallback ? 6 : 2) + melt * (isFallback ? 14 : 5);

    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.globalCompositeOperation = "source-over";
    wctx.globalAlpha = 1;
    wctx.clearRect(0, 0, w, h);

    // Decayed, transformed, hue-shifted copy of the previous presented frame.
    wctx.save();
    wctx.filter = `hue-rotate(${hueNudge.toFixed(1)}deg) saturate(1.05)`;
    wctx.globalAlpha = Math.min(0.92, decay);
    wctx.imageSmoothingEnabled = true;
    wctx.translate(cx, cy);
    wctx.scale(zoom, zoom);
    wctx.rotate(rot);
    wctx.translate(-cx, -cy);
    wctx.drawImage(read, 0, 0, w, h);
    wctx.restore();

    // Fresh melted layer on top. Nearest-neighbour upscale makes the low-bitrate
    // DCT macroblocks read as crisp, blooming, color-banded slabs.
    wctx.filter = "none";
    wctx.globalCompositeOperation = "lighter";
    wctx.globalAlpha = 0.85;
    wctx.imageSmoothingEnabled = false;
    try {
      wctx.drawImage(fresh, 0, 0, w, h);
    } catch {
      /* frame may be closed under teardown */
    }
    wctx.globalCompositeOperation = "source-over";
    wctx.globalAlpha = 1;

    // Present, then ping-pong the buffers.
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(write, 0, 0, w, h);

    readRef.current = write;
    writeRef.current = read;
  }, []);

  const handleBegin = useCallback(async () => {
    if (startedRef.current) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new Ctor();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeMeltAudio(ac, 0.18);
      startedRef.current = true;
      setStarted(true);
      lastInteractRef.current = performance.now();
    } catch {
      /* audio unlock failed — visuals still run */
    }
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    reducedRef.current = prefersReducedMotion();
    noteMapRef.current = makeNoteMap();
    const prng = mulberry32(0x51ce_0600 ^ 1536);
    prngRef.current = prng;

    // Seeded blob field.
    const blobs: Blob[] = [];
    for (let i = 0; i < 5; i++) {
      blobs.push({
        bx: prng() * SRC_W,
        by: prng() * SRC_H,
        phase: prng() * Math.PI * 2,
        drift: 0.05 + prng() * 0.12,
        radius: SRC_H * (0.35 + prng() * 0.35),
        hue: 240 + prng() * 60,
      });
    }
    blobsRef.current = blobs;

    // Offscreen source buffer.
    const source = document.createElement("canvas");
    source.width = SRC_W;
    source.height = SRC_H;
    sourceRef.current = source;

    const display = displayRef.current;
    if (!display) return;

    const resize = () => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      sizeRef.current = { w, h };
      display.width = w;
      display.height = h;
      // (Re)build the ping-pong trail buffers at viewport size.
      const a = document.createElement("canvas");
      const b = document.createElement("canvas");
      a.width = w;
      a.height = h;
      b.width = w;
      b.height = h;
      readRef.current = a;
      writeRef.current = b;
      const dctx = display.getContext("2d");
      if (dctx) {
        dctx.fillStyle = "#05030a";
        dctx.fillRect(0, 0, w, h);
      }
    };
    resize();

    // ── Try to stand up the real WebCodecs pipeline.
    const setupCodec = async () => {
      const wc = getWebCodecs();
      if (!wc) {
        fallbackRef.current = true;
        setUsingFallback(true);
        setReady(true);
        return;
      }
      const cfg = {
        codec: "vp8",
        width: SRC_W,
        height: SRC_H,
        bitrate: ENCODER_BITRATE,
        framerate: FRAMERATE,
        latencyMode: "realtime" as const,
      };
      try {
        const support = await wc.VideoEncoder.isConfigSupported(cfg);
        if (disposedRef.current) return;
        if (!support || !support.supported) {
          fallbackRef.current = true;
          setUsingFallback(true);
          setReady(true);
          return;
        }
        wcRef.current = wc;

        const decoder = new wc.VideoDecoder({
          output: (frame: WcVideoFrame) => {
            try {
              if (!disposedRef.current) {
                presentFrame(frame as unknown as CanvasImageSource, false);
              }
            } catch {
              /* present failed */
            } finally {
              try {
                frame.close();
              } catch {
                /* already closed */
              }
            }
          },
          error: () => {
            // Decoder blew up mid-stream — drop to the software fallback.
            fallbackRef.current = true;
            setUsingFallback(true);
          },
        });
        decoder.configure({ codec: "vp8", codedWidth: SRC_W, codedHeight: SRC_H });
        decoderRef.current = decoder;

        const encoder = new wc.VideoEncoder({
          output: (chunk) => {
            try {
              const dec = decoderRef.current;
              if (!disposedRef.current && dec && dec.state === "configured") {
                dec.decode(chunk);
              }
            } catch {
              /* decode failed for this chunk — next frame recovers */
            }
          },
          error: () => {
            fallbackRef.current = true;
            setUsingFallback(true);
          },
        });
        encoder.configure(cfg);
        encoderRef.current = encoder;
        setReady(true);
      } catch {
        fallbackRef.current = true;
        setUsingFallback(true);
        setReady(true);
      }
    };
    void setupCodec();

    // ── The single render loop.
    const loop = () => {
      if (disposedRef.current) return;
      const now = performance.now();
      let dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(0.05, dt);
      clockRef.current += dt;
      const t = clockRef.current;
      const reduced = reducedRef.current;

      // Melt eases back down (the "heal"). Rate is smooth — never a flash.
      const tau = reduced ? 1.4 : 0.85;
      meltRef.current *= Math.exp(-dt / tau);
      if (meltRef.current < 0.0005) meltRef.current = 0;

      // Idle auto-demo: after ~2.5s untouched, play a slow evolving phrase so the
      // piece melts + sounds on its own. A real key press takes over instantly.
      if (now - lastInteractRef.current > 2500) {
        idleClockRef.current += dt;
        const step = reduced ? 0.9 : 0.52;
        if (idleClockRef.current >= step) {
          idleClockRef.current -= step;
          const prngLocal = prngRef.current;
          // Gentle random walk across the scale for a melodic phrase.
          const codes = [...HOME, ...TOP];
          let idx = idleIndexRef.current + Math.round((prngLocal() - 0.5) * 4);
          idx = Math.max(0, Math.min(codes.length - 1, idx));
          idleIndexRef.current = idx;
          triggerNote(codes[idx]);
        }
      }

      // Draw the scene we feed the codec.
      drawSource(dt, t);

      // Drive the drone with current intensity.
      if (startedRef.current) {
        const activity = Math.min(1, meltRef.current + cometsRef.current.length * 0.03);
        audioRef.current?.setDrive(0.12 + activity * 0.85);
      }

      // ── Feed the codec (or the fallback feedback loop).
      const encoder = encoderRef.current;
      const wc = wcRef.current;
      if (!fallbackRef.current && encoder && wc && encoder.state === "configured") {
        // Backpressure guard — skip a frame rather than let the queue run away.
        if (encoder.encodeQueueSize <= 2) {
          const fi = frameIndexRef.current;
          // Keyframe policy: force the first frame; otherwise only request a key
          // to HEAL when calm, plus a safety heal every 5s so smear never runs
          // unbounded. During melt we starve the delta frames → blocks explode.
          let keyFrame = fi === 0;
          const sinceKey = fi - lastKeyframeRef.current;
          if (!keyFrame && meltRef.current < 0.08 && sinceKey > 45) keyFrame = true;
          if (!keyFrame && sinceKey > 150) keyFrame = true;
          if (keyFrame) lastKeyframeRef.current = fi;
          try {
            const vf = new wc.VideoFrame(source, { timestamp: fi * FRAME_US });
            encoder.encode(vf, { keyFrame });
            vf.close();
            frameIndexRef.current = fi + 1;
          } catch {
            // Anything from the codec path → fall into software feedback.
            fallbackRef.current = true;
            setUsingFallback(true);
          }
        }
        // Presentation happens in the decoder output callback.
      } else {
        // Software "poor-man's datamosh": present the source straight through the
        // same feedback ping-pong (zoom + rotate + hue nudge + decay).
        presentFrame(source, true);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!noteMapRef.current[e.code]) return;
      e.preventDefault();
      lastInteractRef.current = performance.now();
      if (!heldRef.current.has(e.code)) {
        heldRef.current.add(e.code);
        triggerNote(e.code);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldRef.current.delete(e.code);
    };

    lastTimeRef.current = performance.now();
    lastInteractRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      disposedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);

      const enc = encoderRef.current;
      const dec = decoderRef.current;
      encoderRef.current = null;
      decoderRef.current = null;
      try {
        if (enc && enc.state !== "closed") enc.close();
      } catch {
        /* noop */
      }
      try {
        if (dec && dec.state !== "closed") dec.close();
      } catch {
        /* noop */
      }

      audioRef.current?.stop();
      audioRef.current = null;
      startedRef.current = false;
      const ac = acRef.current;
      acRef.current = null;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 600);
      }
    };
  }, [drawSource, presentFrame, triggerNote]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <canvas
        ref={displayRef}
        className="fixed inset-0 h-full w-full"
        style={{ background: "#05030a" }}
        aria-label="Video codec melt — bitrate-starved DCT macroblocks blooming as you play"
      />

      <div className="pointer-events-none fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Codec Melt</h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          Play the melt of a dying video codec: every key hammers a real hardware
          <span className="font-mono"> VideoEncoder</span> into starvation so its DCT
          macroblocks explode into blooming, color-banded slabs that heal as the note decays.
        </p>

        {!started && (
          <button
            onClick={handleBegin}
            className="pointer-events-auto mt-4 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start
          </button>
        )}

        {started && (
          <div className="mt-4 space-y-2">
            <p className="font-mono text-sm text-primary">
              A – L : play · Q – P : octave up · hammer a key to melt harder
            </p>
            <p className="text-sm text-muted-foreground">
              Pitch steers the melt — each note launches a moving comet whose direction and hue
              the codec then smears. Harder play = deeper melt + louder voice.
            </p>
          </div>
        )}

        {!started && (
          <p className="mt-3 font-mono text-sm text-muted-foreground">
            it melts &amp; sings on its own · press Start to unlock sound and the keys
          </p>
        )}

        {usingFallback && ready && (
          <p className="mt-3 text-sm text-destructive">
            Codec path unavailable — showing software feedback fallback.
          </p>
        )}

        <details className="pointer-events-auto mt-4 max-w-sm text-sm text-muted-foreground">
          <summary className="cursor-pointer text-primary hover:text-primary/80">
            Read the design notes
          </summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              A Canvas2D scene of drifting violet blobs is fed frame-by-frame into a real{" "}
              <span className="font-mono">VideoEncoder</span> (VP8) at a deliberately starved
              bitrate, decoded straight back with <span className="font-mono">VideoDecoder</span>,
              and upscaled nearest-neighbour so the compression artifacts <em>are</em> the
              render. Datamosh as an instrument.
            </p>
            <p>
              After Takeshi Murata&rsquo;s <span className="italic">Monster Movie</span>, Rosa
              Menkman&rsquo;s glitch work, Nino Filiu&rsquo;s SuperMosh, and Sven König&rsquo;s{" "}
              <span className="font-mono">aPpRoPiRaTe!</span> See{" "}
              <span className="font-mono">README.md</span>.
            </p>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["1536-codec-melt"]} />
    </main>
  );
}
