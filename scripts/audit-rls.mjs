#!/usr/bin/env node
/**
 * RLS policy audit — enumerate every row-level-security policy in
 * the project's Postgres database and print them in a form that's
 * easy to eyeball for correctness.
 *
 * Run with the service role key (bypasses RLS to read pg_policies):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=service_role_key \
 *     node scripts/audit-rls.mjs
 *
 * This is read-only. It never modifies anything.
 *
 * What to look for in the output:
 *   - Tables WITHOUT a SELECT/INSERT/UPDATE/DELETE policy where the
 *     application reads/writes that table — RLS is on but no policy
 *     means everything is denied (good for read; bad if writes are
 *     supposed to work).
 *   - Policies with `qual = true` (or no `qual` at all) — those allow
 *     every row. Sometimes correct (anon-readable featured content),
 *     usually a mistake.
 *   - Policies that reference auth.uid() but compare against the
 *     wrong column (e.g. checking user_id when the column is
 *     created_by).
 *   - Tables with `rls_enabled = false` — those have no policy
 *     enforcement at all; service-role-only access is the only
 *     guard. Verify intentional.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.",
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Pull RLS state for every table in the public schema, then policies.
// We use rpc against a small SQL function if it exists, otherwise
// fall back to enumerating via the REST schema introspection.
async function tablesWithRlsState() {
  // Supabase exposes pg_policies via the REST endpoint as the
  // information_schema doesn't include `qual` text. We query the
  // raw table via the postgrest meta path.
  const tablesRes = await fetch(`${url}/rest/v1/pg_tables?schemaname=eq.public`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!tablesRes.ok) {
    throw new Error(`pg_tables query failed: ${tablesRes.status}`);
  }
  const tables = await tablesRes.json();

  const policiesRes = await fetch(
    `${url}/rest/v1/pg_policies?schemaname=eq.public`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  );
  if (!policiesRes.ok) {
    throw new Error(`pg_policies query failed: ${policiesRes.status}`);
  }
  const policies = await policiesRes.json();

  return { tables, policies };
}

function fmtRow(label, value) {
  return `    ${label.padEnd(14)} ${value}`;
}

async function main() {
  const { tables, policies } = await tablesWithRlsState();

  // Group policies by tablename
  const byTable = new Map();
  for (const p of policies) {
    if (!byTable.has(p.tablename)) byTable.set(p.tablename, []);
    byTable.get(p.tablename).push(p);
  }

  console.log("");
  console.log("Resonance RLS audit");
  console.log("===================");
  console.log("");
  console.log(`Tables in public schema: ${tables.length}`);
  console.log(`Total policies:          ${policies.length}`);
  console.log("");

  for (const t of tables.sort((a, b) => a.tablename.localeCompare(b.tablename))) {
    const tblPolicies = byTable.get(t.tablename) ?? [];
    console.log(`▸ ${t.tablename}`);
    console.log(fmtRow("RLS enabled:", t.rowsecurity ? "yes" : "NO  ←  inspect"));
    if (tblPolicies.length === 0) {
      console.log(fmtRow("policies:", "(none)"));
    } else {
      for (const p of tblPolicies) {
        const cmd = p.cmd ?? "?";
        const roles = (p.roles ?? "").replace(/[{}]/g, "");
        const qual = (p.qual ?? "true").toString().slice(0, 200);
        console.log(`    ${cmd.padEnd(7)} ${p.policyname}`);
        console.log(`              roles: ${roles}`);
        console.log(`              using: ${qual}`);
        if (p.with_check) {
          const wc = p.with_check.toString().slice(0, 200);
          console.log(`              check: ${wc}`);
        }
      }
    }
    console.log("");
  }

  // Summary callouts that warrant a closer look
  const callouts = [];
  for (const t of tables) {
    if (!t.rowsecurity) callouts.push(`  - ${t.tablename}: RLS disabled`);
  }
  for (const p of policies) {
    const qual = (p.qual ?? "").toString().toLowerCase();
    if (qual === "true" || qual === "") {
      callouts.push(`  - ${p.tablename}.${p.policyname}: matches every row`);
    }
  }
  if (callouts.length > 0) {
    console.log("Callouts (verify intentional):");
    for (const c of callouts) console.log(c);
    console.log("");
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
