// Organizer P2 migration safeguard tests (proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its safeguards are present. They cannot execute SQL and do NOT
// prove live database behavior — that proof requires review, applying the
// migration, and exercising the payout + RSVP drills against a real
// database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261111090000_organizer_p2_v1.sql",
  import.meta.url,
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

describe("organizer P2 proposal boundaries", () => {
  it("is marked proposed-pending-review and refuses double application", () => {
    assert.match(sql, /STATUS: PROPOSED — PENDING REVIEW\. NOT APPLIED/);
    assert.match(sql, /organizer_payout_details already exists; do not apply Organizer P2 twice/);
  });

  it("stores payout details per organizer with strict column checks", () => {
    assert.match(sql, /CREATE TABLE public\.organizer_payout_details/);
    assert.match(sql, /organizer_id uuid PRIMARY KEY REFERENCES public\.organizers\(id\) ON DELETE CASCADE/);
    assert.match(sql, /account_number text NOT NULL CHECK \(account_number ~ '\^\[0-9\]\{10\}\$'\)/);
  });

  it("keeps payout details owner-only", () => {
    assert.match(sql, /CREATE POLICY "Owners manage own payout details"/);
    assert.match(sql, /o\.owner_id = auth\.uid\(\)/);
    assert.match(sql, /REVOKE ALL ON public\.organizer_payout_details FROM PUBLIC, anon/);
    assert.match(sql, /GRANT SELECT, INSERT, UPDATE ON public\.organizer_payout_details TO authenticated/);
  });

  it("requires RSVPs to target published, uncancelled events", () => {
    assert.match(sql, /DROP POLICY IF EXISTS "Attendees insert own rsvps"/);
    assert.match(sql, /CREATE POLICY "Attendees insert own rsvps"/);
    assert.match(sql, /e\.published = true AND e\.status <> 'cancelled'/);
  });

  it("documents the manual-money boundary", () => {
    assert.match(sql, /MANUAL payouts/);
    assert.match(sql, /No automated refunds, transfers, or payouts/);
  });
});
