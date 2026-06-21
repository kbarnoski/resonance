"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MeshAudio } from "./audio";
import { MeshRenderer } from "./render";
import {
  KEY_TO_MIDI,
  PAD_MIDIS_LOW,
  PAD_MIDIS_HIGH,
  makePads,
  midiToName,
} from "./mesh";

// ── Minimal local Web MIDI types (not always in lib.dom) ───────────────────
interface MIDIMessageEventLike {
  data: Uint8Array;
}
interface MIDIInputLike {
  name?: string;
  onmidimessage: ((e: MIDIMessageEventLike) => void) | null;
}
interface MIDIAccessLike {
  inputs: { values(): IterableIterator<MIDIInputLike> };
  onstatechange: (() => void) | null;
}
interface NavigatorMIDI {
  requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<MIDIAccessLike>;
}

type MidiStatus = "checking" | "connected" | "none" | "unsupported";

const LOW_PADS = makePads(PAD_MIDIS_LOW);
const HIGH_PADS = makePads(PAD_MIDIS_HIGH);

export default function WaveguideMeshPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<MeshAudio | null>(null);
  const rendererRef = useRef<MeshRenderer | null>(null);
  const rafRef = useRef(0);
  const midiAccessRef = useRef<MIDIAccessLike | null>(null);
  const heldKeysRef = useRef<Set<string>>(new Set());

  const [audioOn, setAudioOn] = useState(false);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>("checking");
  const [midiName, setMidiName] = useState<string>("");
  const [lastNote, setLastNote] = useState<string>("—");
  const [canvasOk, setCanvasOk] = useState(true);
  const [activePads, setActivePads] = useState<Set<number>>(new Set());

  // ── Strike helper (shared by MIDI / pads / pointer / keyboard) ────────────
  const strike = useCallback(
    (midi: number, velocity: number, x?: number, y?: number) => {
      const a = audioRef.current;
      if (!a || !a.ready) return;
      a.strike({ midi, velocity, x, y });
      setLastNote(`${midiToName(midi)}  ·  v${Math.round(velocity * 127)}`);
    },
    []
  );

  // Map a MIDI note to a strike position so different pitches hit different
  // spots on the head (low notes near the rim, high notes nearer centre).
  const posForMidi = useCallback((midi: number): { x: number; y: number } => {
    const t = Math.max(0, Math.min(1, (midi - 36) / 48));
    // higher notes → closer to centre; spread around using note class for variety.
    const cls = ((midi % 12) / 12) * Math.PI * 2;
    const radius = 0.42 * (1 - t * 0.7);
    return {
      x: 0.5 + Math.cos(cls) * radius,
      y: 0.5 + Math.sin(cls) * radius,
    };
  }, []);

  const playNote = useCallback(
    (midi: number, velocity: number) => {
      const p = posForMidi(midi);
      strike(midi, velocity, p.x, p.y);
    },
    [posForMidi, strike]
  );

  // ── Enable audio (first gesture) ──────────────────────────────────────────
  const enableAudio = useCallback(async () => {
    let a = audioRef.current;
    if (!a) {
      a = new MeshAudio();
      audioRef.current = a;
      a.onField((field, nx, ny, level) => {
        rendererRef.current?.setField(field, nx, ny, level);
      });
    }
    try {
      await a.init();
      setAudioOn(true);
      // A welcoming little roll so it's immediately alive + audible.
      const roll = [50, 57, 62, 65];
      roll.forEach((m, i) => {
        window.setTimeout(() => playNote(m, 0.55), i * 130);
      });
    } catch {
      setAudioOn(false);
    }
  }, [playNote]);

  // ── Canvas setup + render loop ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: MeshRenderer;
    try {
      renderer = new MeshRenderer(canvas);
    } catch {
      setCanvasOk(false);
      return;
    }
    rendererRef.current = renderer;
    renderer.resize();

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    const loop = () => {
      renderer.draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rendererRef.current = null;
    };
  }, []);

  // ── Web MIDI ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const nav = navigator as unknown as NavigatorMIDI;
    if (!nav.requestMIDIAccess) {
      setMidiStatus("unsupported");
      return;
    }

    let cancelled = false;
    const onMessage = (e: MIDIMessageEventLike) => {
      const [status, d1, d2] = e.data;
      const cmd = status & 0xf0;
      if (cmd === 0x90 && d2 > 0) {
        playNote(d1, d2 / 127);
      }
      // note-off / 0x80 → let it ring out naturally (no action)
    };

    const wire = (access: MIDIAccessLike) => {
      let any = false;
      let name = "";
      for (const input of access.inputs.values()) {
        input.onmidimessage = onMessage;
        any = true;
        if (!name && input.name) name = input.name;
      }
      if (!cancelled) {
        setMidiStatus(any ? "connected" : "none");
        setMidiName(name);
      }
    };

    nav
      .requestMIDIAccess({ sysex: false })
      .then((access) => {
        if (cancelled) return;
        midiAccessRef.current = access;
        wire(access);
        access.onstatechange = () => wire(access);
      })
      .catch(() => {
        if (!cancelled) setMidiStatus("none");
      });

    return () => {
      cancelled = true;
      const access = midiAccessRef.current;
      if (access) {
        for (const input of access.inputs.values()) input.onmidimessage = null;
        access.onstatechange = null;
      }
    };
  }, [playNote]);

  // ── Computer keyboard fallback ────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const midi = KEY_TO_MIDI[k];
      if (midi === undefined) return;
      if (heldKeysRef.current.has(k)) return;
      heldKeysRef.current.add(k);
      playNote(midi, 0.8);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [playNote]);

  // ── Cleanup audio on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  // ── Pointer strikes directly on the membrane ──────────────────────────────
  const onCanvasPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (!audioRef.current?.ready) {
        void enableAudio();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      // Position → pitch: vertical = octave, horizontal = chromatic within.
      const octave = Math.round(3 + (1 - fy) * 3); // 3..6
      const semi = Math.round(fx * 11);
      const midi = 12 * octave + semi;
      strike(midi, 0.85, Math.max(0.05, Math.min(0.95, fx)), Math.max(0.05, Math.min(0.95, fy)));
    },
    [enableAudio, strike]
  );

  const triggerPad = useCallback(
    (midi: number) => {
      if (!audioRef.current?.ready) {
        void enableAudio();
        return;
      }
      playNote(midi, 0.9);
      setActivePads((prev) => {
        const next = new Set(prev);
        next.add(midi);
        return next;
      });
      window.setTimeout(() => {
        setActivePads((prev) => {
          const next = new Set(prev);
          next.delete(midi);
          return next;
        });
      }, 180);
    },
    [enableAudio, playNote]
  );

  const midiLine = (() => {
    switch (midiStatus) {
      case "checking":
        return <span className="text-white/75">Checking for a MIDI keyboard…</span>;
      case "connected":
        return (
          <span className="text-emerald-300/95">
            MIDI keyboard connected ✓{midiName ? ` — ${midiName}` : ""} · play any keys
          </span>
        );
      case "none":
        return (
          <span className="text-amber-300/95">No MIDI device — use the pads below (or your keyboard A–L)</span>
        );
      default:
        return (
          <span className="text-amber-300/95">
            Web MIDI not supported here — use the pads below (or your keyboard A–L)
          </span>
        );
    }
  })();

  return (
    <main className="min-h-screen w-full bg-[#0b0610] text-white overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
        {/* Header */}
        <header className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Waveguide Mesh
            </h1>
            <Link
              href="/dream/827-waveguide-mesh/README.md"
              className="hidden text-sm text-violet-300/90 underline-offset-4 hover:underline sm:inline"
            >
              Read the design notes
            </Link>
          </div>
          <p className="text-base text-white/80">
            Strike a vibrating drumhead and watch the energy ripple, reflect off the rim, and ring as
            a real plate tone — the membrane&apos;s own physics makes the sound.
          </p>
        </header>

        {/* Canvas */}
        <div className="relative w-full">
          <canvas
            ref={canvasRef}
            onPointerDown={onCanvasPointer}
            className="aspect-square w-full max-h-[58vh] cursor-crosshair touch-none rounded-2xl border border-white/10 bg-[#0a050f] shadow-[0_0_60px_-15px_rgba(180,110,90,0.5)]"
            style={{ marginLeft: "auto", marginRight: "auto" }}
          />
          {!canvasOk && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/70 p-6 text-center text-base text-white/85">
              This browser can&apos;t draw the membrane (no canvas). The audio engine still works.
            </div>
          )}
          {!audioOn && (
            <button
              onClick={enableAudio}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/45 text-center backdrop-blur-[1px]"
            >
              <span className="rounded-full bg-amber-500/90 px-6 py-3 text-base font-semibold text-black shadow-lg">
                ▶ Enable sound
              </span>
              <span className="text-base text-white/80">then tap the head, the pads, or play MIDI</span>
            </button>
          )}
        </div>

        {/* Status + last note */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-base">
          <div>{midiLine}</div>
          <div className="text-white/75">
            last strike: <span className="font-mono text-amber-300/95">{lastNote}</span>
          </div>
        </div>

        {/* Pads */}
        <section className="flex flex-col gap-2">
          <div className="text-sm text-white/55">Plates (higher tension)</div>
          <div className="grid grid-cols-6 gap-2">
            {HIGH_PADS.map((p) => (
              <button
                key={p.midi}
                onPointerDown={() => triggerPad(p.midi)}
                className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-base font-medium transition ${
                  activePads.has(p.midi)
                    ? "border-amber-300 bg-amber-400/30 text-white"
                    : "border-violet-400/30 bg-violet-500/10 text-white/90 hover:bg-violet-500/20"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-1 text-sm text-white/55">Toms (lower tension)</div>
          <div className="grid grid-cols-6 gap-2">
            {LOW_PADS.map((p) => (
              <button
                key={p.midi}
                onPointerDown={() => triggerPad(p.midi)}
                className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-base font-medium transition ${
                  activePads.has(p.midi)
                    ? "border-amber-300 bg-amber-400/30 text-white"
                    : "border-amber-400/25 bg-amber-500/10 text-white/90 hover:bg-amber-500/20"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* Instructions */}
        <footer className="mt-1 text-sm leading-relaxed text-white/75">
          <p>
            Tap two or more pads together for a chord — the mesh sums the strikes. Tap directly on the
            head to strike at that exact point (height = octave, left↔right = pitch). On a laptop, the
            <span className="font-mono text-white/90"> A S D F G H J K </span> row plays too. Higher
            notes = tighter head = higher ring.
          </p>
          <Link
            href="/dream/827-waveguide-mesh/README.md"
            className="mt-1 inline-block text-violet-300/90 underline-offset-4 hover:underline sm:hidden"
          >
            Read the design notes
          </Link>
        </footer>
      </div>
    </main>
  );
}
