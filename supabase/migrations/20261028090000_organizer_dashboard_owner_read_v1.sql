-- Forward-only Supabase migration: Organizer Dashboard V1 owner read access.
--
-- Why this migration exists:
-- The Create Event V1 migration (20261021180000) grants creators INSERT and
-- UPDATE on public.events, but no owner-scoped SELECT policy ships with it.
-- The organizer dashboard lists, counts, and loads the signed-in organizer's
-- own events (drafts and published). With row-level security enabled and no
-- owner SELECT policy, those reads silently return zero rows and the
-- dashboard shows empty states even though the events exist.
--
-- This migration adds ONE policy: authenticated organizers can SELECT rows
-- where they are the creator (auth.uid() = created_by). It is purely
-- additive and owner-scoped; it does not widen public access and does not
-- touch any other policy.
--
-- Deliberately NOT included:
-- * No DELETE policy. Dashboard V1 ships no delete action: unpublishing
--   removes an event from public discovery without deleting it. Add an
--   owner-scoped DELETE policy only when a delete action ships.
-- * No ALTER TABLE ... ENABLE ROW LEVEL SECURITY. If RLS is currently off,
--   turning it on here could break public Explore reads unless a public
--   SELECT policy already exists on the deployed database. Verify deployed
--   policies in the Supabase dashboard before changing RLS enforcement.
--
-- Do NOT replay Drizzle migrations against the existing database.
-- Review, then apply once via the Supabase dashboard SQL editor or CLI.
-- This file has NOT been applied by the implementation session.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION 'Organizer Dashboard V1 requires the existing public.events table; reconcile the base schema before applying this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'events'
      AND column_name = 'created_by'
  ) THEN
    RAISE EXCEPTION 'Organizer Dashboard V1 requires public.events.created_by; reconcile the base schema before applying this migration.';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Owners read their events" ON public.events;
CREATE POLICY "Owners read their events"
  ON public.events FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

COMMIT;
