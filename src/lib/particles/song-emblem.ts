// SONG EMBLEM (Karel 2026-10-16: "each song of his gets an emblem that appears in
// beginning and end and sometimes middle just like the other journeys"). In a
// live set the world on screen is one of Karel's journeys, but the SONG is
// Joseph's: the particle layer forms the song's emblem (not the world's) on the
// song's own clock — the existing emblemEnvelope, unchanged. Null = the world's
// own emblem as usual (the loop, plain live).

export interface SongEmblem {
  /** the song's emblem image, or null = this song shows none (never the world's) */
  url: string | null;
  /** the song's [currentTime, duration] in seconds */
  clock: () => [number, number];
}

let current: SongEmblem | null = null;
const listeners = new Set<() => void>();

export function setSongEmblem(e: SongEmblem | null): void {
  current = e;
  for (const l of listeners) l();
}
export function getSongEmblem(): SongEmblem | null {
  return current;
}
export function onSongEmblem(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
