/**
 * Lightweight input validators for API route handlers.
 *
 * The goal is small, predictable functions — not a generic framework.
 * Each validator returns either the typed value or a Response that can
 * be returned directly from the route. Patterns intentionally line up
 * with how the routes already construct error responses.
 */

export interface ValidationFailure {
  ok: false;
  response: Response;
}
export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function fail(message: string, status = 400): ValidationFailure {
  return { ok: false, response: Response.json({ error: message }, { status }) };
}

/** Require a string field within a length range. Trims whitespace. */
export function requireString(
  raw: unknown,
  field: string,
  opts: { min?: number; max: number },
): ValidationResult<string> {
  if (typeof raw !== "string") return fail(`Missing ${field}`);
  const value = raw.trim();
  const min = opts.min ?? 1;
  if (value.length < min) return fail(`${field} too short (min ${min})`);
  if (value.length > opts.max) return fail(`${field} too long (max ${opts.max})`);
  return { ok: true, value };
}

/** Optional string; returns undefined if missing, validates if present. */
export function optionalString(
  raw: unknown,
  field: string,
  opts: { min?: number; max: number },
): ValidationResult<string | undefined> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: undefined };
  return requireString(raw, field, opts);
}

/** Require an http(s) URL. Optional host allowlist. */
export function requireHttpUrl(
  raw: unknown,
  field: string,
  opts: { maxLength?: number; allowedHosts?: string[] } = {},
): ValidationResult<string> {
  const maxLength = opts.maxLength ?? 2048;
  if (typeof raw !== "string") return fail(`Missing ${field}`);
  if (raw.length > maxLength) return fail(`${field} too long (max ${maxLength})`);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return fail(`${field} is not a valid URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return fail(`${field} must be http(s)`);
  }
  if (opts.allowedHosts && opts.allowedHosts.length > 0) {
    const ok = opts.allowedHosts.some(
      (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
    );
    if (!ok) return fail(`${field} host not allowed`);
  }
  return { ok: true, value: parsed.toString() };
}

/** Require a number within a range. */
export function requireNumber(
  raw: unknown,
  field: string,
  opts: { min: number; max: number },
): ValidationResult<number> {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fail(`${field} must be a number`);
  if (raw < opts.min || raw > opts.max) {
    return fail(`${field} out of range [${opts.min}, ${opts.max}]`);
  }
  return { ok: true, value: raw };
}

/** Require value to be one of an allowed enum. */
export function requireEnum<T extends string>(
  raw: unknown,
  field: string,
  allowed: readonly T[],
): ValidationResult<T> {
  if (typeof raw !== "string" || !allowed.includes(raw as T)) {
    return fail(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return { ok: true, value: raw as T };
}

/** Optional enum — returns undefined if missing. */
export function optionalEnum<T extends string>(
  raw: unknown,
  field: string,
  allowed: readonly T[],
): ValidationResult<T | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  return requireEnum(raw, field, allowed);
}

/** Require an array of strings, each within a length range. */
export function requireStringArray(
  raw: unknown,
  field: string,
  opts: { maxItems: number; maxItemLength: number },
): ValidationResult<string[]> {
  if (!Array.isArray(raw)) return fail(`${field} must be an array`);
  if (raw.length > opts.maxItems) return fail(`${field} too many items (max ${opts.maxItems})`);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (typeof item !== "string") return fail(`${field}[${i}] must be a string`);
    if (item.length > opts.maxItemLength) {
      return fail(`${field}[${i}] too long (max ${opts.maxItemLength})`);
    }
    out.push(item);
  }
  return { ok: true, value: out };
}

/** Parse JSON body, returning a 400 on parse failure rather than 500. */
export async function readJsonBody(request: Request): Promise<ValidationResult<unknown>> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return fail("Invalid JSON body");
  }
}
