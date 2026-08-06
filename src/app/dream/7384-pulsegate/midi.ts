/**
 * 7384 · Pulsegate — Web MIDI wiring.
 *
 * Note-on velocity feeds the tension accumulator; CC1 (mod wheel) feeds the
 * riser / filter-sweep amount; pitch-bend is optional color on the lead
 * voice. Absent MIDI, denied permission, or no connected input, this
 * resolves to a status string and the caller falls back to keyboard input
 * and the seeded auto-DJ — never a thrown error.
 */

export type MidiStatus = "unsupported" | "denied" | "waiting" | "connected";

export interface MidiHandlers {
  onNote: (midi: number, vel: number) => void;
  onCC1: (value: number) => void; // 0..1
  onPitchBend: (semitones: number) => void; // -2..2
  onStatus: (status: MidiStatus) => void;
}

export interface MidiHandle {
  dispose: () => void;
}

export function runMidiAccess(handlers: MidiHandlers): MidiHandle {
  let disposed = false;
  let access: MIDIAccess | null = null;

  if (typeof navigator === "undefined" || typeof navigator.requestMIDIAccess !== "function") {
    handlers.onStatus("unsupported");
    return { dispose: () => {} };
  }

  const onMessage = (ev: MIDIMessageEvent) => {
    const data = ev.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;
    if (status === 0x90 && d2 > 0) {
      handlers.onNote(d1, d2 / 127);
    } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
      // note-off — ignored; voices are fixed-envelope stabs, not sustained.
    } else if (status === 0xb0 && d1 === 1) {
      handlers.onCC1(d2 / 127);
    } else if (status === 0xe0) {
      const raw = ((d2 << 7) | d1) - 8192; // 14-bit, centered on 0
      handlers.onPitchBend((raw / 8192) * 2); // +/- 2 semitones
    }
  };

  const wire = (a: MIDIAccess) => {
    a.inputs.forEach((input) => {
      input.onmidimessage = onMessage;
    });
    a.onstatechange = () => {
      a.inputs.forEach((input) => {
        input.onmidimessage = onMessage;
      });
    };
  };

  handlers.onStatus("waiting");
  navigator
    .requestMIDIAccess()
    .then((a) => {
      if (disposed) return;
      access = a;
      wire(a);
      handlers.onStatus(a.inputs.size > 0 ? "connected" : "waiting");
    })
    .catch(() => {
      if (!disposed) handlers.onStatus("denied");
    });

  return {
    dispose: () => {
      disposed = true;
      if (access) {
        access.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
        access.onstatechange = null;
      }
    },
  };
}
