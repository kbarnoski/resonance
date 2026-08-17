// ─────────────────────────────────────────────────────────────────────────────
// 14656 · answerback / midi.ts — the live-input layer. Web MIDI FIRST (Karel is
// a pianist; MIDI is his instrument), with an always-live computer-keyboard
// fallback so the duet is playable on any machine with no hardware at all.
//
// We never lean on the WebMIDI type-lib being present at runtime: we feature-
// check `navigator.requestMIDIAccess` and read minimal message shapes. Only
// note ONSETS matter for phrase capture, but we track note-offs too so a held
// chord doesn't retrigger.
// ─────────────────────────────────────────────────────────────────────────────

export interface InputCallbacks {
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
  onStatus: (label: string, hasMidiDevice: boolean) => void;
}

// A single computer-keyboard row → one chromatic-ish octave, plus a lower row
// for reach. a=C4 upward; the qwerty row above carries the sharps.
const KEY_MAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67,
  y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75,
  z: 48, x: 50, c: 52, v: 53, b: 55, n: 57, m: 59,
};

/**
 * Wire up live input. Returns a disposer. Web MIDI is requested and, when a
 * device is present, its note messages drive the piece; the computer keyboard
 * is ALWAYS live in parallel so the page is never dead. The status badge
 * reflects the best available input.
 */
export function runInput(cb: InputCallbacks): () => void {
  const held = new Set<number>();
  let disposed = false;
  let access: MIDIAccess | null = null;

  const keydown = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const midi = KEY_MAP[e.key.toLowerCase()];
    if (midi === undefined || held.has(midi)) return;
    held.add(midi);
    cb.onNoteOn(midi, 96);
    e.preventDefault();
  };
  const keyup = (e: KeyboardEvent) => {
    const midi = KEY_MAP[e.key.toLowerCase()];
    if (midi === undefined) return;
    held.delete(midi);
    cb.onNoteOff(midi);
  };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);

  const handleMessage = (e: MIDIMessageEvent) => {
    const d = e.data;
    if (!d || d.length < 3) return;
    const status = d[0] & 0xf0;
    const note = d[1];
    const vel = d[2];
    if (status === 0x90 && vel > 0) cb.onNoteOn(note, vel);
    else if (status === 0x80 || (status === 0x90 && vel === 0))
      cb.onNoteOff(note);
  };

  const wireInputs = (a: MIDIAccess) => {
    let name: string | null = null;
    for (const [, input] of a.inputs) {
      input.onmidimessage = handleMessage;
      if (!name) name = input.name;
    }
    if (name) cb.onStatus(`MIDI · ${name}`, true);
    else cb.onStatus("computer keyboard (no MIDI device)", false);
  };

  const nav = navigator as Navigator & {
    requestMIDIAccess?: (opts?: MIDIOptions) => Promise<MIDIAccess>;
  };
  if (typeof nav.requestMIDIAccess === "function") {
    nav
      .requestMIDIAccess({ sysex: false })
      .then((a) => {
        if (disposed) return;
        access = a;
        wireInputs(a);
        a.onstatechange = () => {
          if (!disposed) wireInputs(a);
        };
      })
      .catch(() => {
        if (!disposed) cb.onStatus("computer keyboard (MIDI blocked)", false);
      });
  } else {
    cb.onStatus("computer keyboard (no MIDI in this browser)", false);
  }

  return () => {
    disposed = true;
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    if (access) {
      for (const [, input] of access.inputs) input.onmidimessage = null;
      access.onstatechange = null;
    }
  };
}

export { KEY_MAP };
