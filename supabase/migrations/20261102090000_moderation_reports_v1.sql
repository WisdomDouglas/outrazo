-- PROPOSED forward-only Supabase migration: moderation reports (Phase 2C-1).
--
-- STATUS: PROPOSAL ONLY — NOT REVIEWED, NOT APPLIED. Do not run this file
-- until it has been reviewed and explicitly approved. The admin Reports UI and
-- the public Report button depend on this migration; until it is applied, both
-- surfaces report the backend as unavailable instead of failing silently.
--
-- Why this migration is needed:
-- Users currently have no way to flag abusive or misleading events, and staff
-- have no queue for reviewing such flags. This migration adds an event_reports
-- table plus two guarded RPCs: one for filing reports (any signed-in user,
-- rate-limited) and one for resolving them (moderation staff only, audited).
--
-- What it does:
-- * Creates public.event_reports with reason/status CHECKs, a partial unique
--   index allowing only one PENDING report per reporter per event, and
--   supporting indexes for the staff queue.
-- * Preserves moderation history: event_id uses ON DELETE RESTRICT, so an
--   event with reports cannot be deleted at all; reporter_id is nullable with
--   ON DELETE SET NULL, so deleting a profile anonymizes (never destroys) its
--   reports. Anonymous rows match no RLS reader and become staff-only.
-- * Enables RLS with a single SELECT-own policy: reporters can read only their
--   own rows. There are deliberately NO insert/update/delete policies, so all
--   writes must go through the RPCs below and the daily limit cannot be
--   bypassed by direct table writes. Table-level grants match: SELECT for
--   authenticated, ALL for service_role (used only by permission-checked
--   server functions for staff reads).
-- * Adds file_event_report() RPC (SECURITY DEFINER): validates the reason and
--   details length, requires the event to exist, serializes the reporter's
--   filings on their own profile row, enforces a daily limit of 10 reports per
--   rolling 24 hours, rejects duplicate pending reports for the same event
--   with a friendly message, then inserts and returns the report id.
-- * Adds resolve_event_report() RPC (SECURITY DEFINER): allows only
--   super_admin and moderation_admin; rejects dismissed-plus-unpublish
--   combinations; locks the report row; requires status pending; optionally
--   unpublishes the event; stamps the resolution; and writes the audit row
--   recording whether the event was ACTUALLY unpublished — all in the same
--   transaction, so concurrent resolvers cannot double-resolve and resolution
--   is never unaudited.
--
-- Security boundary (SECURITY DEFINER review):
-- * Owner: the role that applies this migration (postgres when applied via the
--   Supabase SQL Editor). Both RPCs execute with the owner's rights; only the
--   owner (or a superuser) can replace them. Verify after applying:
--     select p.proname, pg_get_userbyid(p.proowner) as owner,
--       p.prosecdef as security_definer
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('file_event_report', 'resolve_event_report');
-- * Grants: EXECUTE to authenticated and service_role only; revoked from
--   PUBLIC and anon. Internal gates still apply: filing requires a signed-in
--   caller, resolution requires super_admin/moderation_admin. Verify with:
--     select routine_name, grantee, privilege_type
--     from information_schema.routine_privileges
--     where specific_schema = 'public'
--       and routine_name in ('file_event_report', 'resolve_event_report');
-- * Search path: both RPCs run with SET search_path = '', so ONLY pg_catalog
--   (built-in functions, operators, and types, always searched) plus
--   explicitly qualified names resolve. Every table is public-qualified and
--   the auth helper is auth.uid()-qualified; no temporary-schema or
--   public-schema object can shadow anything either function uses, and any
--   future unqualified reference fails loudly instead of reading the wrong
--   object. Remaining bare names (now, count, trim, coalesce, nullif,
--   char_length, jsonb_build_object, uuid/text/boolean/integer/timestamptz,
--   and all operators) are pg_catalog built-ins or SQL keywords, which cannot
--   be shadowed under an empty path.
-- * DDL-time names (gen_random_uuid() default, argument/return types) resolve
--   once via the trusted applying role and are stored by OID, so later
--   objects cannot shadow them either.
--
-- Deliberately NOT included:
-- * No cap on reports AGAINST one event and no auto-moderation: reports are
--   advisory-only and never change an event without a staff resolution.
-- * No block on reporting your own event or a draft: harmless, and adding an
--   unstated restriction would complicate review. Flagged for reviewers.
-- * No event archival flow: RESTRICT means organizer event deletion now fails
--   for reported events with a database error. A friendly message or archival
--   purge flow is future work, not silently added here.
-- * No changes to events, profiles, organizers, tiers, attendees, RSVP
--   trigger/function, Realtime publication, admin_roles, audit_log schema, or
--   any existing policy.
--
-- Policy choices for reviewers to confirm:
-- 1. Daily filing limit: 10 reports per reporter per rolling 24 hours.
-- 2. Details limit 1000 chars; resolution note limit 500 chars.
-- 3. Terminal states only (pending -> dismissed | actioned); no reopen.
-- 4. Dismissed resolutions never unpublish; actioned resolutions may.
-- 5. Reported events are deletion-protected; deleted reporters anonymize.
--
-- Reviewer checklist before applying:
-- 1. Confirm public.profiles, public.events, public.admin_roles, and
--    public.audit_log exist with the expected key columns.
-- 2. Confirm the policy choices above, especially RESTRICT on event deletion.
-- 3. Apply once via the Supabase dashboard SQL editor or CLI, then run the
--    verification queries in the Phase 2C-1 report (policies, trigger-free
--    design, RPC existence, grants, and a file-then-resolve cycle with two
--    test accounts).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Moderation reports require the existing public.profiles table.';
  END IF;
  IF to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION 'Moderation reports require the existing public.events table.';
  END IF;
  IF to_regclass('public.admin_roles') IS NULL THEN
    RAISE EXCEPTION 'Moderation reports require the Phase 1 public.admin_roles table. Apply that migration first.';
  END IF;
  IF to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION 'Moderation reports require the Phase 1 public.audit_log table. Apply that migration first.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  reporter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL
    CHECK (reason IN ('spam', 'misleading', 'inappropriate', 'scam', 'other')),
  details text CHECK (details IS NULL OR char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dismissed', 'actioned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_note text CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500)
);

