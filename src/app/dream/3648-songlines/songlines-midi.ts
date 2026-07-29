/**
 * songlines-midi.ts — Web MIDI input with silent degradation.
 *
 * A real MIDI keyboard should be able to play the atlas: incoming note-on
 * picks the nearest waypoint by pitch and plays it exactly like a computer-key
 * press. Web MIDI is feature-detected; when it is missing or access is denied
 * we do nothing and the computer-keyboard layer carries the whole instrument.
 *
 * The helper is named `runMidiAccess` (not `use*`) so ESLint's hook-naming
 * rule does not mistake it for a React hook.
 */

export interface MidiHandlers {
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  onStatus?: (deviceName: string | null) => void;
}

export interface MidiConnection {
  dispose: () => void;
}

// Minimal structural types — @types/webmidi is not a dependency here.
interface MidiMessageEventLike {
  data: Uint8Array;
}
interface MidiInputLike {
  name?: string;
  onmidimessage: ((e: MidiMessageEventLike) => void) | null;
}
interface MidiAccessLike {
  inputs: Map<string, MidiInputLike>;
  onstatechange: (() => void) | null;
}

export async function runMidiAccess(handlers: MidiHandlers): Promise<MidiConnection | null> {
  const nav = navigator as Navigator & {
    requestMIDIAccess?: () => Promise<MidiAccessLike>;
  };
  if (typeof nav.requestMIDIAccess !== "function") return null;

  let access: MidiAccessLike;
  try {
    access = (await nav.requestMIDIAccess()) as unknown as MidiAccessLike;
  } catch {
    return null;
  }

  const bind = () => {
    let name: string | null = null;
    for (const input of access.inputs.values()) {
      name = input.name ?? "MIDI device";
      input.onmidimessage = (e: MidiMessageEventLike) => {
        const [status, note, velocity] = e.data;
        const cmd = status & 0xf0;
        if (cmd === 0x90 && velocity > 0) {
          handlers.onNoteOn(note, velocity / 127);
        } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
          handlers.onNoteOff(note);
        }
      };
    }
    handlers.onStatus?.(name);
  };

  bind();
  access.onstatechange = bind;

  return {
    dispose: () => {
      for (const input of access.inputs.values()) {
        input.onmidimessage = null;
      }
      access.onstatechange = null;
    },
  };
}
