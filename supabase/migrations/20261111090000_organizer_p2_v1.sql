-- Organizer management V1 (P2 proposal).
--
-- STATUS: PROPOSED — PENDING REVIEW. NOT APPLIED.
-- Do not execute it without explicit authorization and the pre-checks below.
--
-- What it does:
-- * Adds public.organizer_payout_details: one bank-details row per organizer
--   profile, readable and writable ONLY by that profile's owner. This feeds
--   the MANUAL payout workflow (P5): staff read these details to pay
--   organizers outside the platform. Nothing here moves money.
-- * Hardens the event_attendees INSERT policy: reservations now require the
--   event to be published and not cancelled. Previously any signed-in user
--   could RSVP to a draft or cancelled event through a direct API call.
--
-- What it deliberately does NOT do:
-- * No changes to revenue, orders, tiers, promotions, or admin tables.
-- * No automated refunds, transfers, or payouts.
-- * No changes to existing SELECT/UPDATE/DELETE attendee policies.
--
-- Preconditions: organizers and event_attendees exist (both long applied).
-- This migration is additive except the single INSERT-policy replacement,
-- which only NARROWS who can insert (published + uncancelled events).
--
-- Reviewer checklist before applying:
-- 1. Confirm public.organizers and public.event_attendees exist.
-- 2. Confirm no object named public.organizer_payout_details exists yet.
-- 3. Apply exactly once. Application is safe with existing RSVP rows: the
--    policy change affects future inserts only.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.organizers') IS NULL THEN
    RAISE EXCEPTION 'Organizer P2 requires the existing organizers table.';
  END IF;
  IF to_regclass('public.event_attendees') IS NULL THEN
    RAISE EXCEPTION 'Organizer P2 requires the existing event_attendees table.';
  END IF;
  IF to_regclass('public.organizer_payout_details') IS NOT NULL THEN
    RAISE EXCEPTION 'organizer_payout_details already exists; do not apply Organizer P2 twice.';
  END IF;
END;
$$;

-- ── 1. Payout details (manual-workflow inputs, owner-only) ───────────────────
CREATE TABLE public.organizer_payout_details (
  organizer_id uuid PRIMARY KEY REFERENCES public.organizers(id) ON DELETE CASCADE,
  bank_name text NOT NULL CHECK (char_length(bank_name) BETWEEN 2 AND 80),
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{10}$'),
  account_name text NOT NULL CHECK (char_length(account_name) BETWEEN 2 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizer_payout_details IS
  'Bank details each organizer profile supplies for MANUAL payouts. Owner-only reads and writes; staff payout tooling (P5) reads these rows to pay organizers outside the platform.';

ALTER TABLE public.organizer_payout_details ENABLE ROW LEVEL SECURITY;

-- Owner-only: the caller must own the organizer profile. Admins have no
-- direct policy here; P5 staff tooling reads through audited server code.
CREATE POLICY "Owners manage own payout details"
  ON public.organizer_payout_details FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organizers o
      WHERE o.id = organizer_id AND o.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organizers o
      WHERE o.id = organizer_id AND o.owner_id = auth.uid()
    )
  );

REVOKE ALL ON public.organizer_payout_details FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.organizer_payout_details TO authenticated;
GRANT ALL ON public.organizer_payout_details TO service_role;

-- ── 2. RSVPs require a live, buyable event ────────────────────────────────────
-- Same policy name, stricter check: the event must be published and not
-- cancelled at insert time. Draft/cancelled RSVP attempts now fail closed.
DROP POLICY IF EXISTS "Attendees insert own rsvps" ON public.event_attendees;
CREATE POLICY "Attendees insert own rsvps"
  ON public.event_attendees FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.published = true AND e.status <> 'cancelled'
    )
  );

-- ── 3. Verification ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.organizer_payout_details') IS NULL THEN
    RAISE EXCEPTION 'Organizer P2 did not create organizer_payout_details.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizer_payout_details'
      AND policyname = 'Owners manage own payout details'
  ) THEN
    RAISE EXCEPTION 'Organizer P2 did not create the payout-details owner policy.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'event_attendees'
      AND policyname = 'Attendees insert own rsvps'
  ) THEN
    RAISE EXCEPTION 'Organizer P2 dropped the RSVP insert policy without recreating it.';
  END IF;
END;
$$;

COMMIT;
