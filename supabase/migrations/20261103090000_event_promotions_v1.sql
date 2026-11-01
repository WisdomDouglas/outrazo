-- PROPOSED forward-only Supabase migration: event promotions (Phase 2C-2).
--
-- STATUS: REVIEWED — APPROVED, NOT APPLIED. This migration has passed
-- implementation and SQL/security review, but it has NOT been applied to
-- Supabase. Do not execute it without explicit authorization. The admin
-- Promotions page and the homepage spotlight depend on this migration; until
-- it is applied, both surfaces report the backend as unavailable instead of
-- failing silently.
--
-- Why this migration is needed:
-- Staff currently have no way to feature an event on the homepage: the home
-- "Featured events" grid is purely algorithmic. This migration adds an
-- event_promotions scheduling table plus two guarded RPCs: one for scheduling
-- promotions (a future or effective-now window on one event) and one for
-- cancelling them (moderation staff only, audited).
--
-- What it does:
-- * Creates public.event_promotions with a window CHECK (ends_at > starts_at),
--   a stored status ('active' | 'cancelled'), and a partial exclusion
--   constraint so live ('active') promotion windows can never overlap — which
--   is exactly the one-slot homepage rule, enforced transaction-safely at the
--   database level. Cancelled rows are excluded from the constraint, so a
--   cancelled window never blocks reuse of its time.
-- * Preserves promotion history: event_id uses ON DELETE RESTRICT and
--   created_by is nullable with ON DELETE SET NULL. Deleting a staff profile
--   anonymizes its promotions; deleting an event with ANY promotion row is
--   refused (see deletion restriction below).
-- * Enables RLS with a single SELECT policy for anon and authenticated that
--   exposes only the currently active window, evaluated with database time.
--   Column grants expose only scheduling columns (id, event_id, status,
--   starts_at, ends_at): creator identities stay staff-only. There are
--   deliberately NO insert/update/delete policies: all writes go through the
--   RPCs below. Table-level ALL goes to service_role only (used by
--   permission-checked server functions for staff reads).
-- * Adds create_event_promotion() RPC (SECURITY DEFINER): allows only
--   super_admin and moderation_admin; validates the window; requires the event
--   to exist, be published, and not be cancelled; rejects windows overlapping
--   a live promotion with a friendly message (the exclusion constraint is the
--   race backstop); inserts; writes the audit row — all in one transaction.
-- * Adds cancel_event_promotion() RPC (SECURITY DEFINER): allows only
--   super_admin and moderation_admin; locks the row; requires status 'active'
--   and a window that has not ended; flips status to 'cancelled'; writes the
--   audit row — all in one transaction, so concurrent cancels cannot
--   double-cancel.
--
-- Promotion states (no activation writes, no cron, no polling):
-- * scheduled / active / expired are DERIVED from the window using database
--   time: scheduled while starts_at is in the future, active from starts_at up
--   to (not including) ends_at, expired once ends_at passes.
-- * cancelled is the stored terminal state. Activation and expiry therefore
--   need no job and produce no audit rows: nothing was written and no one
--   acted. Schedule and cancel are the audited transitions.
--
-- DELETION RESTRICTION (approved design, please read before applying):
-- Because promotion history is preserved, deleting an event that has ANY
-- event_promotions row — scheduled, active, expired, or cancelled — FAILS with
-- a foreign-key violation (SQLSTATE 23503), including organizer self-deletes.
-- There is intentionally no purge RPC in this migration: cancelled
-- promotions stay for the record. If event deletion for promoted events is
-- ever required, it needs a separate reviewed workflow (friendly delete
-- message and/or a staff purge RPC with its own audit), not a silent change
-- here. To delete such an event today, remove its promotion rows only via a
-- reviewed database operation.
--
-- Security boundary (SECURITY DEFINER review):
-- * Owner: the role that applies this migration (postgres when applied via the
--   Supabase SQL Editor). Both RPCs execute with the owner's rights; only the
--   owner (or a superuser) can replace them. Verify after applying:
--     select p.proname, pg_get_userbyid(p.proowner) as owner,
--       p.prosecdef as security_definer
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('create_event_promotion', 'cancel_event_promotion');
-- * Grants: EXECUTE to authenticated and service_role only; revoked from
--   PUBLIC and anon. Internal gates still apply: both RPCs require
--   super_admin/moderation_admin. Verify with:
--     select routine_name, grantee, privilege_type
--     from information_schema.routine_privileges
--     where specific_schema = 'public'
--       and routine_name in ('create_event_promotion', 'cancel_event_promotion');
-- * Search path: both RPCs run with SET search_path = '', so ONLY pg_catalog
--   (built-in functions, operators, and types, always searched) plus
--   explicitly qualified names resolve. Every table is public-qualified and
--   the auth helper is auth.uid()-qualified. Remaining bare names
--   (now, coalesce, tstzrange, jsonb_build_object,
--   uuid/text/boolean/timestamptz, and all operators) are pg_catalog built-ins
--   or SQL keywords, which cannot be shadowed under an empty path.
-- * DDL-time names (gen_random_uuid() default, argument/return types) resolve
--   once via the trusted applying role and are stored by OID.
--
-- Deliberately NOT included:
-- * No impression/click/conversion tracking and no performance analytics.
-- * No paid advertising, organizer self-service promotion, or payments.
-- * No reschedule RPC: change a window by cancelling and recreating it, so
--   every schedule stays an explicit audited decision.
-- * No cap on window length and no limit on scheduled-ahead time: flagged for
--   reviewers as future policy, not silently invented here.
-- * No changes to events, profiles, organizers, tiers, attendees, RSVP
--   trigger/function, Realtime publication, admin_roles, audit_log schema,
--   event_reports, or any existing policy.
--
-- Policy choices for reviewers to confirm:
-- 1. One live promotion window at a time (single homepage slot).
-- 2. Only published, non-cancelled events can be scheduled.
-- 3. Back-to-back windows are legal ('[)' bounds); only true overlaps fail.
-- 4. Promotion history is never deleted by the app; event deletion is
--   restricted while any promotion row references the event.
--
-- Reviewer checklist before applying:
-- 1. Confirm public.profiles, public.events, public.admin_roles, and
--    public.audit_log exist with the expected key columns.
-- 2. Confirm the policy choices above, especially the deletion restriction.
-- 3. Apply once via the Supabase dashboard SQL editor or CLI, then run the
--    verification queries in the Phase 2C-2 report (policies, grants, RPCs,
--    exclusion behavior, and a schedule-then-cancel cycle with two test
--    accounts, including one overlap-race attempt).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Event promotions require the existing public.profiles table.';
  END IF;
  IF to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION 'Event promotions require the existing public.events table.';
  END IF;
  IF to_regclass('public.admin_roles') IS NULL THEN
    RAISE EXCEPTION 'Event promotions require the Phase 1 public.admin_roles table. Apply that migration first.';
  END IF;
  IF to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION 'Event promotions require the Phase 1 public.audit_log table. Apply that migration first.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (ends_at > starts_at),
  -- One live window at a time: the single homepage slot, enforced for
  -- concurrent writers too (all but one overlapping insert fail). Cancelled
  -- rows sit outside the constraint via the partial predicate. Explicit '[)'
  -- bounds keep back-to-back windows legal.
  EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'active')
);

