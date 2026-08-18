// ─────────────────────────────────────────────────────────────────────────────
// 15312 · transcript / midi.ts — the OPTIONAL human-inject layer.
//
// The transcript fully self-propels with no input device. But a visitor CAN
// interject: a computer-keyboard row (Web MIDI too, when present) lets them play
// a short phrase that becomes the next query — a human turn rendered as a
// distinct "you" line in the log. Onsets are all that matter for phrase capture;
// note-offs are tracked only so a held key doesn't retrigger.
// ─────────────────────────────────────────────────────────────────────────────

export interface InputCallbacks {
  onNoteOn: (midi: number, velocity: number) => void;
  onStatus: (label: string, hasMidiDevice: boolean) => void;
}

// a s d f g h j k l = a diatonic-ish octave; the row above carries sharps;
// z x c v b n m a lower octave for reach.
const KEY_MAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67,
  y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75,
  z: 48, x: 50, c: 52, v: 53, b: 55, n: 57, m: 59,
};

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
  };

  const wireInputs = (a: MIDIAccess) => {
    let name: string | null = null;
    for (const [, input] of a.inputs) {
      input.onmidimessage = handleMessage;
      if (!name) name = input.name;
    }
    if (name) cb.onStatus(`MIDI · ${name}`, true);
    else cb.onStatus("computer keyboard", false);
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
        if (!disposed) cb.onStatus("computer keyboard", false);
      });
  } else {
    cb.onStatus("computer keyboard", false);
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
