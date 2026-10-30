-- PROPOSED forward-only Supabase migration: organizer publishing suspension.
--
-- STATUS: PROPOSAL ONLY — NOT REVIEWED, NOT APPLIED. Do not run this file
-- until it has been reviewed and explicitly approved. The Phase 2B admin UI
-- states that organizer-level restriction needs this pending change.
--
-- Why this migration is needed:
-- Phase 2B inspection proved that organizers.verified is display-only: no RLS
-- policy or application check gates event creation on it, so flipping it can
-- never honestly restrict publishing. A suspended OWNER already cannot publish
-- (the "Creators insert events" policy requires auth.uid() = created_by, and a
-- banned owner holds no valid session), but there is no way to restrict one
-- organizer while its owner stays active. This migration adds that switch with
-- database-level enforcement, so it cannot be bypassed by direct API writes.
--
-- What it does:
-- * Adds organizers.publishing_suspended (boolean, NOT NULL, DEFAULT false).
--   No backfill needed: every existing organizer keeps publishing rights.
-- * Replaces "Creators insert events" so suspended organizers cannot create
--   events. The rest of the policy is byte-identical to the current version.
-- * Replaces "Creators update events" so a suspended organizer cannot reach a
--   published=true row: drafts stay editable and live events can still be
--   unpublished, but publishing or editing-while-published is blocked. This
--   strictness is deliberate and documented below; reviewers must confirm it.
-- * Adds set_organizer_publishing_suspended() RPC (SECURITY DEFINER) that only
--   super_admin and moderation_admin may call, and that writes its audit row
--   in the same transaction. Role names are intentionally duplicated from the
--   TypeScript permission map; both must be updated together if roles change.
--
-- Deliberately NOT included:
-- * No changes to tiers policies: a suspended organizer cannot create events,
--   so new tiered events are impossible; editing tiers on pre-existing events
--   while suspended remains possible. Flagged for review, not silently fixed.
-- * No change to the verified badge, RSVP flow, or Realtime publication.
--
-- Reviewer checklist before applying:
-- 1. Diff the two replacement policies below against the live definitions;
--    only the publishing_suspended clauses may differ.
-- 2. Confirm the strict update rule (no edits to live events while suspended).
-- 3. Decide the tiers gap in NOT INCLUDED above.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.organizers') IS NULL THEN
    RAISE EXCEPTION 'Organizer suspension requires the existing public.organizers table.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events'
      AND policyname = 'Creators insert events'
  ) THEN
    RAISE EXCEPTION 'Expected policy "Creators insert events" is missing; review live policies first.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events'
      AND policyname = 'Creators update events'
  ) THEN
    RAISE EXCEPTION 'Expected policy "Creators update events" is missing; review live policies first.';
  END IF;
END;
$$;

ALTER TABLE public.organizers
  ADD COLUMN IF NOT EXISTS publishing_suspended boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizers.publishing_suspended IS
  'True while an admin has suspended this organizer publishing. Suspended organizers cannot create events or hold published events; drafts stay editable and events can still be unpublished.';

DROP POLICY IF EXISTS "Creators insert events" ON public.events;
CREATE POLICY "Creators insert events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.organizers o
      WHERE o.id = organizer_id
        AND o.owner_id = auth.uid()
        AND o.publishing_suspended = false
    )
  );

DROP POLICY IF EXISTS "Creators update events" ON public.events;
CREATE POLICY "Creators update events"
  ON public.events FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.organizers o
      WHERE o.id = organizer_id AND o.owner_id = auth.uid()
    )
    AND (
      published = false
      OR EXISTS (
        SELECT 1
        FROM public.organizers o
        WHERE o.id = organizer_id
          AND o.owner_id = auth.uid()
          AND o.publishing_suspended = false
      )
    )
  );

CREATE OR REPLACE FUNCTION public.set_organizer_publishing_suspended(
  p_organizer_id uuid,
  p_suspended boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to change publishing status.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'moderation_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or moderation_admin may change publishing status.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizers WHERE id = p_organizer_id) THEN
    RAISE EXCEPTION 'No such organizer.';
  END IF;
  UPDATE public.organizers
  SET publishing_suspended = p_suspended
  WHERE id = p_organizer_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    CASE WHEN p_suspended THEN 'admin.organizer.suspend' ELSE 'admin.organizer.restore' END,
    'organizers',
    p_organizer_id::text,
    jsonb_build_object('publishing_suspended', p_suspended)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_organizer_publishing_suspended(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organizer_publishing_suspended(uuid, boolean) TO authenticated, service_role;

COMMIT;

-- Rollback (review only; run as one script if the proposal is withdrawn):
-- BEGIN;
-- DROP POLICY IF EXISTS "Creators insert events" ON public.events;
-- CREATE POLICY "Creators insert events"
--   ON public.events FOR INSERT TO authenticated
--   WITH CHECK (
--     auth.uid() = created_by
--     AND EXISTS (
--       SELECT 1
--       FROM public.organizers o
--       WHERE o.id = organizer_id AND o.owner_id = auth.uid()
--     )
--   );
-- DROP POLICY IF EXISTS "Creators update events" ON public.events;
-- CREATE POLICY "Creators update events"
--   ON public.events FOR UPDATE TO authenticated
--   WITH CHECK (
--     auth.uid() = created_by
--     AND EXISTS (
--       SELECT 1
--       FROM public.organizers o
--       WHERE o.id = organizer_id AND o.owner_id = auth.uid()
--     )
--   );
-- DROP FUNCTION IF EXISTS public.set_organizer_publishing_suspended(uuid, boolean);
-- ALTER TABLE public.organizers DROP COLUMN IF EXISTS publishing_suspended;
-- COMMIT;