COMMENT ON TABLE public.event_reports IS
  'User-filed moderation flags against events. Writes go through file_event_report() and resolve_event_report() only; reporters can read their own rows. Reported events cannot be deleted (RESTRICT); deleted reporters anonymize to NULL (SET NULL).';

CREATE INDEX IF NOT EXISTS event_reports_event_idx
  ON public.event_reports (event_id);
CREATE INDEX IF NOT EXISTS event_reports_status_created_idx
  ON public.event_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS event_reports_reporter_created_idx
  ON public.event_reports (reporter_id, created_at DESC);
-- One pending report per reporter per event. This is a duplicate guard, NOT
-- the daily limit: the filing RPC enforces the limit with a locked count, and
-- this index is the backstop (including against privileged direct writes).
-- NULL reporters (anonymized rows) never collide: Postgres treats NULLs as
-- distinct in unique indexes.
CREATE UNIQUE INDEX IF NOT EXISTS event_reports_pending_unique
  ON public.event_reports (event_id, reporter_id) WHERE status = 'pending';

ALTER TABLE public.event_reports ENABLE ROW LEVEL SECURITY;

-- Reporters read their OWN rows only (to see their report status). Anonymized
-- rows (reporter_id NULL) match no caller and are staff-only. No
-- insert/update/delete policies exist on purpose: direct writes are denied
-- and every write flows through the guarded RPCs below.
CREATE POLICY "Reporters read own reports"
  ON public.event_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);

REVOKE ALL ON public.event_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_reports TO authenticated;
GRANT ALL ON public.event_reports TO service_role;

