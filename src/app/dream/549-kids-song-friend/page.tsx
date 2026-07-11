"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioRig,
  PENTA_MIDI,
  PENTA_COUNT,
  buildAudioRig,
  detectPitch,
  freqToPentaIndex,
  indexToHue,
  playNote,
} from "./audio";
import {
  Memory,
  Song,
  addSong,
  advanceDay,
  emptyMemory,
  greeting,
  isNewCalendarDay,
  loadMemory,
  saveMemory,
  seedMemory,
} from "./memory";

// ── geometry helpers (the body IS the songs) ────────────────────────────────

// One song → an SVG path string: a petal/loop whose vertical shape traces the
// melody's pitch contour. petals radiate around the body center.
const CX = 200;
const CY = 200;

function buildPetalPath(song: Song, petalIndex: number, total: number, scale: number): string {
  const notes = song.notes.length ? song.notes : [0];
  // angle this petal occupies around the center
  const baseAngle = (petalIndex / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  const len = (70 + notes.length * 7) * scale;
  // build a teardrop spine; melody contour modulates the outward radius
  const pts: Array<[number, number]> = [];
  const steps = Math.max(notes.length, 4);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0..1 along the petal
    const noteIdx = notes[Math.min(notes.length - 1, Math.floor(t * notes.length))];
    const pitch = noteIdx / (PENTA_COUNT - 1); // 0..1
    // radius grows out then comes back (teardrop), bulged by pitch
    const envelope = Math.sin(t * Math.PI);
    const r = 18 + (len * t) ; // distance from center along petal axis
    const width = (10 + pitch * 26) * envelope * scale;
    // perpendicular offset alternates to make a leaf with a wiggly contour edge
    const wob = Math.sin(t * Math.PI * 3 + pitch * 6) * width * 0.5;
    const ax = Math.cos(baseAngle);
    const ay = Math.sin(baseAngle);
    const px = CX + ax * r - ay * (width + wob);
    const py = CY + ay * r + ax * (width + wob);
    pts.push([px, py]);
  }
  // return arm
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const noteIdx = notes[Math.min(notes.length - 1, Math.floor(t * notes.length))];
    const pitch = noteIdx / (PENTA_COUNT - 1);
    const envelope = Math.sin(t * Math.PI);
    const r = 18 + len * t;
    const width = (10 + pitch * 26) * envelope * scale;
    const wob = Math.sin(t * Math.PI * 3 + pitch * 6) * width * 0.5;
    const ax = Math.cos(baseAngle);
    const ay = Math.sin(baseAngle);
    const px = CX + ax * r + ay * (width - wob);
    const py = CY + ay * r - ax * (width - wob);
    pts.push([px, py]);
  }
  const head = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  const rest = pts
    .slice(1)
    .map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  return `${head} ${rest} Z`;
}

function songHue(song: Song): number {
  if (!song.notes.length) return 300;
  const avg = song.notes.reduce((a, b) => a + b, 0) / song.notes.length;
  return indexToHue(Math.round(avg));
}

type RecallStep = { midi: number; petal: number; degree: number };

// Build a woven recall: interleave notes from two different days' songs.
function buildRecall(memory: Memory, transpose: number): RecallStep[] {
  const songs = memory.songs;
  if (songs.length === 0) return [];
  // pick two songs from (ideally) different days
  const byDay = new Map<number, number[]>();
  songs.forEach((s, i) => {
    const arr = byDay.get(s.day) ?? [];
    arr.push(i);
    byDay.set(s.day, arr);
  });
  const days = [...byDay.keys()].sort((a, b) => a - b);
  let iA: number;
  let iB: number;
  if (days.length >= 2) {
    iA = byDay.get(days[0])![0];
    iB = byDay.get(days[days.length - 1])![byDay.get(days[days.length - 1])!.length - 1];
  } else {
    iA = 0;
    iB = songs.length > 1 ? songs.length - 1 : 0;
  }
  const a = songs[iA];
  const b = songs[iB];
  const out: RecallStep[] = [];
  const maxLen = Math.max(a.notes.length, b.notes.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < a.notes.length) {
      const deg = a.notes[i];
      out.push({ midi: PENTA_MIDI[clamp(deg + transpose)], petal: iA, degree: deg });
    }
    if (iB !== iA && i < b.notes.length) {
      // weave the second day's melody, gently slowed (every other note)
      const deg = b.notes[i];
      out.push({ midi: PENTA_MIDI[clamp(deg + transpose)], petal: iB, degree: deg });
    }
  }
  return out;
}

