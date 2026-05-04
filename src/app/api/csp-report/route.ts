/**
 * CSP violation report sink.
 *
 * Browsers POST here when a directive in `Content-Security-Policy` or
 * `Content-Security-Policy-Report-Only` is violated. The body is one
 * of two formats depending on which `report-uri` / `report-to`
 * mechanism the browser is using:
 *
 *   - Legacy report-uri: { "csp-report": { ... } }
 *   - Modern report-to:  [{ type: "csp-violation", body: { ... } }]
 *
 * We don't try to deduplicate or store violations — too noisy at this
 * stage. Just log to the standard logger so they show up in Vercel's
 * runtime logs alongside everything else, where they can be greppable
 * during the Report-Only rollout window before the tighter CSP gets
 * promoted to enforcement.
 *
 * No auth — by design, browsers post without credentials when sending
 * CSP reports. No body size cap is needed beyond what Next.js already
 * applies; reports are small.
 */

import { logger } from "@/lib/logger";

interface LegacyCspReport {
  "csp-report"?: Record<string, unknown>;
}

interface ModernCspReport {
  type?: string;
  body?: Record<string, unknown>;
}

function formatReport(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "(non-object body)";
  // Legacy format
  const legacy = raw as LegacyCspReport;
  if (legacy["csp-report"]) {
    const r = legacy["csp-report"] as Record<string, unknown>;
    return [
      `directive=${r["violated-directive"] ?? r["effective-directive"] ?? "?"}`,
      `blocked=${r["blocked-uri"] ?? "?"}`,
      `source=${r["source-file"] ?? "?"}`,
      `line=${r["line-number"] ?? "?"}`,
      `policy=${r["disposition"] ?? "?"}`,
    ].join(" ");
  }
  // Modern (report-to) format — usually an array
  if (Array.isArray(raw)) {
    return raw
      .map((entry: ModernCspReport) => {
        if (entry.type !== "csp-violation") return `type=${entry.type}`;
        const b = (entry.body ?? {}) as Record<string, unknown>;
        return [
          `directive=${b.effectiveDirective ?? "?"}`,
          `blocked=${b.blockedURL ?? "?"}`,
          `source=${b.sourceFile ?? "?"}`,
          `line=${b.lineNumber ?? "?"}`,
          `policy=${b.disposition ?? "?"}`,
        ].join(" ");
      })
      .join(" | ");
  }
  return JSON.stringify(raw).slice(0, 500);
}

export async function POST(request: Request) {
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    // Some browsers POST as application/csp-report which Next.js may
    // not auto-parse the same way; try text fallback.
    try {
      const text = await request.text();
      raw = JSON.parse(text);
    } catch {
      return new Response(null, { status: 204 });
    }
  }

  logger.warn("csp-report", formatReport(raw));
  // Browsers don't read the body; 204 is the convention.
  return new Response(null, { status: 204 });
}
