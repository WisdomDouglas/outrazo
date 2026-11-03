// Scout migration safeguard tests (S0 proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its tables, guards, and RLS posture are present. They cannot execute
// SQL and do NOT prove live database behavior — that proof requires review,
// applying the migration, and exercising the tier/paid/RSVP drills against a
// real database. What they do guarantee is that nobody can silently weaken
// the safeguards in a future edit without a test failing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261108090000_scout_v1.sql",
  import.meta.url,
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

const FIX_PATH = new URL(
  "../supabase/migrations/20261109090000_scout_zone_only_fix_v1.sql",
  import.meta.url,
);

const fix = readFileSync(FIX_PATH, "utf8");

function functionBody(name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `expected function ${name} in the migration`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `expected end of function ${name} in the migration`);
  return sql.slice(start, end);
}

describe("scout migration tables", () => {
  it("creates the five scout tables", () => {
    for (const table of ["scout_runs", "scout_discoveries", "scout_run_coverage", "scout_event_links", "scout_run_steps"]) {
      assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS public.${table} (`), table);
    }
  });

  it("keeps discoveries separate with pending-first lifecycle", () => {
    assert.ok(sql.includes("'pending', 'approved', 'dismissed', 'auto_rejected'"));
    assert.ok(sql.includes("REFERENCES public.scout_runs(id) ON DELETE CASCADE"));
  });

  it("distinguishes zone sweeps from targeted coverage", () => {
    assert.ok(sql.includes("'unsearched', 'nationwide_only', 'zone_only', 'targeted'"));
  });
});

describe("scout financial guards", () => {
  it("blocks tiers, paid conversion, and external RSVPs", () => {
    const tiers = functionBody("block_scout_ticket_sales");
    assert.ok(tiers.includes("scout_event_links"));
    assert.ok(tiers.includes("RAISE EXCEPTION"));
    const paid = functionBody("block_scout_paid_conversion");
    assert.ok(paid.includes("NEW.event_type = 'paid'"));
    const rsvp = functionBody("block_external_ticket_rsvp");
    assert.ok(rsvp.includes("external_ticket_url IS NOT NULL"));
  });

  it("wires triggers to the right tables and events", () => {
    assert.ok(sql.includes("CREATE TRIGGER scout_block_ticket_sales"));
    assert.ok(sql.includes("BEFORE INSERT ON public.event_ticket_tiers"));
    assert.ok(sql.includes("CREATE TRIGGER scout_block_paid_conversion"));
    assert.ok(sql.includes("BEFORE INSERT OR UPDATE OF event_type ON public.events"));
    assert.ok(sql.includes("CREATE TRIGGER scout_block_external_rsvp"));
    assert.ok(sql.includes("BEFORE INSERT ON public.event_attendees"));
  });

  it("adds external_ticket_url as nullable https-only", () => {
    assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS external_ticket_url text NULL"));
    assert.ok(sql.includes("external_ticket_url LIKE 'https://%'"));
  });
});

describe("scout rls posture", () => {
  it("enables RLS with service-role-only grants and no user policies", () => {
    for (const table of ["scout_runs", "scout_discoveries", "scout_run_coverage", "scout_event_links", "scout_run_steps"]) {
      assert.ok(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`), table);
      assert.ok(sql.includes(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated`), table);
      assert.ok(sql.includes(`GRANT ALL ON public.${table} TO service_role`), table);
    }
    assert.ok(!sql.includes("CREATE POLICY"), "no permissive policies");
  });
});

describe("scout zone_only corrective migration", () => {
  it("widens the check conditionally without touching data", () => {
    assert.ok(fix.includes("position('zone_only' IN constraint_def) = 0"));
    assert.ok(fix.includes("'unsearched', 'nationwide_only', 'zone_only', 'targeted'"));
    assert.ok(!fix.includes("DELETE FROM"));
    assert.ok(!fix.includes("CREATE POLICY"));
  });

  it("hardens all three financial triggers to definer rights", () => {
    const functions = ["block_scout_ticket_sales", "block_scout_paid_conversion", "block_external_ticket_rsvp"];
    for (const name of functions) {
      assert.ok(fix.includes(`DROP FUNCTION IF EXISTS public.${name}()`), name);
    }
    assert.equal(fix.match(/\nSECURITY DEFINER\n/g).length, 3);
    assert.equal(fix.match(/\nSET search_path = ''\n/g).length, 3);
    assert.ok(!fix.includes("CREATE OR REPLACE FUNCTION public.block_"), "no OR REPLACE on guards");
    for (const trigger of ["scout_block_ticket_sales", "scout_block_paid_conversion", "scout_block_external_rsvp"]) {
      assert.ok(fix.includes(`DROP TRIGGER IF EXISTS ${trigger}`), trigger);
      assert.ok(fix.includes(`CREATE TRIGGER ${trigger}`), trigger);
      // Drops precede all creates: nothing is dropped after use.
      assert.ok(
        fix.indexOf(`DROP TRIGGER IF EXISTS ${trigger}`) < fix.indexOf(`CREATE TRIGGER ${trigger}`),
        trigger,
      );
    }
  });
});
