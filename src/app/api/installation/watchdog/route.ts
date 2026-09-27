import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Installation dead-man's switch (maturity audit 2026-09-26 #3).
 *
 * The kiosk heartbeats every 60s, but until now NOTHING noticed when the
 * heartbeats stopped — the status page is pull-only. This route is hit by
 * Vercel cron every 5 minutes (vercel.json); if any heartbeat that was
 * alive in the last 24h has gone silent for >6 minutes, or its last fps
 * report was under 40, it pushes to WATCHDOG_WEBHOOK_URL (a Slack/Discord
 * incoming webhook — no SDK needed).
 *
 * Honest limit: the fully-offline desert venue can't reach Vercel at all;
 * there the answer is the on-site status page + flight recorder. This
 * watchdog serves every venue with upstream.
 *
 * Auth: Vercel cron sends `authorization: Bearer ${CRON_SECRET}` when the
 * env is set. Without CRON_SECRET the route only ever reads + posts to
 * the configured webhook, so exposure is limited to noise.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const webhook = process.env.WATCHDOG_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json({ ok: true, note: "WATCHDOG_WEBHOOK_URL not set — watchdog dormant" });
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { data, error } = await supabase
    .from("installation_heartbeats")
    .select("token, updated_at, payload")
    .gte("updated_at", dayAgo);
  if (error) {
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
  const alerts: string[] = [];
  const now = Date.now();
  for (const row of data ?? []) {
    const ageMin = (now - new Date(row.updated_at).getTime()) / 60000;
    const label = String(row.token).slice(0, 6) + "…";
    if (ageMin > 6) {
      alerts.push(`💀 kiosk ${label}: silent for ${Math.round(ageMin)} min (last: ${(row.payload as { phaseLabel?: string })?.phaseLabel ?? "?"})`);
    } else {
      const fps = Number((row.payload as { fps?: unknown })?.fps);
      if (Number.isFinite(fps) && fps > 0 && fps < 40) {
        alerts.push(`🐢 kiosk ${label}: ${fps}fps sustained (phase ${(row.payload as { phaseLabel?: string })?.phaseLabel ?? "?"})`);
      }
    }
  }
  if (alerts.length > 0) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Tramokyo watchdog:\n${alerts.join("\n")}`, content: `Tramokyo watchdog:\n${alerts.join("\n")}` }),
    }).catch(() => { /* webhook down — cron retries in 5 min */ });
  }
  return NextResponse.json({ ok: true, checked: data?.length ?? 0, alerts: alerts.length });
}
