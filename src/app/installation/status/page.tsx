"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface HeartbeatPayload {
  uptimeS?: number;
  phaseLabel?: string;
  journeyName?: string | null;
  audioPaused?: boolean;
  audioCurrentTime?: number;
  audioDuration?: number;
  audioContextState?: string;
  fps?: number;
  lastPlayError?: string | null;
  lastPrimingError?: string | null;
  userAgent?: string;
  viewport?: string;
}

interface HeartbeatResponse {
  payload: HeartbeatPayload;
  lastSeen: string;
  ageMs: number;
}

function StatusInner() {
  const params = useSearchParams();
  const token = params.get("token");
  const [data, setData] = useState<HeartbeatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/installation/heartbeat?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (cancelled) return;
          if (res.status === 404) {
            setError("No heartbeat received yet for this token. Verify the kiosk is running with the matching ?heartbeat_token=… in its URL.");
          } else {
            setError(`Status request failed: HTTP ${res.status}`);
          }
          setData(null);
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        setData(body);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error");
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, 8_000);
    const tickId = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(tickId);
    };
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen bg-black text-white p-8 font-mono">
        <h1 className="text-xl mb-4">Installation status</h1>
        <p className="text-white/65">
          Append <code className="bg-white/10 px-1 rounded">?token=YOUR_TOKEN</code> to this URL.
        </p>
      </div>
    );
  }

  // Compute live "age since last seen" by adding wall clock since the
  // last fetch — keeps the indicator moving between fetches.
  const liveAgeMs = data ? data.ageMs + (Date.now() - new Date(data.lastSeen).getTime() - data.ageMs) : 0;
  const ageSec = Math.floor(liveAgeMs / 1_000);
  const fresh = liveAgeMs < 90_000;
  const stale = liveAgeMs >= 90_000 && liveAgeMs < 5 * 60_000;
  const dead = liveAgeMs >= 5 * 60_000;
  const healthColor = dead ? "bg-red-500" : stale ? "bg-amber-400" : fresh ? "bg-green-500" : "bg-white/40";
  const healthLabel = dead ? "OFFLINE" : stale ? "STALE" : fresh ? "ALIVE" : "—";

  return (
    <div className="min-h-screen bg-black text-white p-6 font-mono text-sm">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg text-white/85">Installation status</h1>
          {data && (
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${healthColor}`} />
              <span className="text-white/65 text-xs">{healthLabel}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-500/30 rounded p-3 mb-4 text-red-200">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-1.5">
            <Row label="Last heartbeat" value={`${ageSec}s ago`} />
            <Row label="Uptime" value={fmtUptime(data.payload.uptimeS)} />
            <Row label="Phase" value={data.payload.phaseLabel ?? "—"} />
            <Row label="Journey" value={data.payload.journeyName ?? "—"} />
            <Row
              label="Audio"
              value={fmtAudio(data.payload)}
            />
            <Row label="AudioCtx" value={data.payload.audioContextState ?? "—"} />
            <Row label="FPS" value={data.payload.fps != null ? String(data.payload.fps) : "—"} />
            {data.payload.lastPlayError && (
              <Row label="Last play err" value={data.payload.lastPlayError} muted />
            )}
            {data.payload.lastPrimingError && (
              <Row label="Last prime err" value={data.payload.lastPrimingError} muted />
            )}
            {data.payload.viewport && <Row label="Viewport" value={data.payload.viewport} />}
            {data.payload.userAgent && (
              <Row label="UA" value={data.payload.userAgent} small />
            )}
          </div>
        )}

        {!data && !error && (
          <div className="text-white/55">Waiting for first heartbeat…</div>
        )}

        <div className="mt-8 text-white/40 text-xs">
          Refreshes every 8s. Token: <code className="bg-white/5 px-1 rounded">{token.slice(0, 6)}…</code>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted = false, small = false }: { label: string; value: string; muted?: boolean; small?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-white/5">
      <span className="text-white/55 shrink-0">{label}</span>
      <span
        className={`${muted ? "text-amber-300/85" : "text-white"} ${small ? "text-xs" : ""}`}
        style={{ wordBreak: "break-word", textAlign: "right" }}
      >
        {value}
      </span>
    </div>
  );
}

function fmtUptime(s: number | undefined): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function fmtAudio(p: HeartbeatPayload): string {
  if (p.audioPaused == null) return "—";
  const t = p.audioCurrentTime != null ? p.audioCurrentTime.toFixed(1) : "0.0";
  const d = p.audioDuration != null && isFinite(p.audioDuration) ? p.audioDuration.toFixed(1) : "?";
  return `${p.audioPaused ? "PAUSED" : "playing"} · ${t}/${d}s`;
}

export default function StatusPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <StatusInner />
    </Suspense>
  );
}
