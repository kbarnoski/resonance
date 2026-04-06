import type { NoteEvent, ChordEvent, MusicalEvent } from "./types";

/**
 * Detect musical events from existing note/chord analysis data.
 * No new audio decoding — works entirely from transcribed notes and chords.
 */
export function detectEvents(
  notes: NoteEvent[],
  chords: ChordEvent[],
  tempo: number | null
): MusicalEvent[] {
  if (notes.length === 0) return [];

  const events: MusicalEvent[] = [];
  const maxTime = Math.max(...notes.map((n) => n.time + n.duration));

  events.push(...detectBassHits(notes, maxTime));
  events.push(...detectTextureChanges(notes, maxTime));
  events.push(...detectClimaxes(notes, maxTime));
  events.push(...detectDrops(notes, maxTime));
  events.push(...detectNewIdeas(notes, chords));

  return postProcess(events, maxTime);
}

// ── Bass hits: sudden low-register energy spikes ──

function detectBassHits(notes: NoteEvent[], maxTime: number): MusicalEvent[] {
  const WINDOW = 0.5;
  const DEBOUNCE = 2.0;
  const events: MusicalEvent[] = [];

  // Compute bass velocity per window
  const windows: { time: number; velocity: number }[] = [];
  for (let t = 0; t < maxTime; t += WINDOW) {
    const windowEnd = t + WINDOW;
    let bassVel = 0;
    let count = 0;
    for (const n of notes) {
      if (n.midi < 48 && n.time >= t && n.time < windowEnd) {
        bassVel += n.velocity;
        count++;
      }
    }
    windows.push({ time: t, velocity: bassVel });
  }

  // Moving average (8-window = 4s lookback)
  const MA_LEN = 8;
  let lastFired = -DEBOUNCE;

  for (let i = MA_LEN; i < windows.length; i++) {
    let maSum = 0;
    for (let j = i - MA_LEN; j < i; j++) maSum += windows[j].velocity;
    const ma = maSum / MA_LEN;

    if (ma > 0 && windows[i].velocity > ma * 1.5 && windows[i].time - lastFired >= DEBOUNCE) {
      const intensity = Math.min(1, windows[i].velocity / (ma * 3));
      events.push({
        time: windows[i].time,
        type: "bass_hit",
        intensity: Math.max(0.4, intensity),
        label: "Deep bass impact",
      });
      lastFired = windows[i].time;
    }
  }

  return events;
}

// ── Texture changes: polyphony shifts ──

function detectTextureChanges(notes: NoteEvent[], maxTime: number): MusicalEvent[] {
  const WINDOW = 1.0;
  const events: MusicalEvent[] = [];

  // Count simultaneous notes per window
  const densities: { time: number; count: number }[] = [];
  for (let t = 0; t < maxTime; t += WINDOW) {
    const windowEnd = t + WINDOW;
    let count = 0;
    for (const n of notes) {
      if (n.time < windowEnd && n.time + n.duration > t) count++;
    }
    densities.push({ time: t, count });
  }

  for (let i = 1; i < densities.length; i++) {
    const prev = densities[i - 1].count;
    const curr = densities[i].count;
    if (prev === 0) continue;

    const change = Math.abs(curr - prev) / prev;
    if (change > 0.4) {
      const thickens = curr > prev;
      events.push({
        time: densities[i].time,
        type: "texture_change",
        intensity: Math.min(1, change / 1.5),
        label: thickens ? "Texture thickens" : "Texture thins",
      });
    }
  }

  return events;
}

// ── Climaxes: peak energy moments ──

function detectClimaxes(notes: NoteEvent[], maxTime: number): MusicalEvent[] {
  const WINDOW = 2.0;
  const MIN_APART = 15.0;
  const events: MusicalEvent[] = [];

  // RMS energy per window (velocity * duration weighted)
  const energies: { time: number; energy: number }[] = [];
  for (let t = 0; t < maxTime; t += WINDOW) {
    const windowEnd = t + WINDOW;
    let energy = 0;
    for (const n of notes) {
      if (n.time < windowEnd && n.time + n.duration > t) {
        const overlap = Math.min(windowEnd, n.time + n.duration) - Math.max(t, n.time);
        energy += n.velocity * overlap;
      }
    }
    energies.push({ time: t, energy });
  }

  if (energies.length < 3) return events;

  // Find 80th percentile threshold
  const sorted = [...energies.map((e) => e.energy)].sort((a, b) => a - b);
  const p80 = sorted[Math.floor(sorted.length * 0.8)];

  // Find local maxima above threshold
  let lastClimax = -MIN_APART;
  for (let i = 1; i < energies.length - 1; i++) {
    const e = energies[i];
    if (
      e.energy > p80 &&
      e.energy >= energies[i - 1].energy &&
      e.energy >= energies[i + 1].energy &&
      e.time - lastClimax >= MIN_APART
    ) {
      const maxEnergy = sorted[sorted.length - 1];
      const intensity = maxEnergy > 0 ? Math.min(1, e.energy / maxEnergy) : 0.8;
      events.push({
        time: e.time,
        type: "climax",
        intensity: Math.max(0.6, intensity),
        label: "Peak intensity",
      });
      lastClimax = e.time;
    }
  }

  return events;
}

