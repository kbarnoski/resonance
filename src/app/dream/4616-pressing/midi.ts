/**
 * 4616 · Pressing — Web MIDI wiring (2026 frontier).
 *
 * Reads note-on velocity as the etch depth of each cut. Where a controller
 * speaks MPE 1.1 — per-note continuous expression via channel pressure (0xD0)
 * or polyphonic aftertouch (0xA0) — that per-note investment deepens the
 * groove wiggle. It is exactly the thing you cannot take back once it is cut.
 * Absent MIDI or denied permission, this resolves to a status and the piece
 * runs on keyboard + auto-take with no thrown error.
 */

export type MidiStatus =
  | "unsupported"
  | "denied"
  | "waiting"
  | "connected"
  | "connected-mpe";

export interface MidiHandlers {
  onNote: (midi: number, vel: number) => void;
  onPressure: (value: number) => void; // 0..1, MPE/aftertouch
  onStatus: (status: MidiStatus) => void;
}

export interface MidiHandle {
  dispose: () => void;
}

export function runMidiAccess(handlers: MidiHandlers): MidiHandle {
  let disposed = false;
  let access: MIDIAccess | null = null;
  let sawMpe = false;

  const nav = navigator as Navigator & {
    requestMIDIAccess?: () => Promise<MIDIAccess>;
  };

  if (typeof nav.requestMIDIAccess !== "function") {
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
    } else if (status === 0xd0) {
      // Channel pressure — MPE per-note expression.
      if (!sawMpe) {
        sawMpe = true;
        handlers.onStatus("connected-mpe");
      }
      handlers.onPressure(d1 / 127);
    } else if (status === 0xa0) {
      // Polyphonic aftertouch.
      if (!sawMpe) {
        sawMpe = true;
        handlers.onStatus("connected-mpe");
      }
      handlers.onPressure(d2 / 127);
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
  nav
    .requestMIDIAccess()
    .then((a) => {
      if (disposed) return;
      access = a;
      wire(a);
      const count = a.inputs.size;
      handlers.onStatus(count > 0 ? "connected" : "waiting");
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
