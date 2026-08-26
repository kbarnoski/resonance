// ─────────────────────────────────────────────────────────────────────────────
// 16144-spiralkeep — persist.ts
//
// The headline of this graduation: the excitable medium REMEMBERS. Its (u,v)
// field is downsampled, packed to bytes, base64-encoded and written to
// localStorage under a versioned, per-ALBUM key. On the next load the field is
// decoded and pushed back into the sim texture, so the spiral waves RESUME
// scrolling exactly where they left off — across reloads and return visits.
//
// Alongside the field we keep an AGE (total accumulated grow-time in seconds)
// and a VISIT count, so the page can say "this medium has been turning 14m 22s
// across 3 visits." Every read and write is wrapped in try/catch: private mode
// throws on access, and when it does we degrade silently to a session that
// simply doesn't persist.
// ─────────────────────────────────────────────────────────────────────────────

const PREFIX = "dream:spiralkeep:v2:";

/** One album's remembered medium. */
export interface MediumRecord {
  /** base64 of the packed (u,v) byte field. */
  field: string;
  /** total accumulated grow-time, seconds. */
  ageSeconds: number;
  /** how many separate visits have touched this medium. */
  visits: number;
  /** wall-clock of the last save (ms since epoch). */
  savedAt: number;
}

function keyFor(albumId: string): string {
  return PREFIX + albumId;
}

// base64 of a Uint8Array, chunked so we never blow the argument list on btoa.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Read the remembered medium for an album, or null if none / storage blocked. */
export function loadMedium(albumId: string): MediumRecord | null {
  try {
    const raw = window.localStorage.getItem(keyFor(albumId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MediumRecord>;
    if (typeof parsed.field !== "string") return null;
    return {
      field: parsed.field,
      ageSeconds:
        typeof parsed.ageSeconds === "number" && parsed.ageSeconds >= 0
          ? parsed.ageSeconds
          : 0,
      visits:
        typeof parsed.visits === "number" && parsed.visits >= 0
          ? parsed.visits
          : 0,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

/** Decode a record's packed field back into raw bytes, or null if malformed. */
export function decodeField(record: MediumRecord): Uint8Array | null {
  try {
    return base64ToBytes(record.field);
  } catch {
    return null;
  }
}

/** Persist an album's medium. Never throws — storage is a nicety, not a spine. */
export function saveMedium(
  albumId: string,
  field: Uint8Array,
  ageSeconds: number,
  visits: number,
): void {
  try {
    const record: MediumRecord = {
      field: bytesToBase64(field),
      ageSeconds,
      visits,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(keyFor(albumId), JSON.stringify(record));
  } catch {
    /* private mode / quota — degrade to a non-persistent session silently */
  }
}

/** Forget an album's medium entirely (the "New medium" control). */
export function clearMedium(albumId: string): void {
  try {
    window.localStorage.removeItem(keyFor(albumId));
  } catch {
    /* nothing we can do; the in-memory field is reseeded regardless */
  }
}

/** "14m 22s" / "1h 03m 07s" / "0m 08s" — a human read of accumulated turning. */
export function formatAge(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  return `${m}m ${pad(sec)}s`;
}
