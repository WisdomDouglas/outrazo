-- Forward-only Supabase migration: Realtime attendee counts.
--
-- Why this migration exists:
-- The app subscribes to live attendee counts with Supabase Realtime
-- (postgres_changes). Realtime only streams tables that belong to the
-- `supabase_realtime` publication, so this migration adds the two RSVP
-- tables to it. No application data, RLS policy, or trigger changes here.
--
-- What it does:
-- * Adds public.events and public.event_attendees to the
--   supabase_realtime publication, each guarded so re-running is safe.
--   Publication membership grants no access by itself: Realtime filters
--   every message through the tables' existing RLS policies, so anonymous
--   visitors receive only published-event counts and organizers receive
--   only their own events' attendee rows.
-- * Sets REPLICA IDENTITY FULL on public.event_attendees only. Filtered
--   DELETE signals need the old row image; events UPDATEs already carry
--   the new row by default, so events keeps its default identity.
--
-- Deliberately NOT included:
-- * No policy, trigger, function, or backfill changes (see the RSVP
--   migration). Apply the RSVP migration first: without its trigger, no
--   count updates exist for Realtime to stream.
--
-- Do NOT replay Drizzle migrations against the existing database.
-- Review, then apply once via the Supabase dashboard SQL editor or CLI.
-- Verify afterwards with:
--   SELECT schemaname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename IN ('events', 'event_attendees');
--   SELECT relname, relreplident FROM pg_class
--   WHERE relname IN ('events', 'event_attendees');
-- This file has NOT been applied by the implementation session.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.events') IS NULL
    OR to_regclass('public.event_attendees') IS NULL
  THEN
    RAISE EXCEPTION 'Realtime counts require the existing public.events and public.event_attendees tables; apply the RSVP migration first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'event_attendees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_attendees;
  END IF;
END;
$$;

-- Re-running this statement is safe: it sets the same identity again.
ALTER TABLE public.event_attendees REPLICA IDENTITY FULL;

COMMIT;
