"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { PhaseLoom, buildPads, type PadInfo } from "./engine";
import { PhaseLoomViz } from "./viz";

// Computer-keyboard bindings for the on-screen fallback (10 pads).
const KEY_ROW = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];

type MidiKind = "unknown" | "midi" | "keys";

export default function PhaseLoomPage() {
  const [started, setStarted] = useState(false);
  const [pads] = useState<PadInfo[]>(() => buildPads());
  const [active, setActive] = useState<Set<number>>(new Set());
  const [midiKind, setMidiKind] = useState<MidiKind>("unknown");
  const [midiLabel, setMidiLabel] = useState("on-screen keys");
  const [glError, setGlError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PhaseLoom | null>(null);
  const vizRef = useRef<PhaseLoomViz | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastActiveRef = useRef<string>("");
  const midiAccessRef = useRef<MIDIAccess | null>(null);

  const syncActive = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    setActive(new Set(eng.activeSlots()));
  }, []);

  // ── toggle a loop (shared by pointer, key and MIDI) ──
  const toggleSlot = useCallback(
    (slot: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      eng.toggle(slot);
      syncActive();
    },
    [syncActive],
  );

  // ── boot: audio engine + three.js viz + render loop ──
  const begin = useCallback(async () => {
    if (engineRef.current) return;
    const eng = new PhaseLoom();
    engineRef.current = eng;
    await eng.start();

    // seed two contrasting loops so the phasing is instantly audible/visible
    eng.toggle(0);
    eng.toggle(6);
    syncActive();

    const mount = mountRef.current;
    if (mount) {
      if (typeof window === "undefined" || !window.WebGLRenderingContext) {
        setGlError("This piece needs WebGL, which this browser does not provide.");
      } else {
        try {
          vizRef.current = new PhaseLoomViz(mount);
        } catch {
          setGlError("Could not start the WebGL renderer on this device.");
        }
      }
    }

    let prev = performance.now();
    const loop = () => {
      const e = engineRef.current;
      const v = vizRef.current;
      if (e) {
        const now = performance.now();
        const dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;
        const samples = e.sample();
        if (v) {
          const key = samples
            .map((s) => s.slot)
            .sort((a, b) => a - b)
            .join(",");
          if (key !== lastActiveRef.current) {
            v.syncLoops(samples);
            lastActiveRef.current = key;
          }
          v.render(samples, dt);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    setStarted(true);

    // ── Web MIDI (best-effort) ──
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (nav.requestMIDIAccess) {
      try {
        const access = await nav.requestMIDIAccess();
        midiAccessRef.current = access;
        const handler = (ev: MIDIMessageEvent) => {
          const data = ev.data;
          if (!data) return;
          const [status, note, vel] = data;
          if ((status & 0xf0) === 0x90 && vel > 0) {
            const slot = ((note % 12) + Math.floor((note - 48) / 12) * 5) % 10;
            const safe = ((slot % 10) + 10) % 10;
            toggleSlot(safe);
          }
        };
        let count = 0;
        access.inputs.forEach((inp) => {
          inp.onmidimessage = handler;
          count++;
        });
        if (count > 0) {
          setMidiKind("midi");
          setMidiLabel(`MIDI · ${count} input${count > 1 ? "s" : ""}`);
        } else {
          setMidiKind("keys");
          setMidiLabel("on-screen keys (no MIDI device)");
        }
      } catch {
        setMidiKind("keys");
        setMidiLabel("on-screen keys (MIDI denied)");
      }
    } else {
      setMidiKind("keys");
      setMidiLabel("on-screen keys (no Web MIDI)");
    }
  }, [syncActive, toggleSlot]);

  const nudge = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const slots = eng.activeSlots();
    if (slots.length === 0) return;
    eng.nudge(slots[Math.floor(Math.random() * slots.length)]);
  }, []);

  const clearAll = useCallback(() => {
    engineRef.current?.clear();
    syncActive();
  }, [syncActive]);

  // ── computer-keyboard fallback ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!engineRef.current) return;
      const idx = KEY_ROW.indexOf(e.key.toLowerCase());
      if (idx >= 0) {
        e.preventDefault();
        toggleSlot(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSlot]);

  // ── resize ──
  useEffect(() => {
    const onResize = () => vizRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── full cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const access = midiAccessRef.current;
      if (access) access.inputs.forEach((inp) => (inp.onmidimessage = null));
      vizRef.current?.dispose();
      vizRef.current = null;
      void engineRef.current?.close();
      engineRef.current = null;
    };
  }, []);

  const badgeClass =
    midiKind === "midi"
      ? "text-violet-300/95"
      : midiKind === "keys"
        ? "text-violet-300/95"
        : "text-muted-foreground";
  const badgeDot = midiKind === "midi" ? "●" : "○";

  return (
    <main className="min-h-screen bg-black text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Phase Loom
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Hold notes and each becomes a short melodic loop running at its own
          period; the loops slowly drift in and out of phase, weaving evolving
          polymetric music with no drum grid.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className={badgeClass}>
            {badgeDot} {midiLabel}
          </span>
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="text-violet-300 underline decoration-muted-foreground underline-offset-4 hover:decoration-muted-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* ── the 3D stage ── */}
        <div className="relative mt-5 aspect-square w-full overflow-hidden rounded-2xl border border-border bg-[#04030a] sm:aspect-[16/10]">
          <div ref={mountRef} className="absolute inset-0 h-full w-full" />

          {glError && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-base text-violet-300">{glError}</p>
            </div>
          )}

          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-[1px]">
              <p className="max-w-sm px-6 text-center text-base text-muted-foreground">
                Two loops start at once. Add more, then watch and listen as their
                orbits drift into and out of unison over the next minute.
              </p>
              <button
                type="button"
                onClick={() => void begin()}
                className="rounded-full bg-violet-500/90 px-6 py-3 text-base font-medium text-foreground transition-colors hover:bg-violet-400"
              >
                Begin the loom
              </button>
            </div>
          )}
        </div>

        {/* ── pad row ── */}
        <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {pads.map((pad) => {
            const on = active.has(pad.slot);
            return (
              <button
                key={pad.slot}
                type="button"
                onClick={() => toggleSlot(pad.slot)}
                disabled={!started}
                aria-pressed={on}
                className={`flex min-h-[56px] flex-col items-center justify-center rounded-xl border px-4 py-2.5 text-base transition-colors disabled:opacity-40 ${
                  on
                    ? "border-transparent text-black"
                    : "border-border bg-muted text-muted-foreground hover:bg-accent"
                }`}
                style={
                  on
                    ? { backgroundColor: `hsl(${pad.hue} 70% 62%)` }
                    : undefined
                }
              >
                <span className="font-medium">{pad.name}</span>
                <span
                  className={
                    on ? "text-xs text-black/70" : "text-xs text-muted-foreground"
                  }
                >
                  {KEY_ROW[pad.slot] === ";" ? ";" : KEY_ROW[pad.slot]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── transport ── */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={nudge}
            disabled={!started}
            className="rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            Nudge a loop
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={!started}
            className="rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            Clear
          </button>
        </div>

        {showNotes && (
          <div className="mt-6 space-y-3 rounded-2xl border border-border bg-muted p-5 text-base text-muted-foreground">
            <p>
              Every pad you switch on spawns a repeating melodic cell tuned to a
              just-intonation pentatonic. Each loop keeps its{" "}
              <span className="text-foreground">own period</span> — a slightly
              different step tempo and a cell of 3–6 notes — so no two loops
              share a grid. Because the periods differ, the loops drift against
              one another and the composite pattern is never the same twice.
            </p>
            <p>
              In the orbit view each loop is a ring with a mote circling once per
              period. When two motes reach the same angle the loops are momentarily
              in phase: a filament lights between them and the core swells. As
              they drift apart the light fades — you are watching the interference
              beat itself. This is Steve Reich&apos;s{" "}
              <span className="text-foreground">Piano Phase</span> and Terry
              Riley&apos;s <span className="text-foreground">In C</span> idea:
              finding time through phasing, not a metronome. Full notes in{" "}
              <span className="text-foreground">README.md</span> beside this
              prototype.
            </p>
          </div>
        )}

        <div className="mt-6">
          <Link
            href="/dream"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            ← back to the dream lab
          </Link>
        </div>

        <PrototypeNav slugs={["1392-phase-loom"]} />
      </div>
    </main>
  );
}
