"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker } from "../_shared/psych/safeFlicker";
import { makeField, type FieldRenderer } from "./render";
import { makeAudio, type BloomAudio } from "./audio";
import { NOTES_MD } from "./notes";

type Phase = "intro" | "live" | "unsupported";

function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-5 text-xl font-medium text-primary">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-2xl font-semibold tracking-tight text-foreground">
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} className="ml-5 list-disc text-base leading-relaxed text-muted-foreground">
          {line.slice(2)}
        </li>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-muted-foreground">
        {line}
      </p>
    );
  });
}

export default function BloomFieldPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [showNotes, setShowNotes] = useState(false);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [flickerOn, setFlickerOn] = useState(false);
  const [motionPct, setMotionPct] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<FieldRenderer | null>(null);
  const audioRef = useRef<BloomAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 2, floor: 0.7 }));
  const flickFrameRef = useRef(0);

  // Feature detection.
  useEffect(() => {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext };
    const canGL = (() => {
      try {
        return !!document.createElement("canvas").getContext("webgl2");
      } catch {
        return false;
      }
    })();
    if (!canGL || !(window.AudioContext || w.webkitAudioContext)) {
      setPhase("unsupported");
    }
  }, []);

  const start = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const field = makeField(canvas);
      fieldRef.current = field;
      field.resize();
      const audio = makeAudio();
      await audio.start();
      audioRef.current = audio;
      // Camera is best-effort; the ghost bloom runs regardless.
      const ok = await field.startCamera();
      setCameraDenied(!ok);
      setPhase("live");
    } catch {
      setPhase("unsupported");
    }
  }, []);

  // Main loop.
  useEffect(() => {
    if (phase !== "live") return;
    const loop = () => {
      const field = fieldRef.current;
      const audio = audioRef.current;
      if (field) {
        // safe-flicker luminance multiplier (steady 1.0 when off).
        flickFrameRef.current++;
        const tSec = flickFrameRef.current / 60;
        field.setFlick(flickerRef.current.value(tSec));
        const st = field.frame();
        audio?.update(st.motion, st.bloom);
        setMotionPct(Math.round(st.motion * 100));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // Resize.
  useEffect(() => {
    if (phase !== "live") return;
    const onResize = () => fieldRef.current?.resize();
    window.addEventListener("resize", onResize);
    fieldRef.current?.resize();
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // Teardown.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      fieldRef.current?.dispose();
      audioRef.current?.dispose();
    };
  }, []);

  const toggleFlicker = useCallback(() => {
    flickerRef.current.toggle();
    setFlickerOn(flickerRef.current.enabled);
  }, []);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#05060b] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* header */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Bloom Field
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          A DMT-threshold chrysanthemum that opens to your presence. Stillness
          unfolds it slowly; movement makes it bloom and reorganize.
        </p>
      </div>

      {/* design-notes link */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full px-4 py-2.5 font-mono text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes →
      </button>

      {/* intro / start */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-border bg-black/60 p-6 backdrop-blur-md">
            <h2 className="text-xl font-medium text-foreground">Open the bloom</h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              This piece asks for your camera to feel your presence — it reads
              only motion energy (a blurred frame-difference), never your face.
              Hold still and the fractal flower unfolds slowly; move and it
              blooms and reorganizes. If you decline, a deterministic breathing
              version runs instead. Sound on.
            </p>
            <button
              type="button"
              onClick={start}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* unsupported */}
      {phase === "unsupported" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-border bg-black/70 p-6 backdrop-blur-md">
            <h2 className="text-xl font-medium text-primary">Not supported here</h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              This piece needs WebGL2 and the Web Audio API, which your browser
              did not expose. Try a recent Chrome, Safari, or Firefox.
            </p>
          </div>
        </div>
      )}

      {/* live chrome */}
      {phase === "live" && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-4 p-5 sm:p-7">
          <div className="max-w-xs flex-1">
            {cameraDenied && (
              <p className="mb-2 text-base font-medium text-destructive">
                Camera unavailable — running the deterministic ghost bloom.
              </p>
            )}
            <div className="flex items-baseline justify-between font-mono text-sm text-muted-foreground">
              <span>presence</span>
              <span className="text-primary">{motionPct}%</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-150"
                style={{ width: `${motionPct}%` }}
              />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Move to feed the bloom; hold still to let it settle.
            </p>
          </div>

          <button
            type="button"
            onClick={toggleFlicker}
            aria-pressed={flickerOn}
            className="min-h-[44px] rounded-md border border-border bg-black/40 px-4 text-sm font-medium text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
          >
            Shimmer flicker: {flickerOn ? "on" : "off"}
          </button>
        </div>
      )}

      {/* notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm">
          <div className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-[#0a0b12] p-6 sm:p-8">
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mb-4 min-h-[44px] rounded-full px-4 py-2.5 font-mono text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              ← close
            </button>
            <div className="space-y-1">{renderNotes(NOTES_MD)}</div>
            <p className="mt-6 font-mono text-sm text-muted-foreground/70">
              src/app/dream/1700-bloom-field/README.md
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1700-bloom-field"]} />
    </main>
  );
}