CREATE OR REPLACE FUNCTION public.file_event_report(
  p_event_id uuid,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reporter uuid := auth.uid();
  v_details text;
  v_count integer;
  v_report_id uuid;
BEGIN
  IF v_reporter IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to report an event.';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('spam', 'misleading', 'inappropriate', 'scam', 'other') THEN
    RAISE EXCEPTION 'Unknown report reason.';
  END IF;
  v_details := NULLIF(trim(COALESCE(p_details, '')), '');
  IF v_details IS NOT NULL AND char_length(v_details) > 1000 THEN
    RAISE EXCEPTION 'Report details are too long (1000 characters maximum).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'That event no longer exists.';
  END IF;
  -- Serialize this reporter's filings on their own profile row, so two
  -- concurrent requests cannot both pass the daily-limit count below.
  PERFORM 1 FROM public.profiles WHERE id = v_reporter FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile exists for this account.';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.event_reports
  WHERE reporter_id = v_reporter
    AND created_at > now() - interval '24 hours';
  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Daily report limit reached. Try again tomorrow.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.event_reports
    WHERE event_id = p_event_id AND reporter_id = v_reporter AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You have already reported this event. Our team will review it.';
  END IF;
  INSERT INTO public.event_reports (event_id, reporter_id, reason, details)
  VALUES (p_event_id, v_reporter, p_reason, v_details)
  RETURNING id INTO v_report_id;
  RETURN v_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_event_report(
  p_report_id uuid,
  p_resolution text,
  p_unpublish boolean DEFAULT false,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_event_id uuid;
  v_reason text;
  v_status text;
  v_note text;
  v_unpublished boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to resolve reports.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'moderation_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or moderation_admin may resolve reports.';
  END IF;
  IF p_resolution IS NULL OR p_resolution NOT IN ('dismissed', 'actioned') THEN
    RAISE EXCEPTION 'Unknown resolution.';
  END IF;
  -- Dismissing means "no violation": it must never change the event. Actioned
  -- resolutions may optionally unpublish. Enforced here, not just in the UI,
  -- so direct RPC callers cannot combine them either.
  IF p_resolution = 'dismissed' AND p_unpublish THEN
    RAISE EXCEPTION 'Dismissed reports cannot unpublish events.';
  END IF;
  v_note := NULLIF(trim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Resolution note is too long (500 characters maximum).';
  END IF;
  -- Lock the report row first: a concurrent resolver blocks here, then sees
  -- the non-pending status below instead of double-resolving.
  SELECT event_id, reason, status INTO v_event_id, v_reason, v_status
  FROM public.event_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That report no longer exists.';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'That report was already resolved. Refresh to see its current state.';
  END IF;
  IF p_unpublish THEN
    -- Conditional update: already-draft events simply match no row. FOUND
    -- captures whether WE flipped the flag, so the audit below records the
    -- actual outcome instead of the request.
    UPDATE public.events SET published = false
    WHERE id = v_event_id AND published = true;
    IF FOUND THEN
      v_unpublished := true;
    END IF;
  END IF;
  UPDATE public.event_reports
  SET status = p_resolution, resolved_at = now(), resolved_by = v_caller,
      resolution_note = v_note
  WHERE id = p_report_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    CASE WHEN p_resolution = 'dismissed' THEN 'admin.report.dismiss' ELSE 'admin.report.action' END,
    'event_reports',
    p_report_id::text,
    jsonb_build_object('event_id', v_event_id, 'reason', v_reason, 'unpublished', v_unpublished)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.file_event_report(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_event_report(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.file_event_report(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_event_report(uuid, text, boolean, text) TO authenticated, service_role;

COMMIT;

-- Rollback (review only; run as one script if the proposal is withdrawn):
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.resolve_event_report(uuid, text, boolean, text);
-- DROP FUNCTION IF EXISTS public.file_event_report(uuid, text, text);
-- DROP TABLE IF EXISTS public.event_reports;
-- COMMIT;
