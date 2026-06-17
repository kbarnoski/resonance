// feed.ts — the live global creation firehose + synthetic fallback.
//
// Two responsibilities:
//   1. A SYNTHETIC generator that emits plausible GitHub-event-shaped
//      objects forever, with ZERO network, starting the instant we begin.
//   2. A live poller that hits the unauthenticated GitHub public-events
//      endpoint (CORS-open, no key) at most once per ~75s, and on success
//      meters the batch out over the window. ANY error → stay synthetic.

export type ForgeEventType =
  | "PushEvent"
  | "WatchEvent"
  | "PullRequestEvent"
  | "IssuesEvent"
  | "ForkEvent"
  | "CreateEvent"
  | "IssueCommentEvent";

export interface ForgeEvent {
  type: ForgeEventType;
  repo: string;
  actor: string;
  /** true when sourced from the real GitHub firehose, false when synthetic */
  live: boolean;
}

// Realistic-ish distribution of the public firehose: pushes dominate,
// stars frequent, the rest rarer.
const WEIGHTED: Array<[ForgeEventType, number]> = [
  ["PushEvent", 46],
  ["WatchEvent", 20],
  ["CreateEvent", 11],
  ["PullRequestEvent", 8],
  ["IssueCommentEvent", 7],
  ["ForkEvent", 5],
  ["IssuesEvent", 3],
];
const WEIGHT_TOTAL = WEIGHTED.reduce((s, [, w]) => s + w, 0);

function pickType(): ForgeEventType {
  let r = Math.random() * WEIGHT_TOTAL;
  for (const [t, w] of WEIGHTED) {
    r -= w;
    if (r <= 0) return t;
  }
  return "PushEvent";
}

// A small pool of plausible-looking name fragments so synthetic repos
// hash to a spread of locations/pitches like real ones do.
const ORGS = [
  "kernel", "nova", "atlas", "drift", "ember", "lumen", "north", "vega",
  "quartz", "cobalt", "harbor", "saffron", "indigo", "willow", "onyx",
  "meridian", "cypress", "delta", "aurora", "basalt", "verdant", "tundra",
];
const NOUNS = [
  "engine", "loom", "garden", "atlas", "forge", "lattice", "beacon",
  "cipher", "harbor", "studio", "kit", "core", "flow", "scope", "ledger",
  "canvas", "signal", "router", "weave", "prism", "spindle", "anvil",
];
const USERS = [
  "mara", "tobias", "ren", "ines", "kwame", "soledad", "yuki", "amara",
  "felix", "noor", "dmitri", "lila", "kenji", "asha", "milo", "priya",
  "santiago", "feng", "olu", "esme", "rafael", "thandi",
];

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

function synthEvent(): ForgeEvent {
  return {
    type: pickType(),
    repo: `${pick(ORGS)}-${pick(NOUNS)}/${pick(NOUNS)}-${Math.floor(
      Math.random() * 90 + 10,
    )}`,
    actor: `${pick(USERS)}${Math.floor(Math.random() * 900 + 100)}`,
    live: false,
  };
}

const VALID = new Set<string>([
  "PushEvent", "WatchEvent", "PullRequestEvent", "IssuesEvent",
  "ForkEvent", "CreateEvent", "IssueCommentEvent",
]);

interface RawEvent {
  type?: unknown;
  repo?: { name?: unknown };
  actor?: { login?: unknown };
}

function parseLive(raw: unknown): ForgeEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ForgeEvent[] = [];
  for (const item of raw as RawEvent[]) {
    const t = typeof item?.type === "string" ? item.type : "";
    if (!VALID.has(t)) continue;
    const repo =
      typeof item?.repo?.name === "string" ? item.repo.name : "unknown/unknown";
    const actor =
      typeof item?.actor?.login === "string" ? item.actor.login : "someone";
    out.push({ type: t as ForgeEventType, repo, actor, live: true });
  }
  return out;
}

