"use client";

import { useRef, useState } from "react";

const NOTES = [
  { freq: 261.63, color: "#E63946" }, // C4
  { freq: 293.66, color: "#F4A261" }, // D4
  { freq: 329.63, color: "#E9C46A" }, // E4
  { freq: 392.00, color: "#2ABFA8" }, // G4
  { freq: 440.00, color: "#4A90D9" }, // A4
  { freq: 523.25, color: "#A855C8" }, // C5
  { freq: 587.33, color: "#F07830" }, // D5
  { freq: 659.25, color: "#48CAE4" }, // E5
] as const;

const PAD_FREQS = [130.81, 164.81, 196.0] as const;

type NoteHandle = { oscs: OscillatorNode[]; gainNode: GainNode };

export default function KidsColorPiano() {
  const actxRef = useRef<AudioContext | null>(null);
  const activeRef = useRef<Map<number, NoteHandle>>(new Map());
  const pointerRef = useRef<Map<number, number>>(new Map());
  const pressedRef = useRef<Set<number>>(new Set());
  const [pressed, setPressed] = useState<ReadonlySet<number>>(new Set());
  const [started, setStarted] = useState(false);

  function bootAudio() {
    if (!actxRef.current) {
      const actx = new AudioContext();
      actxRef.current = actx;

      const master = actx.createGain();
      master.gain.value = 0.04;
      master.connect(actx.destination);

      PAD_FREQS.forEach((freq, i) => {
        const osc = actx.createOscillator();
        const g = actx.createGain();
        const lfo = actx.createOscillator();
        const lg = actx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        lfo.frequency.value = 0.08 + i * 0.025;
        lg.gain.value = 0.07;
        lfo.connect(lg);
        lg.connect(g.gain);
        osc.connect(g);
        g.connect(master);
        osc.start();
        lfo.start();
      });
    }
    if (actxRef.current.state === "suspended") {
      void actxRef.current.resume();
    }
    return actxRef.current;
  }

  function handleStart() {
    bootAudio();
    setStarted(true);
  }

  function playNoteOn(idx: number) {
    if (pressedRef.current.has(idx) || !actxRef.current) return;
    const actx = actxRef.current;
    const freq = NOTES[idx].freq;

    const gainNode = actx.createGain();
    gainNode.gain.setValueAtTime(0, actx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.52, actx.currentTime + 0.012);
    gainNode.connect(actx.destination);

    const o1 = actx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;
    o1.connect(gainNode);
    o1.start();

    const g2 = actx.createGain();
    g2.gain.value = 0.18;
    const o2 = actx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    o2.connect(g2);
    g2.connect(gainNode);
    o2.start();

    activeRef.current.set(idx, { oscs: [o1, o2], gainNode });
    pressedRef.current.add(idx);
    setPressed(new Set(pressedRef.current));
  }

  function playNoteOff(idx: number) {
    const handle = activeRef.current.get(idx);
    if (!handle || !actxRef.current) return;
    activeRef.current.delete(idx);
    pressedRef.current.delete(idx);

    const actx = actxRef.current;
    const t = actx.currentTime;
    handle.gainNode.gain.cancelScheduledValues(t);
    handle.gainNode.gain.setValueAtTime(handle.gainNode.gain.value, t);
    handle.gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    const stopAt = t + 0.9;
    handle.oscs.forEach((osc) => {
      osc.stop(stopAt);
    });

    setPressed(new Set(pressedRef.current));
  }

  function noteAtPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const attr = el?.closest("[data-note]")?.getAttribute("data-note");
    return attr != null ? parseInt(attr, 10) : null;
  }

  function handlePointerDown(e: React.PointerEvent) {
    const idx = noteAtPoint(e.clientX, e.clientY);
    if (idx === null) return;
    pointerRef.current.set(e.pointerId, idx);
    playNoteOn(idx);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointerRef.current.has(e.pointerId)) return;
    const prev = pointerRef.current.get(e.pointerId)!;
    const curr = noteAtPoint(e.clientX, e.clientY);
    if (curr === prev) return;
    playNoteOff(prev);
    if (curr !== null) {
      pointerRef.current.set(e.pointerId, curr);
      playNoteOn(curr);
    } else {
      pointerRef.current.delete(e.pointerId);
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    const prev = pointerRef.current.get(e.pointerId);
    if (prev !== undefined) {
      playNoteOff(prev);
      pointerRef.current.delete(e.pointerId);
    }
  }

  if (!started) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center gap-10 px-6"
        style={{ height: "calc(100vh - 3rem)" }}
      >
        <div className="text-center space-y-4">
          <div className="text-7xl">🎹</div>
          <h1 className="text-4xl font-bold text-white">Color Piano</h1>
          <p className="text-lg text-white/75 max-w-xs leading-relaxed">
            Eight colorful keys — tap, hold, or slide to play. No wrong notes.
          </p>
        </div>
        <button
          onClick={handleStart}
          className="text-xl font-bold text-white bg-violet-600 hover:bg-violet-500 active:bg-violet-700 rounded-2xl px-12 py-5 min-h-[64px] min-w-[200px] transition-colors select-none"
          style={{ touchAction: "manipulation" }}
        >
          {"Let's play! 🎵"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-hidden flex flex-col items-center justify-center"
      style={{ height: "calc(100vh - 3rem)", touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 4×2 grid of pentatonic circles */}
      <div
        className="grid grid-cols-4 grid-rows-2"
        style={{ gap: "2.5vmin" }}
      >
        {NOTES.map((note, i) => (
          <div
            key={i}
            data-note={String(i)}
            style={{
              width: "20vmin",
              height: "20vmin",
              borderRadius: "50%",
              backgroundColor: note.color,
              boxShadow: pressed.has(i)
                ? `0 0 8vmin 3.5vmin ${note.color}cc, 0 0 18vmin 7vmin ${note.color}55`
                : `0 0 2.5vmin 0.6vmin ${note.color}66`,
              transform: pressed.has(i) ? "scale(0.85)" : "scale(1)",
              transition: "transform 0.07s ease-out, box-shadow 0.09s ease-out",
              cursor: "pointer",
            }}
          />
        ))}
      </div>

      {/* Subtle hint — visible to parents, ignored by kids */}
      <div
        className="absolute pointer-events-none font-mono tracking-widest text-center"
        style={{
          bottom: "2.5vmin",
          fontSize: "max(12px, 2vmin)",
          color: "rgba(255,255,255,0.55)",
        }}
      >
        tap · hold · slide
      </div>
    </div>
  );
}
