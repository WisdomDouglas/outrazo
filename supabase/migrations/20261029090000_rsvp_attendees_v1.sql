-- Forward-only Supabase migration: free-event RSVP (event_attendees).
--
-- Why this migration exists:
-- The app is gaining real RSVPs: signed-in users insert one row per event
-- into public.event_attendees, My Tickets reads those rows back, and
-- organizers read the attendee lists of their own events. The Drizzle base
-- schema describes this table, but the Drizzle base must never be replayed
-- against the existing database, and no Supabase migration creates the table
-- yet. This file therefore creates (or verifies) ONLY the RSVP objects.
--
-- What it does:
-- * Creates public.event_attendees when missing (id, event_id, user_id,
--   status, created_at), with the duplicate-proof UNIQUE(event_id, user_id)
--   constraint and cascade foreign keys. When the table already exists, its
--   columns and constraints are verified instead; anything incompatible
--   aborts the migration for manual review.
-- * Grants + RLS + the four self-scoped policies (read/insert/update/delete
--   own rows), matching the base design.
-- * Adds "Event organizers read their attendees": organizers can SELECT
--   attendee rows ONLY for events they created (events.created_by).
-- * Adds "Event organizers read attendee profiles": organizers can SELECT
--   profile rows ONLY for users who hold an RSVP on one of their own events.
--   Unrelated profiles stay invisible; there is no way to enumerate users.
-- * Keeps events.attendee_count accurate with a trigger (insert +1, delete
--   -1 floored at 0) and a one-time backfill. The backfill assigns absolute
--   counts (never increments), so re-running cannot double-count, and it
--   cannot fire the trigger because it writes events, not event_attendees.
--
-- Deliberately NOT included:
-- * No paid orders, payments, QR check-in, or capacity enforcement.
-- * No changes to existing policies on events, organizers, or profiles.
--
-- Do NOT replay Drizzle migrations against the existing database.
-- Review, verify the live checks in the implementation report, then apply
-- once via the Supabase dashboard SQL editor or CLI.
-- This file has NOT been applied by the implementation session.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.events') IS NULL
    OR to_regclass('public.profiles') IS NULL
  THEN
    RAISE EXCEPTION 'RSVP V1 requires the existing public.events and public.profiles tables; reconcile the base schema before applying this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'attendee_count'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'created_by'
  ) THEN
    RAISE EXCEPTION 'RSVP V1 requires public.events.attendee_count and public.events.created_by; reconcile the base schema before applying this migration.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_attendees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'going',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_attendees_pkey PRIMARY KEY (id),
  CONSTRAINT event_attendees_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT event_attendees_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT event_attendees_event_id_user_id_key
    UNIQUE (event_id, user_id)
);

DO $$
DECLARE
  missing_columns text;
