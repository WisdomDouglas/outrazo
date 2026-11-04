// Ticket finance migration safeguard tests (P5, proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its safeguards are present. They cannot execute SQL and do NOT
// prove live database behavior — that proof requires review, applying the
// migration, and exercising publish/payout drills against a real database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261114090000_ticket_finance_v1.sql",
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

const lockBody = functionBody("lock_event_commission");
const defaultBody = functionBody("set_default_commission_pct");
const createBody = functionBody("create_organizer_payout");
const transitionBody = functionBody("transition_organizer_payout");

describe("ticket finance proposal boundaries", () => {
  it("is marked proposed-pending-review and refuses double application", () => {
    assert.match(sql, /STATUS: PROPOSED — PENDING REVIEW\. NOT APPLIED/);
    assert.match(sql, /commission_rates already exists; do not apply Ticket finance V1 twice/);
    assert.match(sql, /organizer_payouts already exists; do not apply Ticket finance V1 twice/);
    assert.match(sql, /events\.commission_pct already exists; do not apply Ticket finance V1 twice/);
  });

  it("keeps an append-only default history seeded at 10%", () => {
    assert.match(sql, /CREATE TABLE public\.commission_rates/);
    assert.match(sql, /INSERT INTO public\.commission_rates \(rate_pct, created_by\)/);
    assert.match(sql, /VALUES \(10\.00, NULL\)/);
    assert.match(sql, /REVOKE ALL ON public\.commission_rates FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT SELECT ON public\.commission_rates TO authenticated/);
    assert.match(sql, /GRANT ALL ON public\.commission_rates TO service_role/);
  });

  it("locks the per-event rate on publish and nowhere else", () => {
    assert.match(sql, /ADD COLUMN commission_pct numeric\(5, 2\)/);
    assert.match(sql, /UPDATE public\.events SET commission_pct = 10\.00 WHERE commission_pct IS NULL/);
    assert.match(lockBody, /LANGUAGE plpgsql SECURITY DEFINER/);
    assert.match(lockBody, /SET search_path = ''/);
    assert.match(lockBody, /The event commission rate is locked and cannot be changed/);
    assert.match(lockBody, /cannot be set directly/);
    assert.match(lockBody, /Published events must carry a commission rate/);
    assert.match(sql, /CREATE TRIGGER lock_event_commission/);
    assert.match(sql, /BEFORE INSERT OR UPDATE ON public\.events/);
  });

  it("gates default changes on finance roles with an audit entry", () => {
    assert.match(defaultBody, /Only a super_admin or finance_admin may manage the commission default/);
    assert.match(defaultBody, /between 0 and 100 percent/);
    assert.match(defaultBody, /'admin\.commission\.set_default'/);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.set_default_commission_pct\(numeric\) FROM PUBLIC, anon/,
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.set_default_commission_pct\(numeric\) TO authenticated/,
    );
  });

  it("refuses payouts above the available balance", () => {
    assert.match(sql, /CREATE TABLE public\.organizer_payouts/);
    assert.match(createBody, /Only a super_admin or finance_admin may record payouts/);
    assert.match(createBody, /LOCK TABLE public\.organizer_payouts IN SHARE ROW EXCLUSIVE MODE/);
    assert.match(createBody, /That payout exceeds the available balance/);
    assert.match(createBody, /'admin\.payout\.create'/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.organizer_net_earned_kobo/);
    assert.match(sql, /GRANT SELECT \(id, organizer_id, amount_kobo/);
  });

  it("enforces the payout workflow with locked transitions", () => {
    assert.match(transitionBody, /FOR UPDATE/);
    assert.match(transitionBody, /Paid and failed payouts are terminal and cannot move/);
    assert.match(transitionBody, /That payout transition is not allowed/);
    assert.match(transitionBody, /Record the bank transfer reference before marking paid/);
    assert.match(transitionBody, /Record why the payout failed/);
    assert.match(transitionBody, /'admin\.payout\.transition'/);
  });

  it("verifies its own objects before committing", () => {
    assert.match(sql, /did not create commission_rates/);
    assert.match(sql, /did not create organizer_payouts/);
    assert.match(sql, /did not create the commission lock trigger/);
    assert.match(sql, /did not seed the 10%% opening rate/);
    assert.match(sql, /left events without a locked rate/);
  });
});