function clamp(i: number): number {
  return Math.max(0, Math.min(PENTA_COUNT - 1, i));
}

// ── component ────────────────────────────────────────────────────────────────

type Phase = "intro" | "alive";

export default function Page() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [memory, setMemory] = useState<Memory>(() => emptyMemory());
  const [message, setMessage] = useState("a friend made of the songs you sing it.");
  const [micError, setMicError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [singingBack, setSingingBack] = useState(false);
  const [capturedNotes, setCapturedNotes] = useState<number[]>([]);
  const [activePetal, setActivePetal] = useState<number | null>(null);
  const [mouthOpen, setMouthOpen] = useState(0); // 0..1

  // refs that must survive frames without re-render
  const rigRef = useRef<AudioRig | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const captureRef = useRef<number[]>([]);
  const lastNoteTimeRef = useRef<number>(0);
  const lastDegRef = useRef<number>(-1);
  const breatheRef = useRef<SVGGElement | null>(null);
  const recallTimerRef = useRef<number[]>([]);
  const memoryRef = useRef<Memory>(memory);

  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

  // load persisted memory on mount (no audio yet)
  useEffect(() => {
    const stored = loadMemory();
    if (stored && stored.songs.length > 0) {
      setMemory(stored);
      setMessage(greeting(stored));
    } else {
      // pre-seed so the friend already has a body of songs (frame one)
      const seeded = seedMemory();
      setMemory(seeded);
      setMessage("i'm here! i already know a couple of little songs.");
    }
  }, []);

  // ── idle breathing / blinking via direct attribute mutation (no re-render) ──
  useEffect(() => {
    const animate = () => {
      const t = performance.now() / 1000;
      const g = breatheRef.current;
      if (g) {
        const s = 1 + Math.sin(t * 1.6) * 0.018;
        g.setAttribute("transform", `translate(${CX} ${CY}) scale(${s.toFixed(4)}) translate(${-CX} ${-CY})`);
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // blink at a slow cadence (cheap state)
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      setBlink(true);
      setTimeout(() => alive && setBlink(false), 140);
    };
    const id = setInterval(loop, 4200);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ── cleanup everything on unmount ──
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      recallTimerRef.current.forEach((id) => clearTimeout(id));
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      rigRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // persist whenever memory changes (and stamp lastVisit)
  useEffect(() => {
    if (memory.songs.length > 0) {
      saveMemory({ ...memory, lastVisit: Date.now() });
    }
  }, [memory]);

  // ── recall: sing back woven melodies, highlighting petals ──
  const singBack = useCallback(
    (mem: Memory) => {
      const rig = rigRef.current;
      if (!rig) return;
      recallTimerRef.current.forEach((id) => clearTimeout(id));
      recallTimerRef.current = [];
      // transpose & slow a touch more each visit-day → "changed each visit"
      const transpose = mem.day % 2 === 0 ? 0 : -2;
      const steps = buildRecall(mem, transpose);
      if (steps.length === 0) return;
      setSingingBack(true);
      const noteDur = 0.5 + mem.day * 0.04; // gently slower over days
      const gap = 0.42 + mem.day * 0.03;
      const now = rig.ctx.currentTime + 0.15;
      steps.forEach((s, i) => {
        playNote(rig, s.midi, now + i * gap, noteDur);
        const id = window.setTimeout(() => {
          setActivePetal(s.petal);
          setMouthOpen(0.4 + (s.degree / (PENTA_COUNT - 1)) * 0.6);
        }, (0.15 + i * gap) * 1000);
        recallTimerRef.current.push(id);
      });
      const endId = window.setTimeout(
        () => {
          setActivePetal(null);
          setMouthOpen(0);
          setSingingBack(false);
        },
        (0.15 + steps.length * gap + noteDur) * 1000,
      );
      recallTimerRef.current.push(endId);
    },
    [],
  );

  // ── mic listening loop: detect pitch → quantize → build melody ──
  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const rig = rigRef.current;
    if (!analyser || !rig) return;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const { freq, rms, confident } = detectPitch(buf, rig.ctx.sampleRate);

    const nowMs = performance.now();
    let degree = -1;
    if (confident && freq > 0) {
      degree = freqToPentaIndex(freq);
    } else if (rms > 0.02) {
      // "babble note": any vocalization teaches — reuse last or a friendly mid note
      degree = lastDegRef.current >= 0 ? lastDegRef.current : 5;
    }

    if (degree >= 0) {
      const sinceLast = nowMs - lastNoteTimeRef.current;
      // commit a new note if pitch changed or enough time passed
      if (degree !== lastDegRef.current || sinceLast > 260) {
        if (captureRef.current.length < 12) {
          captureRef.current = [...captureRef.current, degree];
          setCapturedNotes(captureRef.current);
          // hum the note back faintly so the child hears it land
          playNote(rig, PENTA_MIDI[degree], rig.ctx.currentTime + 0.01, 0.3, 0.18);
          setMouthOpen(0.5);
          setTimeout(() => setMouthOpen(0), 160);
        }
        lastDegRef.current = degree;
        lastNoteTimeRef.current = nowMs;
      }
    } else {
      // silence: if we have a melody and ~1.2s of quiet → commit the song
      if (
        captureRef.current.length >= 2 &&
        nowMs - lastNoteTimeRef.current > 1200
      ) {
        const notes = captureRef.current;
        captureRef.current = [];
        lastDegRef.current = -1;
        setCapturedNotes([]);
        const next = addSong(memoryRef.current, notes);
        memoryRef.current = next;
        setMemory(next);
        setMessage(
          `i learned your song! that's ${next.songs.length} now. i'll keep it forever.`,
        );
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // share the idle-rAF with the listen loop: when listening we run tick instead
  useEffect(() => {
    if (!listening) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // resume idle breathing loop
      const animate = () => {
        const t = performance.now() / 1000;
        const g = breatheRef.current;
        if (g) {
          const s = 1 + Math.sin(t * 1.6) * 0.018;
          g.setAttribute(
            "transform",
            `translate(${CX} ${CY}) scale(${s.toFixed(4)}) translate(${-CX} ${-CY})`,
          );
        }
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
    };
  }, [listening, tick]);

  // ── Start: unlock audio inside the gesture, then try mic ──
  const start = useCallback(async () => {
    setPhase("alive");
    if (!rigRef.current) {
      rigRef.current = buildAudioRig();
    }
    await rigRef.current.ctx.resume().catch(() => {});

    // sing back what we already remember right away (hands-free demo)
    singBack(memoryRef.current);

    // try to get the mic (optional — friend lives without it)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = rigRef.current.ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      src.connect(analyser);
      analyserRef.current = analyser;
      setMicError(null);
    } catch {
      setMicError(
        "mic is off — that's ok! your friend will still sing the songs it remembers.",
      );
    }
  }, [singBack]);

  const toggleListen = useCallback(() => {
    if (!analyserRef.current) {
      setMicError("no mic — tap “sing back” to hear remembered songs.");
      return;
    }
    setListening((v) => {
      if (v) {
        // stopping: commit any pending melody
        if (captureRef.current.length >= 2) {
          const notes = captureRef.current;
          captureRef.current = [];
          setCapturedNotes([]);
          setMemory((m) => addSong(m, notes));
        }
        return false;
      }
      captureRef.current = [];
      lastDegRef.current = -1;
      lastNoteTimeRef.current = performance.now();
      setCapturedNotes([]);
      setMessage("i'm listening… sing me anything!");
      return true;
    });
  }, []);

  // ── "pretend it's tomorrow" demo shortcut ──
  const pretendTomorrow = useCallback(() => {
    const next = advanceDay(memoryRef.current);
    memoryRef.current = next;
    setMemory(next);
    setMessage(greeting(next));
    // sing back, now bigger & woven & transposed
    setTimeout(() => singBack(next), 350);
  }, [singBack]);

  // surface cross-day return on real calendar change
  useEffect(() => {
    const stored = loadMemory();
    if (stored && isNewCalendarDay(stored) && stored.songs.length > 0) {
      setMessage(
        `welcome back! it's a new day. you taught me ${stored.songs.length} songs… i remembered!`,
      );
    }
  }, []);

  // ── derived body geometry ──
  const total = memory.songs.length;
  // visible growth: scale up with how much has ever been sung
  const growth = Math.min(1.6, 0.7 + memory.totalNotesEver * 0.02 + memory.day * 0.08);

  const petals = useMemo(() => {
    return memory.songs.map((song, i) => ({
      path: buildPetalPath(song, i, Math.max(total, 1), growth),
      hue: songHue(song),
      day: song.day,
    }));
  }, [memory.songs, total, growth]);

  const bodyR = 34 * growth;
  const eyeOffset = 11 * Math.min(1.3, growth);
  const mouthH = 3 + mouthOpen * 16;

  return (
    <main className="min-h-screen bg-[#0a0710] text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              A Friend Made of Songs
            </h1>
            <p className="mt-1 max-w-prose text-base text-muted-foreground">
              Sing or hum, and your friend grows a new petal shaped like your
              melody. It keeps every song forever and sings them back to you —
              changed — each time you visit.
            </p>
          </div>
          <Link
            href="/dream/549-kids-song-friend/README.md"
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="About this prototype"
          >
            readme
          </Link>
        </header>

        {/* the creature */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-[#16101f] to-[#0a0710]">
          <svg
            viewBox="0 0 400 400"
            className="mx-auto block h-[58vh] max-h-[460px] w-full"
            role="img"
            aria-label="A friendly creature whose body is made from remembered songs"
          >
            <defs>
              <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id="core" cx="50%" cy="42%" r="60%">
                <stop offset="0%" stopColor="#fff5e6" />
                <stop offset="55%" stopColor="#ffd9a8" />
                <stop offset="100%" stopColor="#e9a16b" />
              </radialGradient>
            </defs>

            <g ref={breatheRef}>
              {/* petals = the songs */}
              <g filter="url(#soft)">
                {petals.map((p, i) => {
                  const active = activePetal === i;
                  return (
                    <path
                      key={i}
                      d={p.path}
                      fill={`hsl(${p.hue} 70% ${active ? 68 : 56}% / ${active ? 0.95 : 0.62})`}
                      stroke={`hsl(${p.hue} 85% 78% / 0.8)`}
                      strokeWidth={active ? 2.4 : 1.2}
                      style={{
                        transition: "fill 120ms ease, stroke-width 120ms ease",
                      }}
                    />
                  );
                })}
              </g>

              {/* friendly body */}
              <circle cx={CX} cy={CY} r={bodyR} fill="url(#core)" filter="url(#soft)" />

              {/* face */}
              <g>
                {/* eyes */}
                <circle
                  cx={CX - eyeOffset}
                  cy={CY - 6}
                  r={blink ? 0.6 : 5}
                  fill="#2a1a12"
                  style={{ transition: "r 90ms ease" }}
                />
                <circle
                  cx={CX + eyeOffset}
                  cy={CY - 6}
                  r={blink ? 0.6 : 5}
                  fill="#2a1a12"
                  style={{ transition: "r 90ms ease" }}
                />
                {/* little cheeks */}
                <circle cx={CX - eyeOffset - 4} cy={CY + 6} r={4} fill="#ff9db0" opacity={0.6} />
                <circle cx={CX + eyeOffset + 4} cy={CY + 6} r={4} fill="#ff9db0" opacity={0.6} />
                {/* mouth: opens when it sings */}
                <ellipse
                  cx={CX}
                  cy={CY + 11}
                  rx={6 + mouthOpen * 4}
                  ry={mouthH / 2}
                  fill="#5a2030"
                  style={{ transition: "ry 90ms ease" }}
                />
              </g>
            </g>
          </svg>

          {/* speech bubble */}
          <div className="pointer-events-none absolute left-4 top-4 max-w-[70%] rounded-2xl bg-black/55 px-3 py-2 text-base text-foreground backdrop-blur-sm">
            {message}
          </div>

          {/* live capture readout */}
          {listening && (
            <div className="absolute bottom-4 left-4 flex items-center gap-1.5">
              {capturedNotes.length === 0 ? (
                <span className="text-sm text-muted-foreground">…sing!</span>
              ) : (
                capturedNotes.map((d, i) => (
                  <span
                    key={i}
                    className="inline-block h-3 w-3 rounded-full"
                    style={{
                      background: `hsl(${indexToHue(d)} 75% 62%)`,
                      transform: `translateY(${-(d / (PENTA_COUNT - 1)) * 14}px)`,
                    }}
                  />
                ))
              )}
            </div>
          )}

          <div className="absolute bottom-4 right-4 text-xs text-muted-foreground">
            {total} song{total === 1 ? "" : "s"} · {memory.totalNotesEver} notes ever
            {memory.day > 0 ? ` · visit ${memory.day + 1}` : ""}
          </div>
        </div>

        {/* controls */}
        {phase === "intro" ? (
          <button
            onClick={start}
            className="mx-auto rounded-full bg-violet-500/90 px-6 py-3 text-base font-medium text-foreground shadow-lg shadow-violet-900/40 hover:bg-violet-400"
          >
            ✨ Meet your friend
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={toggleListen}
              className={`rounded-full px-5 py-2.5 text-base font-medium ${
                listening
                  ? "bg-violet-500/85 text-foreground hover:bg-violet-400"
                  : "bg-violet-500/90 text-foreground hover:bg-violet-400"
              }`}
            >
              {listening ? "● stop & keep it" : "🎤 Sing to me"}
            </button>
            <button
              onClick={() => singBack(memoryRef.current)}
              disabled={singingBack || total === 0}
              className="rounded-full bg-violet-500/20 px-5 py-2.5 text-base font-medium text-violet-300/95 hover:bg-violet-500/30 disabled:opacity-40"
            >
              ♫ sing back
            </button>
            <button
              onClick={pretendTomorrow}
              className="rounded-full bg-violet-500/15 px-4 py-2.5 text-base font-medium text-violet-300/95 hover:bg-violet-500/25"
              title="Demo shortcut: jump to the next visit-day"
            >
              ✨ pretend it&apos;s tomorrow
            </button>
          </div>
        )}

        {micError && (
          <p className="text-center text-base text-violet-300">{micError}</p>
        )}

        <p className="mx-auto max-w-prose text-center text-sm text-muted-foreground">
          Each petal is one of your songs — its shape traces the pitches you
          sang, its color comes from the notes. The friend remembers across days
          in your browser. “Pretend it&apos;s tomorrow” is an honest demo shortcut.
        </p>
      </div>
    </main>
  );
}
