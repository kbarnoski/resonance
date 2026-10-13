/**
 * WEB MIDI INPUT — Karel's Nord over USB (2026-10-13).
 *
 * In Live Theatre the kiosk hears the Nord on the mic and the particle
 * features GUESS the notes (onset detection + spectrum). With the Nord's USB
 * MIDI they get the truth: exact note numbers, velocities, note-off timing and
 * the sustain pedal (CC64). The features read it through
 * src/lib/particles/midi-drive.ts (audio stays the fallback).
 *
 * Two parts:
 *  - MidiState: the PURE state core (no browser): held notes (note → velocity,
 *    onset time, source), the sustain pedal (per source), a small ring of
 *    recent note-ons with a sequence number (consumers keep a cursor), and a
 *    tiny event bus. Fully testable (midi-input.test.ts).
 *  - startMidiInput(): the browser layer. Asks for Web MIDI ONCE per page
 *    (no sysex), merges every input, follows hot-plug (statechange): a
 *    disconnected input's held notes + pedal are released at once, a new one
 *    is attached. Denied / unavailable → stays silent (the features keep
 *    their audio guesses). Never prompts in a loop.
 *
 * Active only where asked: Live Theatre calls startMidiInput() on entry, and
 * the lab can opt in with `?midi=1` (midiRequestedByUrl). Elsewhere nothing
 * here runs and getMidiState() is null.
 */

export const MIDI_TUNING = {
  /** the sustain pedal controller (CC64); ≥ 64 = down */
  SUSTAIN_CC: 64,
  SUSTAIN_ON: 64,
  /** recent note-ons kept (ring) */
  RING: 64,
  /** notes-per-minute window (ms) */
  RATE_WINDOW_MS: 60_000,
} as const;

const M = MIDI_TUNING;

export interface HeldNote {
  note: number;
  /** 1..127 */
  velocity: number;
  /** ms (the caller's clock — performance.now in the browser) */
  at: number;
  /** input id (hot-unplug releases only that input's notes) */
  source: string;
}

export interface NoteOnEvent {
  seq: number;
  note: number;
  velocity: number;
  at: number;
}

export type MidiEvent =
  | { type: "noteon"; note: number; velocity: number; at: number; source: string }
  | { type: "noteoff"; note: number; at: number; source: string }
  | { type: "pedal"; down: boolean; at: number; source: string }
  | { type: "devices"; names: string[] };

export class MidiState {
  readonly held = new Map<number, HeldNote>();
  private readonly pedalBy = new Map<string, boolean>();
  private readonly ring: NoteOnEvent[] = [];
  private readonly listeners = new Set<(e: MidiEvent) => void>();
  /** sequence number of the last note-on (0 = none yet) */
  seq = 0;
  /** ms of the last note-on / note-off / pedal change (-Infinity = never) */
  lastActivityAt = -Infinity;
  /** ms of the last note-on (-Infinity = never) */
  lastNoteOnAt = -Infinity;
  /** connected input names (for the status line) */
  devices: string[] = [];

  get pedal(): boolean {
    for (const v of this.pedalBy.values()) if (v) return true;
    return false;
  }

