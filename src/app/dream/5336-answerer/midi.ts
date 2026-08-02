// ════════════════════════════════════════════════════════════════════════════
// midi.ts — Web MIDI input (the star), with a clean status/teardown surface.
//
// The on-screen keyboard and the seeded auto-performance live in page.tsx; this
// module is purely the hardware bridge. It attaches to every input, routes
// note-on / note-off to callbacks, and reports a human-readable status string.
// ════════════════════════════════════════════════════════════════════════════

export interface MidiResult {
  ok: boolean;
  message: string;
}

export interface MidiController {
  supported: boolean;
  connect: () => Promise<MidiResult>;
  dispose: () => void;
}

type NoteOn = (midi: number, velocity: number) => void;
type NoteOff = (midi: number) => void;

export function createMidiController(
  onNoteOn: NoteOn,
  onNoteOff: NoteOff,
  onStatus: (msg: string, ok: boolean) => void
): MidiController {
  const nav = navigator as Navigator & {
    requestMIDIAccess?: () => Promise<MIDIAccess>;
  };
  const supported = typeof nav.requestMIDIAccess === "function";

  let access: MIDIAccess | null = null;

  const handler = (e: MIDIMessageEvent) => {
    const data = e.data;
    if (!data || data.length < 3) return;
    const [status, note, vel] = data;
    const cmd = status & 0xf0;
    if (cmd === 0x90 && vel > 0) onNoteOn(note, vel);
    else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) onNoteOff(note);
  };

  function attachAll(a: MIDIAccess): number {
    let count = 0;
    a.inputs.forEach((inp) => {
      inp.onmidimessage = handler;
      count++;
    });
    return count;
  }

  function describe(a: MIDIAccess): string {
    const names: string[] = [];
    a.inputs.forEach((inp) => {
      if (inp.name) names.push(inp.name);
    });
    return names.length ? names.join(", ") : "MIDI device";
  }

  return {
    supported,
    async connect() {
      if (!supported) {
        return {
          ok: false,
          message: "Web MIDI unavailable — use the keys below",
        };
      }
      try {
        access = await nav.requestMIDIAccess!();
        const count = attachAll(access);
        access.onstatechange = () => {
          if (!access) return;
          const n = attachAll(access);
          if (n > 0) onStatus(`MIDI: ${describe(access)}`, true);
          else onStatus("No MIDI inputs — use the keys below", false);
        };
        if (count > 0) {
          return { ok: true, message: `MIDI: ${describe(access)}` };
        }
        return {
          ok: false,
          message: "No MIDI inputs found — use the keys below",
        };
      } catch {
        return {
          ok: false,
          message: "MIDI access denied — use the keys below",
        };
      }
    },
    dispose() {
      if (access) {
        access.inputs.forEach((inp) => (inp.onmidimessage = null));
        access.onstatechange = null;
        access = null;
      }
    },
  };
}
