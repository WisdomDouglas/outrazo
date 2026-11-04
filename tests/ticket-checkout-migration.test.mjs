// Ticket-checkout migration safeguard tests (P1, proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its safeguards are present and correctly ordered. They cannot execute
// SQL and do NOT prove live database behavior — that proof requires review,
// applying the migration, and exercising the checkout + activation drills
// against a real database. What they do guarantee is that nobody can
// silently weaken or reorder the safeguards in a future edit without a test
// failing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261110090000_ticket_checkout_v1.sql",
  import.meta.url,
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

function functionBody(name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `expected function ${name} in the migration`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `expected end of function ${name} in the migration`);
  return sql.slice(start, end);
}

const activateBody = functionBody("activate_ticket_order");
const tiersBody = functionBody("replace_event_ticket_tiers_v1");

describe("ticket checkout proposal boundaries", () => {
  it("is marked proposed-pending-review and never applied silently", () => {
    assert.match(sql, /STATUS: PROPOSED — PENDING REVIEW\. NOT APPLIED/);
    assert.match(sql, /Do not execute it without/);
    assert.match(sql, /explicit authorization/);
  });

  it("refuses to run when ambiguous legacy rows exist", () => {
    assert.match(sql, /IF EXISTS \(SELECT 1 FROM public\.ticket_orders\)/);
    assert.match(sql, /IF EXISTS \(SELECT 1 FROM public\.ticket_items\)/);
    assert.match(sql, /Reconcile them manually before applying/);
  });

  it("moves orders to a pending-first lifecycle with unique references", () => {
    assert.match(sql, /ALTER COLUMN status SET DEFAULT 'pending'/);
    assert.match(sql, /ticket_orders_status_check/);
    assert.match(sql, /CHECK \(status IN \('pending', 'paid', 'failed', 'expired', 'cancelled'\)\)/);
    assert.match(sql, /ticket_orders_reference_key UNIQUE \(reference\)/);
    assert.match(sql, /ticket_orders_provider_reference_key UNIQUE \(provider_reference\)/);
  });

  it("keeps money columns numeric and bounds quantities", () => {
    assert.match(sql, /ticket_orders_total_check CHECK \(total_amount >= 0\)/);
    assert.match(sql, /ticket_items_unit_check CHECK \(unit_price >= 0\)/);
    assert.match(sql, /ticket_items_quantity_check CHECK \(quantity > 0 AND quantity <= 10\)/);
  });

  it("gives each buyer a single pending slot per event", () => {
    assert.match(sql, /ticket_orders_one_pending_per_user_event/);
    assert.match(sql, /ON public\.ticket_orders \(user_id, event_id\) WHERE \(status = 'pending'\)/);
  });

  it("links items to tiers without orphaning sold history", () => {
    assert.match(sql, /ALTER COLUMN tier_id TYPE uuid USING tier_id::uuid/);
    assert.match(sql, /FOREIGN KEY \(tier_id\) REFERENCES public\.event_ticket_tiers\(id\) ON DELETE SET NULL/);
    assert.match(sql, /ticket_items_order_tier_key/);
    assert.match(sql, /ON public\.ticket_items \(order_id, tier_id\) WHERE tier_id IS NOT NULL/);
  });

  it("adds a bounded sold counter to tiers", () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS sold_quantity integer NOT NULL DEFAULT 0/);
    assert.match(sql, /event_ticket_tiers_sold_check/);
    assert.match(sql, /CHECK \(sold_quantity >= 0 AND sold_quantity <= quantity\)/);
  });

  it("logs webhook events idempotently, service-role only", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ticket_webhook_events/);
    assert.match(sql, /UNIQUE \(provider, provider_event_id\)/);
    assert.match(sql, /REVOKE ALL ON public\.ticket_webhook_events FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT ALL ON public\.ticket_webhook_events TO service_role/);
  });

  it("removes buyer order writes while keeping self-scoped reads", () => {
    assert.match(sql, /DROP POLICY IF EXISTS "Users insert own orders"/);
    assert.match(sql, /DROP POLICY IF EXISTS "Users update own orders"/);
    assert.match(sql, /DROP POLICY IF EXISTS "Users insert own ticket items"/);
    assert.match(sql, /CREATE POLICY "Users read own orders"/);
    assert.match(sql, /CREATE POLICY "Users read own ticket items"/);
    assert.match(sql, /REVOKE ALL ON public\.ticket_orders FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT SELECT \([^)]*\)\s+ON public\.ticket_orders TO authenticated/);
    assert.match(sql, /REVOKE ALL ON public\.ticket_items FROM PUBLIC, anon, authenticated/);
  });

  it("activates through one locked, snapshot-matching, definer-rights path", () => {
    assert.match(activateBody, /LANGUAGE plpgsql SECURITY DEFINER/);
    assert.match(activateBody, /SET search_path = ''/);
    assert.match(activateBody, /FROM public\.ticket_orders WHERE id = p_order_id FOR UPDATE/);
    assert.match(activateBody, /RETURN 'already_paid'/);
    assert.match(activateBody, /Only pending ticket orders can be activated/);
    assert.match(activateBody, /Payment does not match the order snapshot/);
    assert.match(activateBody, /FROM public\.event_ticket_tiers WHERE id = item\.tier_id FOR UPDATE/);
    assert.match(activateBody, /sold_quantity \+ item\.quantity <= quantity/);
    assert.match(activateBody, /SET status = 'paid', paid_at = now\(\)/);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.activate_ticket_order\(uuid, text, integer\) FROM PUBLIC, anon, authenticated/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.activate_ticket_order\(uuid, text, integer\) TO service_role/,
    );
  });

  it("freezes tiers once any ticket is paid, before any delete", () => {
    const guardAt = tiersBody.indexOf("Ticket tiers cannot be changed after tickets have been sold");
    const deleteAt = tiersBody.indexOf("DELETE FROM public.event_ticket_tiers");
    assert.notEqual(guardAt, -1, "expected the paid-order guard in replace_event_ticket_tiers_v1");
    assert.ok(guardAt < deleteAt, "the paid-order guard must run before the tier delete");
    assert.match(tiersBody, /WHERE event_id = p_event_id AND status = 'paid'/);
  });

  it("documents the no-automated-money-movement boundary", () => {
    assert.match(sql, /No automated refunds, transfers, or payouts/);
    assert.match(sql, /MANUAL staff process/);
  });
});