  on(fn: (e: MidiEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(e: MidiEvent): void {
    for (const fn of this.listeners) {
      try { fn(e); } catch { /* a listener never breaks the input */ }
    }
  }

  noteOn(note: number, velocity: number, at: number, source = "in"): void {
    if (!Number.isFinite(note) || note < 0 || note > 127) return;
    if (velocity <= 0) { this.noteOff(note, at, source); return; } // running-status note-off
    const v = Math.max(1, Math.min(127, velocity | 0));
    this.held.set(note, { note, velocity: v, at, source });
    this.seq++;
    this.ring.push({ seq: this.seq, note, velocity: v, at });
    if (this.ring.length > M.RING) this.ring.shift();
    this.lastActivityAt = this.lastNoteOnAt = at;
    this.emit({ type: "noteon", note, velocity: v, at, source });
  }

  noteOff(note: number, at: number, source = "in"): void {
    if (!this.held.has(note)) return;
    this.held.delete(note);
    this.lastActivityAt = at;
    this.emit({ type: "noteoff", note, at, source });
  }

  setPedal(down: boolean, at: number, source = "in"): void {
    const was = this.pedal;
    this.pedalBy.set(source, down);
    this.lastActivityAt = at;
    if (this.pedal !== was) this.emit({ type: "pedal", down: this.pedal, at, source });
  }

  /** Parse one raw MIDI message (any channel). Sysex / clock / others ignored. */
  handleMessage(data: ArrayLike<number> | null | undefined, at: number, source = "in"): void {
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const d1 = data[1] & 0x7f;
    const d2 = data.length > 2 ? data[2] & 0x7f : 0;
    if (status === 0x90) this.noteOn(d1, d2, at, source);
    else if (status === 0x80) this.noteOff(d1, at, source);
    else if (status === 0xb0) {
      if (d1 === M.SUSTAIN_CC) this.setPedal(d2 >= M.SUSTAIN_ON, at, source);
      // all notes off / all sound off: release that input
      else if (d1 === 123 || d1 === 120) this.releaseSource(source, at, false);
    }
  }

  /** Release everything one input holds (hot-unplug, all-notes-off). */
  releaseSource(source: string, at: number, pedalToo = true): void {
    for (const [note, h] of [...this.held]) if (h.source === source) this.noteOff(note, at, source);
    if (pedalToo && this.pedalBy.has(source)) {
      const was = this.pedal;
      this.pedalBy.delete(source);
      if (this.pedal !== was) this.emit({ type: "pedal", down: this.pedal, at, source });
    }
  }

  /** Release every note + the pedal (all inputs gone). */
  clear(at: number): void {
    for (const note of [...this.held.keys()]) this.noteOff(note, at, this.held.get(note)!.source);
    const was = this.pedal;
    this.pedalBy.clear();
    if (was) this.emit({ type: "pedal", down: false, at, source: "*" });
  }

  setDevices(names: string[]): void {
    this.devices = [...names];
    this.emit({ type: "devices", names: this.devices });
  }

  /** Note-ons after `cursor` (a seq), oldest first. Allocation-free when none. */
  noteOnsSince(cursor: number): readonly NoteOnEvent[] {
    if (cursor >= this.seq) return EMPTY;
    const out: NoteOnEvent[] = [];
    for (const e of this.ring) if (e.seq > cursor) out.push(e);
    return out;
  }

  /** Note-ons per minute over the last RATE_WINDOW_MS (from the ring). */
  notesPerMinute(now: number): number {
    let n = 0, oldest = now;
    for (const e of this.ring) if (now - e.at <= M.RATE_WINDOW_MS) { n++; oldest = Math.min(oldest, e.at); }
    if (n === 0) return 0;
    // a full ring under-reads a fast passage: scale by the span it covers
    const span = n >= M.RING ? Math.max(1000, now - oldest) : M.RATE_WINDOW_MS;
    return Math.round((n * 60_000) / span);
  }
}

const EMPTY: readonly NoteOnEvent[] = Object.freeze([]);

/** One status line for the operator / phone remote. */
export function midiStatusLine(
  access: MidiAccessState,
  state: Pick<MidiState, "devices" | "notesPerMinute"> | null,
  now: number,
): string | null {
  if (access === "off") return null;
  if (access === "pending") return "MIDI: asking…";
  if (access === "unavailable") return "MIDI: not available (listening on mic)";
  if (access === "denied") return "MIDI: blocked (listening on mic)";
  if (!state || state.devices.length === 0) return "MIDI: no keyboard (listening on mic)";
  const name = state.devices.length === 1 ? shortName(state.devices[0]) : `${state.devices.length} inputs`;
  return `MIDI: ${name} connected · ${state.notesPerMinute(now)} notes/min`;
}

function shortName(n: string): string {
  const s = n.trim();
  return s.length > 28 ? `${s.slice(0, 27)}…` : s || "keyboard";
}

// ─── the browser layer ──────────────────────────────────────────────────────

export type MidiAccessState = "off" | "pending" | "ready" | "denied" | "unavailable";

let state: MidiState | null = null;
let access: MidiAccessState = "off";
let started: Promise<boolean> | null = null;

/** The live MIDI state, or null when MIDI was never started on this page. */
export function getMidiState(): MidiState | null {
  return state;
}

export function midiAccessState(): MidiAccessState {
  return access;
}

/** `?midi=1` — the lab opt-in. */
export function midiRequestedByUrl(search?: string): boolean {
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    return new URLSearchParams(s).get("midi") === "1";
  } catch { return false; }
}

function publishStatus(): void {
  if (typeof window === "undefined") return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  (window as unknown as Record<string, unknown>).__resonanceMidiStatus = midiStatusLine(access, state, now);
}

/** Current status line (also mirrored on window.__resonanceMidiStatus). */
export function midiStatus(): string | null {
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  return midiStatusLine(access, state, now);
}

interface MidiInputLike {
  id: string;
  name?: string | null;
  state?: string;
  onmidimessage: ((e: { data: Uint8Array | null; timeStamp?: number }) => void) | null;
}
interface MidiAccessLike {
  inputs: { forEach(cb: (i: MidiInputLike) => void): void };
  onstatechange: ((e: { port?: { id: string; type?: string; state?: string } | null }) => void) | null;
}

/**
 * Ask for Web MIDI ONCE per page and merge every input into the live state.
 * Resolves true when access was granted (even with no keyboard plugged in —
 * hot-plug attaches it later), false when denied / unavailable. Safe to call
 * again: returns the first call's promise.
 */
export function startMidiInput(onEvent?: (msg: string) => void): Promise<boolean> {
  if (started) return started;
  state = state ?? new MidiState();
  const st = state;
  access = "pending";
  publishStatus();
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<unknown> }) : null;
  if (!nav || typeof nav.requestMIDIAccess !== "function") {
    access = "unavailable";
    publishStatus();
    started = Promise.resolve(false);
    return started;
  }
  started = nav.requestMIDIAccess({ sysex: false }).then(
    (raw) => {
      const ma = raw as MidiAccessLike;
      access = "ready";
      const attached = new Map<string, MidiInputLike>();
      const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
      const sync = () => {
        const live = new Map<string, MidiInputLike>();
        ma.inputs.forEach((i) => { if (i.state !== "disconnected") live.set(i.id, i); });
        for (const [id, inp] of attached) {
          if (!live.has(id)) {
            // hot-unplug: release that input's notes + pedal at once
            st.releaseSource(id, now());
            try { inp.onmidimessage = null; } catch { /* port gone */ }
            attached.delete(id);
            onEvent?.(`midi-unplug ${inp.name ?? id}`);
          }
        }
        for (const [id, inp] of live) {
          if (attached.has(id)) continue;
          // messages are stamped on arrival (performance.now) — the features'
          // clock; the event's own timeStamp is the same timeline in browsers
          inp.onmidimessage = (e) => st.handleMessage(e.data, now(), id);
          attached.set(id, inp);
          onEvent?.(`midi-plug ${inp.name ?? id}`);
        }
        st.setDevices([...attached.values()].map((i) => i.name ?? "MIDI input"));
        publishStatus();
      };
      ma.onstatechange = (e) => { if (!e.port || e.port.type !== "output") sync(); };
      sync();
      return true;
    },
    () => {
      access = "denied";
      publishStatus();
      return false;
    },
  );
  if (typeof window !== "undefined") {
    // keep the status line's notes/min current for the remote (cheap)
    setInterval(publishStatus, 2_000);
  }
  return started;
}

/** Tests only: forget the browser singleton. */
export function __resetMidiForTests(): void {
  state = null;
  access = "off";
  started = null;
}
