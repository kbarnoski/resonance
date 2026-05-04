#!/usr/bin/env node
/**
 * RLS policy audit — enumerate every row-level-security policy in
 * the project's Postgres database and print them in a form that's
 * easy to eyeball for correctness.
 *
 * USAGE
 *
 *   This script can run two ways. The first only works if you've
 *   added an `audit_rls()` SQL function to the database (instructions
 *   below); the second is "paste this SQL into the Supabase SQL
 *   editor". Both produce the same review output.
 *
 *   ── Option 1: programmatic (requires one-time SQL setup) ──
 *
 *   In the Supabase SQL editor, run once:
 *
 *     create or replace function public.audit_rls()
 *     returns jsonb security definer set search_path = '' as $$
 *       select jsonb_build_object(
 *         'tables', (
 *           select coalesce(jsonb_agg(jsonb_build_object(
 *             'table', tablename,
 *             'rls_enabled', rowsecurity
 *           ) order by tablename), '[]'::jsonb)
 *           from pg_tables where schemaname = 'public'
 *         ),
 *         'policies', (
 *           select coalesce(jsonb_agg(jsonb_build_object(
 *             'table', tablename,
 *             'name', policyname,
 *             'cmd', cmd,
 *             'roles', roles,
 *             'qual', qual,
 *             'with_check', with_check
 *           ) order by tablename, policyname), '[]'::jsonb)
 *           from pg_policies where schemaname = 'public'
 *         )
 *       )
 *     $$ language sql;
 *     revoke execute on function public.audit_rls() from public, anon, authenticated;
 *
 *   Then run this script:
 *     NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co \
 *     SUPABASE_SERVICE_ROLE_KEY=service_role_key \
 *       node --env-file=.env.local scripts/audit-rls.mjs
 *
 *   ── Option 2: paste-and-read (no setup) ──
 *
 *   Open Supabase SQL editor and paste:
 *
 *     select tablename, rowsecurity
 *     from pg_tables where schemaname = 'public'
 *     order by tablename;
 *
 *     select tablename, policyname, cmd, roles, qual, with_check
 *     from pg_policies where schemaname = 'public'
 *     order by tablename, policyname;
 *
 *   Read the output. Look for:
 *     - rowsecurity = false on tables you write/read from the app
 *     - qual = 'true' (matches every row) — sometimes correct, often a mistake
 *     - cmd missing for tables that you do write to (RLS denies-by-default)
 *
 * This script is read-only.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.\n" +
      "Tip: add `--env-file=.env.local` if you store them there.",
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fmtRow(label, value) {
  return `    ${label.padEnd(14)} ${value}`;
}

async function main() {
  console.log("");
  console.log("Resonance RLS audit");
  console.log("===================");
  console.log("");

  const { data, error } = await admin.rpc("audit_rls");
  if (error || !data) {
    console.error(
      "Couldn't call public.audit_rls(): " + (error?.message ?? "no data"),
    );
    console.error(
      "\nThis script needs the audit_rls() SQL function to be defined.\n" +
        "See the comment at the top of this file for the one-time setup,\n" +
        "or use Option 2 (paste the SQL queries directly into the\n" +
        "Supabase SQL editor).",
    );
    process.exit(2);
  }

  const tables = data.tables ?? [];
  const policies = data.policies ?? [];

  // Group policies by table
  const byTable = new Map();
  for (const p of policies) {
    if (!byTable.has(p.table)) byTable.set(p.table, []);
    byTable.get(p.table).push(p);
  }

  console.log(`Tables in public schema: ${tables.length}`);
  console.log(`Total policies:          ${policies.length}`);
  console.log("");

  for (const t of tables) {
    const tblPolicies = byTable.get(t.table) ?? [];
    console.log(`▸ ${t.table}`);
    console.log(fmtRow("RLS enabled:", t.rls_enabled ? "yes" : "NO  ←  inspect"));
    if (tblPolicies.length === 0) {
      console.log(fmtRow("policies:", "(none)"));
    } else {
      for (const p of tblPolicies) {
        const cmd = (p.cmd ?? "?").padEnd(7);
        const roles = Array.isArray(p.roles) ? p.roles.join(",") : (p.roles ?? "?");
        const qual = (p.qual ?? "true").toString().slice(0, 200);
        console.log(`    ${cmd} ${p.name}`);
        console.log(`              roles: ${roles}`);
        console.log(`              using: ${qual}`);
        if (p.with_check) {
          console.log(`              check: ${p.with_check.toString().slice(0, 200)}`);
        }
      }
    }
    console.log("");
  }

  // Callouts
  const callouts = [];
  for (const t of tables) {
    if (!t.rls_enabled) callouts.push(`  - ${t.table}: RLS disabled`);
  }
  for (const p of policies) {
    const qual = (p.qual ?? "").toString().toLowerCase();
    if (qual === "true" || qual === "") {
      callouts.push(`  - ${p.table}.${p.name}: matches every row`);
    }
  }
  if (callouts.length > 0) {
    console.log("Callouts (verify intentional):");
    for (const c of callouts) console.log(c);
    console.log("");
  } else {
    console.log("No automatic callouts. Eyeball the policy 'using' clauses.");
    console.log("");
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