COMMENT ON TABLE public.event_promotions IS
  'Staff-scheduled homepage feature windows. Writes go through create_event_promotion() and cancel_event_promotion() only; the public can read currently active promotion rows. Referenced events cannot be deleted (RESTRICT); deleted staff anonymize to NULL (SET NULL).';

CREATE INDEX IF NOT EXISTS event_promotions_event_idx
  ON public.event_promotions (event_id);
-- Active-window lookup for the homepage and the staff queue.
CREATE INDEX IF NOT EXISTS event_promotions_status_window_idx
  ON public.event_promotions (status, starts_at, ends_at);

ALTER TABLE public.event_promotions ENABLE ROW LEVEL SECURITY;

-- The public (signed out included) can read the CURRENTLY ACTIVE window only,
-- evaluated with database time: scheduled rows stay hidden until they start,
-- expired and cancelled rows disappear on their own. No insert/update/delete
-- policies exist on purpose: direct writes are denied and every write flows
-- through the guarded RPCs below.
CREATE POLICY "Active promotions are public"
  ON public.event_promotions FOR SELECT TO anon, authenticated
  USING (status = 'active' AND starts_at <= now() AND ends_at > now());

REVOKE ALL ON public.event_promotions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, event_id, status, starts_at, ends_at) ON public.event_promotions TO anon, authenticated;
GRANT ALL ON public.event_promotions TO service_role;

CREATE OR REPLACE FUNCTION public.create_event_promotion(
  p_event_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_promotion_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to manage promotions.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'moderation_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or moderation_admin may manage promotions.';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RAISE EXCEPTION 'Choose a promotion start and end.';
  END IF;
  IF p_starts_at >= p_ends_at THEN
    RAISE EXCEPTION 'Promotion must start before it ends.';
  END IF;
  IF p_ends_at <= now() THEN
    RAISE EXCEPTION 'That window already ended. Choose an end time in the future.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'That event no longer exists.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = p_event_id AND published = true AND COALESCE(status, '') <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Only published, non-cancelled events can be promoted.';
  END IF;
  -- Friendly overlap check first; the exclusion constraint below is the
  -- backstop that makes concurrent overlapping inserts safe.
  IF EXISTS (
    SELECT 1 FROM public.event_promotions
    WHERE status = 'active'
      AND tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'That window overlaps an existing promotion.';
  END IF;
  INSERT INTO public.event_promotions (event_id, starts_at, ends_at, created_by)
  VALUES (p_event_id, p_starts_at, p_ends_at, v_caller)
  RETURNING id INTO v_promotion_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    'admin.promotion.schedule',
    'event_promotions',
    v_promotion_id::text,
    jsonb_build_object('event_id', p_event_id, 'starts_at', p_starts_at::text, 'ends_at', p_ends_at::text)
  );
  RETURN v_promotion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_event_promotion(
  p_promotion_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_event_id uuid;
  v_status text;
  v_ends_at timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to manage promotions.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'moderation_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or moderation_admin may manage promotions.';
  END IF;
  -- Lock the row first: a concurrent canceller blocks here, then sees the
  -- terminal state below instead of double-cancelling.
  SELECT event_id, status, ends_at INTO v_event_id, v_status, v_ends_at
  FROM public.event_promotions WHERE id = p_promotion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That promotion no longer exists.';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'That promotion was already cancelled. Refresh to see its current state.';
  END IF;
  IF v_ends_at <= now() THEN
    RAISE EXCEPTION 'That promotion already ended.';
  END IF;
  UPDATE public.event_promotions SET status = 'cancelled' WHERE id = p_promotion_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    'admin.promotion.cancel',
    'event_promotions',
    p_promotion_id::text,
    jsonb_build_object('event_id', v_event_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_event_promotion(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_event_promotion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_event_promotion(uuid, timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_event_promotion(uuid) TO authenticated, service_role;

COMMIT;

-- Rollback (review only; run as one script if the proposal is withdrawn):
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.cancel_event_promotion(uuid);
-- DROP FUNCTION IF EXISTS public.create_event_promotion(uuid, timestamptz, timestamptz);
-- DROP TABLE IF EXISTS public.event_promotions;
-- COMMIT;