// ── Drops / silence: energy dips ──

function detectDrops(notes: NoteEvent[], maxTime: number): MusicalEvent[] {
  const WINDOW = 2.0;
  const events: MusicalEvent[] = [];

  // Total velocity per window
  const velocities: { time: number; vel: number }[] = [];
  for (let t = 0; t < maxTime; t += WINDOW) {
    const windowEnd = t + WINDOW;
    let vel = 0;
    for (const n of notes) {
      if (n.time >= t && n.time < windowEnd) vel += n.velocity;
    }
    velocities.push({ time: t, vel });
  }

  if (velocities.length < 3) return events;

  // Compute percentiles
  const sorted = [...velocities.map((v) => v.vel)].sort((a, b) => a - b);
  const p20 = sorted[Math.floor(sorted.length * 0.2)];
  const p50 = sorted[Math.floor(sorted.length * 0.5)];

  for (let i = 1; i < velocities.length; i++) {
    const prev = velocities[i - 1];
    const curr = velocities[i];

    // Drop: was above 50th, now below 20th
    if (prev.vel > p50 && curr.vel <= p20) {
      const isSilence = curr.vel === 0;
      events.push({
        time: curr.time,
        type: isSilence ? "silence" : "drop",
        intensity: isSilence ? 0.9 : 0.7,
        label: isSilence ? "Silence" : "Energy drop",
      });
    }
  }

  // Also detect note gaps > 0.5s
  const sortedNotes = [...notes].sort((a, b) => a.time - b.time);
  for (let i = 1; i < sortedNotes.length; i++) {
    const gap = sortedNotes[i].time - (sortedNotes[i - 1].time + sortedNotes[i - 1].duration);
    if (gap > 0.5) {
      events.push({
        time: sortedNotes[i - 1].time + sortedNotes[i - 1].duration,
        type: "silence",
        intensity: Math.min(1, 0.5 + gap / 4),
        label: "Breath",
      });
    }
  }

  return events;
}

// ── New idea: register/harmonic shifts ──

function detectNewIdeas(notes: NoteEvent[], chords: ChordEvent[]): MusicalEvent[] {
  const events: MusicalEvent[] = [];

  // Melody jumps > 7 semitones (from top voice)
  const sortedByTime = [...notes].sort((a, b) => a.time - b.time);
  let prevMidi = -1;
  let prevTime = -1;
  for (const n of sortedByTime) {
    if (prevMidi >= 0) {
      const interval = Math.abs(n.midi - prevMidi);
      if (interval > 7 && n.time - prevTime > 0.1) {
        events.push({
          time: n.time,
          type: "new_idea",
          intensity: Math.min(1, interval / 14),
          label: "Melodic leap",
        });
      }
    }
    prevMidi = n.midi;
    prevTime = n.time;
  }

  // New chord progression not previously seen
  if (chords.length >= 3) {
    const seen = new Set<string>();
    for (let i = 0; i < chords.length - 2; i++) {
      const seq = `${chords[i].chord}|${chords[i + 1].chord}|${chords[i + 2].chord}`;
      if (!seen.has(seq)) {
        seen.add(seq);
        // Only flag after the first few chords (so we have a "seen" baseline)
        if (i > 3) {
          events.push({
            time: chords[i].time,
            type: "new_idea",
            intensity: 0.6,
            label: "New harmonic idea",
          });
        }
      }
    }
  }

  return events;
}

// ── Post-processing: deduplicate and cap ──

function postProcess(events: MusicalEvent[], trackDuration: number): MusicalEvent[] {
  // Sort by time
  events.sort((a, b) => a.time - b.time);

  // Deduplicate: two events within 1s → keep higher intensity
  const deduped: MusicalEvent[] = [];
  for (const e of events) {
    const existing = deduped.find(
      (d) => Math.abs(d.time - e.time) < 1.0
    );
    if (existing) {
      if (e.intensity > existing.intensity) {
        Object.assign(existing, e);
      }
    } else {
      deduped.push(e);
    }
  }

  // Cap: ~1 event per 10s
  const maxEvents = Math.max(10, Math.ceil(trackDuration / 10));
  if (deduped.length <= maxEvents) return deduped;

  // Keep highest intensity events, spread across time
  deduped.sort((a, b) => b.intensity - a.intensity);
  const kept = deduped.slice(0, maxEvents);
  kept.sort((a, b) => a.time - b.time);
  return kept;
}
