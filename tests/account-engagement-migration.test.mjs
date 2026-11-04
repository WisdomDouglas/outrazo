// Account engagement migration safeguard tests (P4, proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its safeguards are present. They cannot execute SQL and do NOT
// prove live database behavior — that proof requires review, applying the
// migration, and exercising RSVP/review drills against a real database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261113090000_account_engagement_v1.sql",
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

const notifyBody = functionBody("notify_rsvp_change");

describe("account engagement proposal boundaries", () => {
  it("is marked proposed-pending-review and refuses double application", () => {
    assert.match(sql, /STATUS: PROPOSED — PENDING REVIEW\. NOT APPLIED/);
    assert.match(sql, /notifications already exists; do not apply Account engagement V1 twice/);
    assert.match(sql, /event_reviews already exists; do not apply Account engagement V1 twice/);
  });

  it("keeps the inbox server-write-only with read receipts", () => {
    assert.match(sql, /CREATE TABLE public\.notifications/);
    assert.match(sql, /CHECK \(type IN \('rsvp_confirmed', 'rsvp_cancelled', 'order_paid', 'event_cancelled'\)\)/);
    assert.match(sql, /CREATE POLICY "Users read own notifications"/);
    assert.match(sql, /CREATE POLICY "Users mark own notifications read"/);
    assert.match(sql, /REVOKE ALL ON public\.notifications FROM PUBLIC, anon/);
    assert.match(sql, /GRANT SELECT ON public\.notifications TO authenticated/);
    assert.match(sql, /GRANT UPDATE \(read_at\) ON public\.notifications TO authenticated/);
    assert.match(sql, /GRANT ALL ON public\.notifications TO service_role/);
  });

  it("notifies RSVP inserts and deletes through a locked-down trigger", () => {
    assert.match(notifyBody, /LANGUAGE plpgsql SECURITY DEFINER/);
    assert.match(notifyBody, /SET search_path = ''/);
    assert.match(notifyBody, /TG_OP = 'INSERT'/);
    assert.match(notifyBody, /TG_OP = 'DELETE'/);
    assert.match(notifyBody, /'rsvp_confirmed'/);
    assert.match(notifyBody, /'rsvp_cancelled'/);
    assert.match(sql, /CREATE TRIGGER notify_rsvp_change_trigger/);
    assert.match(sql, /AFTER INSERT OR DELETE ON public\.event_attendees/);
  });

  it("gates reviews on attendance and one row per user per event", () => {
    assert.match(sql, /CREATE TABLE public\.event_reviews/);
    assert.match(sql, /UNIQUE \(event_id, user_id\)/);
    assert.match(sql, /CHECK \(rating BETWEEN 1 AND 5\)/);
    assert.match(sql, /CREATE POLICY "Anyone reads reviews of published events"/);
    assert.match(sql, /CREATE POLICY "Attendees write own reviews"/);
    assert.match(sql, /CREATE POLICY "Attendees update own reviews"/);
    assert.match(sql, /CREATE POLICY "Authors delete own reviews"/);
    assert.match(sql, /starts_at <= now\(\)/);
    assert.match(sql, /FROM public\.event_attendees/);
    assert.match(sql, /FROM public\.ticket_orders/);
    assert.match(sql, /GRANT SELECT ON public\.event_reviews TO anon/);
  });

  it("verifies its own objects before committing", () => {
    assert.match(sql, /did not create notifications/);
    assert.match(sql, /did not create event_reviews/);
    assert.match(sql, /did not create the RSVP notify trigger/);
  });
});