BEGIN
  -- If the table pre-existed, verify it matches the expected shape.
  SELECT string_agg(required.column_name, ', ')
  INTO missing_columns
  FROM (VALUES
    ('id', 'uuid'),
    ('event_id', 'uuid'),
    ('user_id', 'uuid'),
    ('status', 'text'),
    ('created_at', 'timestamp with time zone')
  ) AS required(column_name, data_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = 'event_attendees'
      AND actual.column_name = required.column_name
      AND actual.data_type = required.data_type
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'public.event_attendees exists with an incompatible schema; review columns: %', missing_columns;
  END IF;

  -- Add a constraint only when no equivalent exists. Existence checks (not
  -- error-catching) are used because Postgres reports some conflicts, such
  -- as a second primary key, with their own error code (42P16) rather than
  -- duplicate_object, which would abort the migration on a healthy schema.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_attendees'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.event_attendees ADD CONSTRAINT event_attendees_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_attendees'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'event_id' AND NOT attisdropped)
      ]::smallint[]
  ) THEN
    ALTER TABLE public.event_attendees
      ADD CONSTRAINT event_attendees_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_attendees'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'user_id' AND NOT attisdropped)
      ]::smallint[]
  ) THEN
    ALTER TABLE public.event_attendees
      ADD CONSTRAINT event_attendees_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_attendees'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'event_id' AND NOT attisdropped),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'user_id' AND NOT attisdropped)
      ]::smallint[]
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_attendees'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'user_id' AND NOT attisdropped),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'event_id' AND NOT attisdropped)
      ]::smallint[]
  ) THEN
    ALTER TABLE public.event_attendees
      ADD CONSTRAINT event_attendees_event_id_user_id_key UNIQUE (event_id, user_id);
  END IF;

  -- Semantic backstop: whatever the names, the guarantees must hold.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_attendees'::regclass
      AND contype = 'u'
      AND convalidated
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'event_id' AND NOT attisdropped),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'user_id' AND NOT attisdropped)
      ]::smallint[]
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_attendees'::regclass
      AND contype = 'u'
      AND convalidated
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'user_id' AND NOT attisdropped),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.event_attendees'::regclass AND attname = 'event_id' AND NOT attisdropped)
      ]::smallint[]
  ) THEN
    RAISE EXCEPTION 'public.event_attendees has no unique constraint on (event_id, user_id); duplicate RSVPs would be possible. Review before applying.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_constraint
    WHERE conrelid = 'public.event_attendees'::regclass
      AND contype = 'f'
      AND convalidated
      AND confdeltype = 'c'
  ) < 2 THEN
    RAISE EXCEPTION 'public.event_attendees is missing cascade foreign keys; review before applying.';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS event_attendees_event_id_idx
  ON public.event_attendees (event_id);
CREATE INDEX IF NOT EXISTS event_attendees_user_id_idx
  ON public.event_attendees (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_attendees TO authenticated;
GRANT ALL ON public.event_attendees TO service_role;
-- The attendee-profile policy below needs this grant to function; RLS
-- policies still decide which profile rows are visible.
GRANT SELECT ON public.profiles TO authenticated;
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attendees read own rsvps" ON public.event_attendees;
CREATE POLICY "Attendees read own rsvps"
  ON public.event_attendees FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Attendees insert own rsvps" ON public.event_attendees;
CREATE POLICY "Attendees insert own rsvps"
  ON public.event_attendees FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Attendees update own rsvps" ON public.event_attendees;
CREATE POLICY "Attendees update own rsvps"
  ON public.event_attendees FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Attendees delete own rsvps" ON public.event_attendees;
CREATE POLICY "Attendees delete own rsvps"
  ON public.event_attendees FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Event organizers read their attendees" ON public.event_attendees;
CREATE POLICY "Event organizers read their attendees"
  ON public.event_attendees FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_attendees.event_id AND e.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Event organizers read attendee profiles" ON public.profiles;
CREATE POLICY "Event organizers read attendee profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.event_attendees a
      JOIN public.events e ON e.id = a.event_id
      WHERE a.user_id = profiles.id AND e.created_by = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.sync_event_attendee_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.events
    SET attendee_count = attendee_count + 1
    WHERE id = NEW.event_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.events
    SET attendee_count = GREATEST(attendee_count - 1, 0)
    WHERE id = OLD.event_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS event_attendees_count_sync ON public.event_attendees;
CREATE TRIGGER event_attendees_count_sync
  AFTER INSERT OR DELETE ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_attendee_count();

-- One-time correction: set every event to its true RSVP count. Absolute
-- assignment (not += 1 per row) makes this idempotent, so installing the
-- trigger alongside can never double-count, and the trigger cannot fire
-- here because only events rows are written.
UPDATE public.events e
SET attendee_count = (SELECT COUNT(*) FROM public.event_attendees a WHERE a.event_id = e.id)
WHERE e.attendee_count IS DISTINCT FROM (SELECT COUNT(*) FROM public.event_attendees a WHERE a.event_id = e.id);

COMMIT;
