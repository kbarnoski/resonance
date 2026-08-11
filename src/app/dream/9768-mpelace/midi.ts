// ─────────────────────────────────────────────────────────────────────────────
// 9768-mpelace — midi.ts
//
// MPE (MIDI Polyphonic Expression) MIDI-OUT. Master channel 1, member
// channels 2–16 round-robin so every held note owns its own channel and can
// carry an exact per-note pitch-bend for the microtonal remainder that a
// single 12-TET note-number can't express (MPE spec, mpe.zone; per-note
// pitch-bend is the whole mechanism that makes this instrument's tuning
// exact rather than "nearest semitone").
//
// Feature-detected: on a browser/OS without Web MIDI this module degrades to
// a no-op that still reports the channel/bend14 it WOULD have sent, so the
// on-screen readout stays legible with no hardware attached.
// ─────────────────────────────────────────────────────────────────────────────

const MEMBER_CHANNELS: number[] = Array.from({ length: 15 }, (_, i) => i + 1); // MIDI ch 2..16 (0-indexed 1..15)
const MASTER_CHANNEL = 0; // MIDI ch 1

export interface MpeSendInfo {
  channel: number; // 1..16, human-readable
  bend14: number; // 0..16383, the raw 14-bit pitch-bend value
  midiNote: number;
}

export interface MpeOutput {
  id: string;
  name: string;
}

type MidiAccessLike = MIDIAccess;

function hasWebMidi(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
}

/** Request MIDI access. Resolves to null if unsupported or denied — never throws. */
export async function requestMidiAccess(): Promise<MidiAccessLike | null> {
  const nav = navigator as Navigator & {
    requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<MIDIAccess>;
  };
  if (!hasWebMidi() || !nav.requestMIDIAccess) return null;
  try {
    return await nav.requestMIDIAccess({ sysex: false });
  } catch {
    return null;
  }
}

export function listOutputs(access: MidiAccessLike | null): MpeOutput[] {
  if (!access) return [];
  const out: MpeOutput[] = [];
  access.outputs.forEach((o: MIDIOutput) => out.push({ id: o.id, name: o.name || o.id }));
  return out;
}

function clampBend14(bendSemitones: number): number {
  const raw = 8192 + Math.round((bendSemitones / 48) * 8192);
  return Math.min(16383, Math.max(0, raw));
}

/** MPE round-robin note-channel manager + a real Web MIDI output writer.
 *  When `output` is null (no device / Web MIDI unavailable) every call is a
 *  pure computation: it still returns the {channel, bend14} it WOULD send,
 *  so the UI readout stays truthful with nothing plugged in. */
export class MpeVoicePool {
  private output: MIDIOutput | null = null;
  private freeQueue: number[] = [...MEMBER_CHANNELS];
  private activeOrder: string[] = [];
  private activeByNote = new Map<string, { channel: number; midiNote: number }>();

  setOutput(output: MIDIOutput | null): void {
    this.allNotesOff();
    this.output = output;
    if (output) this.initChannels();
  }

  private send(bytes: number[]): void {
    if (!this.output) return;
    try {
      this.output.send(bytes);
    } catch {
      /* device may have just been unplugged — ignore */
    }
  }

  /** RPN pitch-bend range ±48 semitones on every member channel, plus the
   *  MPE Configuration Message on the master channel assigning 15 members. */
  private initChannels(): void {
    for (const ch of [MASTER_CHANNEL, ...MEMBER_CHANNELS]) {
      this.send([0xb0 | ch, 101, 0]);
      this.send([0xb0 | ch, 100, 0]);
      this.send([0xb0 | ch, 6, 48]);
      this.send([0xb0 | ch, 38, 0]);
    }
    // MPE Configuration Message (MCM): master ch1 claims 15 member channels.
    this.send([0xb0 | MASTER_CHANNEL, 101, 0]);
    this.send([0xb0 | MASTER_CHANNEL, 100, 6]);
    this.send([0xb0 | MASTER_CHANNEL, 6, 15]);
    this.send([0xb0 | MASTER_CHANNEL, 38, 0]);
  }

  /** Start a note. `id` is any caller-chosen key (e.g. "col,row" or a pointerId).
   *  Returns the channel/bend14 actually used (or that would be used, if
   *  no device is attached) so the UI can show the live MPE mechanism. */
  noteOn(id: string, midiNote: number, bendSemitones: number, velocity: number): MpeSendInfo {
    this.noteOff(id); // guard against a stuck duplicate id
    let channel: number;
    if (this.freeQueue.length > 0) {
      channel = this.freeQueue.shift() as number;
    } else {
      // voice-steal the oldest held note's channel
      const oldestId = this.activeOrder.shift();
      const oldest = oldestId ? this.activeByNote.get(oldestId) : undefined;
      channel = oldest ? oldest.channel : MEMBER_CHANNELS[0];
      if (oldestId) {
        this.send([0x80 | channel, oldest ? oldest.midiNote : 0, 0]);
        this.activeByNote.delete(oldestId);
      }
    }
    const bend14 = clampBend14(bendSemitones);
    const lo = bend14 & 0x7f;
    const hi = (bend14 >> 7) & 0x7f;
    const vel = Math.min(127, Math.max(1, Math.round(velocity * 127)));

    this.send([0xe0 | channel, lo, hi]); // pitch-bend BEFORE note-on
    this.send([0x90 | channel, midiNote, vel]);

    this.activeByNote.set(id, { channel, midiNote });
    this.activeOrder.push(id);
    return { channel: channel + 1, bend14, midiNote };
  }

  noteOff(id: string): void {
    const entry = this.activeByNote.get(id);
    if (!entry) return;
    this.send([0x80 | entry.channel, entry.midiNote, 0]);
    this.activeByNote.delete(id);
    const idx = this.activeOrder.indexOf(id);
    if (idx >= 0) this.activeOrder.splice(idx, 1);
    if (!this.freeQueue.includes(entry.channel)) this.freeQueue.push(entry.channel);
  }

  /** All-notes-off + bend-reset on every member channel. Call on teardown,
   *  device switch, or disable. */
  allNotesOff(): void {
    for (const ch of MEMBER_CHANNELS) {
      this.send([0xb0 | ch, 123, 0]); // CC123 all notes off
      this.send([0xe0 | ch, 0, 64]); // bend reset to center (8192)
    }
    this.freeQueue = [...MEMBER_CHANNELS];
    this.activeOrder = [];
    this.activeByNote.clear();
  }

  dispose(): void {
    this.allNotesOff();
    this.output = null;
  }
}

export function webMidiSupported(): boolean {
  return hasWebMidi();
}
