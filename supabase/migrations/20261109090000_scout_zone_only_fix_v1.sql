-- PROPOSED forward-only Supabase migration: Scout zone_only coverage fix.
--
-- STATUS: PROPOSAL ONLY — NOT REVIEWED, NOT APPLIED. Do not run this file
-- without explicit authorization.
--
-- Why: the live database received the S1/S2-era Scout migration whose
-- scout_run_coverage status CHECK allows only
-- ('unsearched','nationwide_only','targeted'). The S3 code marks Tier B zone
-- sweeps as 'zone_only', which the live CHECK rejects. This migration widens
-- the CHECK and hardens the three financial-safety triggers to SECURITY
-- DEFINER (closing an RLS bypass where invoker-rights lookups on the
-- staff-only scout_event_links table silently returned zero rows).
--
-- Safety properties:
-- * Every action is conditional or IF EXISTS-guarded: safe to run even if
--   parts were already applied; the CHECK step is a verified no-op when
--   zone_only is already allowed.
-- * No data is modified, deleted, or backfilled. No policies are weakened.
-- * Trigger logic and messages are byte-identical to S0; only the security
--   attribute changes, plus drop-before-recreate ordering.
BEGIN;

-- ── 1. Widen the coverage CHECK only if zone_only is missing ─────────────
DO $$
DECLARE
  constraint_name text;
  constraint_def text;
BEGIN
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO constraint_name, constraint_def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE t.relname = 'scout_run_coverage'
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) LIKE '%targeted%';
  IF constraint_name IS NULL THEN
    RAISE EXCEPTION 'Scout fix: no coverage status CHECK found; base migration may be missing.';
  ELSIF position('zone_only' IN constraint_def) = 0 THEN
    EXECUTE format('ALTER TABLE public.scout_run_coverage DROP CONSTRAINT %I', constraint_name);
    ALTER TABLE public.scout_run_coverage
      ADD CONSTRAINT scout_run_coverage_status_check
      CHECK (status IN ('unsearched', 'nationwide_only', 'zone_only', 'targeted'));
    RAISE NOTICE 'Scout fix: coverage CHECK widened to include zone_only.';
  ELSE
    RAISE NOTICE 'Scout fix: coverage CHECK already allows zone_only; no change.';
  END IF;
END;
$$;

-- ── 2. Harden the financial-safety triggers (idempotent) ─────────────────
-- SECURITY DEFINER is required: the guards look up public.scout_event_links,
-- which grants nothing to user roles. Under invoker rights the lookup would
-- return zero rows for ordinary owners and the guard would silently pass.
-- These functions take no arguments and perform fixed existence checks only,
-- so definer rights expose no privileged interface. Owner is the applying
-- role (postgres via SQL Editor).
--
-- Order matters: triggers must go before their functions can be dropped.
DROP TRIGGER IF EXISTS scout_block_ticket_sales ON public.event_ticket_tiers;
DROP TRIGGER IF EXISTS scout_block_paid_conversion ON public.events;
DROP TRIGGER IF EXISTS scout_block_external_rsvp ON public.event_attendees;

DROP FUNCTION IF EXISTS public.block_scout_ticket_sales();
DROP FUNCTION IF EXISTS public.block_scout_paid_conversion();
DROP FUNCTION IF EXISTS public.block_external_ticket_rsvp();

CREATE FUNCTION public.block_scout_ticket_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.scout_event_links l WHERE l.event_id = NEW.event_id
  ) THEN
    RAISE EXCEPTION 'Scout-sourced events cannot have Outrazo ticket tiers.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.block_scout_paid_conversion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.event_type = 'paid' AND EXISTS (
    SELECT 1 FROM public.scout_event_links l WHERE l.event_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Scout-sourced events cannot convert to paid Outrazo events.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.block_external_ticket_rsvp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = NEW.event_id AND e.external_ticket_url IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This event takes registration on the organizer''s own site.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER scout_block_ticket_sales
  BEFORE INSERT ON public.event_ticket_tiers
  FOR EACH ROW EXECUTE FUNCTION public.block_scout_ticket_sales();

CREATE TRIGGER scout_block_paid_conversion
  BEFORE INSERT OR UPDATE OF event_type ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.block_scout_paid_conversion();

CREATE TRIGGER scout_block_external_rsvp
  BEFORE INSERT ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.block_external_ticket_rsvp();

COMMIT;