export interface FeedHandle {
  stop: () => void;
  /** "synthetic" until a live poll succeeds, then "live"; reverts on error */
  status: () => "synthetic" | "live" | "error";
}

/**
 * Start the feed. Calls `onEvent` for every metered event (synthetic or
 * live) and `onStatus` whenever the source/status changes. Runs forever
 * until `stop()`; never throws to the caller.
 */
export function startFeed(
  onEvent: (e: ForgeEvent) => void,
  onStatus: (s: "synthetic" | "live" | "error") => void,
): FeedHandle {
  let stopped = false;
  let status: "synthetic" | "live" | "error" = "synthetic";

  // ── synthetic heartbeat — gentle, slightly irregular ──────────────
  let synthTimer = 0;
  const scheduleSynth = () => {
    if (stopped) return;
    // ~1 event every 0.9–2.1s when synthetic is the active source.
    const delay = 900 + Math.random() * 1200;
    synthTimer = window.setTimeout(() => {
      if (stopped) return;
      // Only emit synthetic when we're NOT currently draining a live batch.
      if (liveQueue.length === 0) onEvent(synthEvent());
      scheduleSynth();
    }, delay);
  };

  // ── live metering — drain a fetched batch across the window ───────
  let liveQueue: ForgeEvent[] = [];
  let drainTimer = 0;
  const drain = () => {
    if (stopped) return;
    const e = liveQueue.shift();
    if (e) onEvent(e);
    if (liveQueue.length > 0) {
      // Spread remaining events; weight toward "sooner" so recent
      // activity lands first, then taper.
      const gap = 600 + Math.random() * 900;
      drainTimer = window.setTimeout(drain, gap);
    } else {
      drainTimer = 0;
    }
  };

  const setStatus = (s: typeof status) => {
    if (s !== status) {
      status = s;
      onStatus(s);
    }
  };

  // ── poller ────────────────────────────────────────────────────────
  let pollTimer = 0;
  const poll = async () => {
    if (stopped) return;
    try {
      const res = await fetch("https://api.github.com/events?per_page=100", {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const events = parseLive(data);
      if (events.length === 0) throw new Error("empty batch");
      // Most-recent-first weighting: the API returns newest first; take a
      // gentle slice (~40) so we don't overload the ~75s window, biased
      // toward the front (most recent).
      liveQueue = events.slice(0, 40);
      setStatus("live");
      if (drainTimer === 0) drain();
    } catch {
      // 403 / rate-limit / CORS / offline → keep the synthetic world alive.
      setStatus(status === "live" ? "live" : "error");
    }
    if (stopped) return;
    // Respect 60 req/hr: never faster than ~78s.
    pollTimer = window.setTimeout(poll, 78_000);
  };

  // Kick everything off: synthetic IMMEDIATELY, live poll a beat later so
  // the piece sounds within ~1s regardless of network.
  onStatus(status);
  scheduleSynth();
  pollTimer = window.setTimeout(poll, 1200);

  return {
    stop: () => {
      stopped = true;
      window.clearTimeout(synthTimer);
      window.clearTimeout(drainTimer);
      window.clearTimeout(pollTimer);
    },
    status: () => status,
  };
}

// ── deterministic geo + pitch hashing (shared by audio + globe) ──────

/** Stable 32-bit hash of a string (FNV-1a). */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic pseudo longitude (-180..180) for a repo+actor. */
export function lonFor(e: ForgeEvent): number {
  const b = hashStr(e.actor + ":" + e.repo);
  return ((b % 36000) / 100) - 180;
}

/** Deterministic pseudo lat/long for a repo+actor, spread over the globe. */
export function geoFor(e: ForgeEvent): { lat: number; lon: number } {
  const a = hashStr(e.repo);
  // Distribute latitude with an equal-area-ish weighting so the poles
  // aren't over-dense: lat = asin(2u - 1).
  const u = (a & 0xffff) / 0xffff;
  const lat = (Math.asin(2 * u - 1) * 180) / Math.PI;
  return { lat, lon: lonFor(e) };
}
