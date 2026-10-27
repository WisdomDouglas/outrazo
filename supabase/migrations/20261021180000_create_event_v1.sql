-- Forward-only Supabase migration. Do not run the Drizzle 0000 base migration
-- against this existing database.
BEGIN;

DO $$
DECLARE
  missing_columns text;
BEGIN
  IF to_regclass('public.events') IS NULL
    OR to_regclass('public.organizers') IS NULL
    OR to_regclass('public.profiles') IS NULL
  THEN
    RAISE EXCEPTION 'Create Event V1 requires the existing public.events, public.organizers, and public.profiles tables; reconcile the base schema before applying this migration.';
  END IF;

  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO missing_columns
  FROM (VALUES
    ('events', 'id'),
    ('events', 'slug'),
    ('events', 'organizer_id'),
    ('events', 'created_by'),
    ('events', 'title'),
    ('events', 'summary'),
    ('events', 'description'),
    ('events', 'image_url'),
    ('events', 'category'),
    ('events', 'starts_at'),
    ('events', 'ends_at'),
    ('events', 'venue_name'),
    ('events', 'address'),
    ('events', 'city'),
    ('events', 'price_from'),
    ('events', 'currency'),
    ('events', 'status'),
    ('events', 'published'),
    ('organizers', 'id'),
    ('organizers', 'owner_id'),
    ('organizers', 'slug'),
    ('organizers', 'name'),
    ('organizers', 'community'),
    ('organizers', 'description'),
    ('organizers', 'location')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = required.table_name
      AND actual.column_name = required.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'Create Event V1 base schema is incomplete; missing columns: %', missing_columns;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'events'
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND policyname NOT IN ('Creators insert events', 'Creators update events')
  ) THEN
    RAISE EXCEPTION 'Unexpected INSERT/UPDATE policy exists on public.events. Review existing policies before applying Create Event V1.';
  END IF;
END;
$$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 0;

DO $$
DECLARE
  event_type_definition text;
  capacity_definition text;
  event_type_validated boolean;
  capacity_validated boolean;
BEGIN
  SELECT lower(pg_get_constraintdef(oid))
  INTO event_type_definition
  FROM pg_constraint
  WHERE conrelid = 'public.events'::regclass
    AND conname = 'events_event_type_check';

  IF event_type_definition IS NULL THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_event_type_check
      CHECK (event_type IN ('free', 'paid'));
  ELSE
    SELECT convalidated
    INTO event_type_validated
    FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND conname = 'events_event_type_check';
    event_type_definition := regexp_replace(
      replace(event_type_definition, '::text', ''),
      '\s+',
      '',
      'g'
    );
    IF NOT event_type_validated
      OR event_type_definition <> 'check((event_type=any(array[''free'',''paid''])))'
    THEN
      RAISE EXCEPTION 'Constraint events_event_type_check exists with an unexpected definition.';
    END IF;
  END IF;

  SELECT lower(pg_get_constraintdef(oid))
  INTO capacity_definition
  FROM pg_constraint
  WHERE conrelid = 'public.events'::regclass
    AND conname = 'events_capacity_check';

  IF capacity_definition IS NULL THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_capacity_check
      CHECK (capacity >= 0);
  ELSE
    SELECT convalidated
    INTO capacity_validated
    FROM pg_constraint
    WHERE conrelid = 'public.events'::regclass
      AND conname = 'events_capacity_check';
    capacity_definition := regexp_replace(capacity_definition, '\s+', '', 'g');
    IF NOT capacity_validated
      OR capacity_definition <> 'check((capacity>=0))'
    THEN
      RAISE EXCEPTION 'Constraint events_capacity_check exists with an unexpected definition.';
    END IF;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS events_published_starts_at_idx
  ON public.events (starts_at)
  WHERE published = true;

DO $$
DECLARE
  index_definition text;
BEGIN
  SELECT lower(pg_get_indexdef(indexrelid))
  INTO index_definition
  FROM pg_index
  WHERE indexrelid = to_regclass('public.events_published_starts_at_idx');

  IF index_definition IS NULL
    OR index_definition NOT LIKE '%using btree (starts_at)%'
    OR index_definition NOT LIKE '%where (published = true)%'
  THEN
    RAISE EXCEPTION 'Index events_published_starts_at_idx exists with an unexpected definition.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_ticket_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  name text NOT NULL,
  price numeric(12, 2) NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_ticket_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT event_ticket_tiers_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
  CONSTRAINT event_ticket_tiers_name_check
    CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT event_ticket_tiers_price_check
    CHECK (price > 0),
  CONSTRAINT event_ticket_tiers_quantity_check
    CHECK (quantity > 0)
);

DO $$
DECLARE
  missing_columns text;
  unexpected_policies text;
BEGIN
  SELECT string_agg(required.column_name, ', ')
  INTO missing_columns
  FROM (VALUES
    ('id', 'uuid'),
    ('event_id', 'uuid'),
    ('name', 'text'),
    ('price', 'numeric'),
    ('quantity', 'integer'),
    ('created_at', 'timestamp with time zone')
  ) AS required(column_name, data_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = 'event_ticket_tiers'
      AND actual.column_name = required.column_name
      AND actual.data_type = required.data_type
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'public.event_ticket_tiers exists with an incompatible schema; review columns: %', missing_columns;
  END IF;

  IF (
    SELECT count(*)
    FROM pg_constraint
    WHERE conrelid = 'public.event_ticket_tiers'::regclass
      AND conname IN (
        'event_ticket_tiers_pkey',
        'event_ticket_tiers_event_id_fkey',
        'event_ticket_tiers_name_check',
        'event_ticket_tiers_price_check',
        'event_ticket_tiers_quantity_check'
      )
  ) <> 5 THEN
    RAISE EXCEPTION 'public.event_ticket_tiers is missing expected constraints; review the existing table before applying.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_ticket_tiers'::regclass
      AND conname = 'event_ticket_tiers_pkey'
      AND contype = 'p'
      AND convalidated
      AND lower(pg_get_constraintdef(oid)) LIKE '%primary key (id)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_ticket_tiers'::regclass
      AND conname = 'event_ticket_tiers_event_id_fkey'
      AND contype = 'f'
      AND convalidated
      AND confrelid = 'public.events'::regclass
      AND conkey = ARRAY[
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public.event_ticket_tiers'::regclass
            AND attname = 'event_id'
            AND NOT attisdropped
        )
      ]::smallint[]
      AND confkey = ARRAY[
        (
          SELECT attnum
          FROM pg_attribute
          WHERE attrelid = 'public.events'::regclass
            AND attname = 'id'
            AND NOT attisdropped
        )
      ]::smallint[]
      AND confdeltype = 'c'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_ticket_tiers'::regclass
      AND conname = 'event_ticket_tiers_name_check'
      AND contype = 'c'
      AND convalidated
      AND lower(pg_get_constraintdef(oid)) LIKE '%char_length(name)%>= 1%'
      AND lower(pg_get_constraintdef(oid)) LIKE '%char_length(name)%<= 80%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_ticket_tiers'::regclass
      AND conname = 'event_ticket_tiers_price_check'
      AND contype = 'c'
      AND convalidated
      AND regexp_replace(
        replace(lower(pg_get_constraintdef(oid)), '(0)::numeric', '0'),
        '\s+',
        '',
        'g'
      ) = 'check((price>0))'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_ticket_tiers'::regclass
      AND conname = 'event_ticket_tiers_quantity_check'
      AND contype = 'c'
      AND convalidated
      AND regexp_replace(lower(pg_get_constraintdef(oid)), '\s+', '', 'g')
        = 'check((quantity>0))'
  ) THEN
    RAISE EXCEPTION 'public.event_ticket_tiers has unexpected constraint definitions; review the existing table before applying.';
  END IF;

  SELECT string_agg(policyname, ', ')
  INTO unexpected_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'event_ticket_tiers'
    AND policyname NOT IN (
      'Published event tiers are public',
      'Event owners read their draft tiers',
      'Event owners insert their tiers',
      'Event owners update their tiers',
      'Event owners delete their tiers'
    );

  IF unexpected_policies IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected policy exists on public.event_ticket_tiers: %. Review before applying.', unexpected_policies;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS event_ticket_tiers_event_id_idx
  ON public.event_ticket_tiers (event_id);

GRANT SELECT ON public.event_ticket_tiers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_ticket_tiers TO authenticated;
GRANT ALL ON public.event_ticket_tiers TO service_role;
ALTER TABLE public.event_ticket_tiers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  index_definition text;
BEGIN
  SELECT lower(pg_get_indexdef(indexrelid))
  INTO index_definition
  FROM pg_index
  WHERE indexrelid = to_regclass('public.event_ticket_tiers_event_id_idx');

  IF index_definition IS NULL
    OR index_definition NOT LIKE '%using btree (event_id)%'
  THEN
    RAISE EXCEPTION 'Index event_ticket_tiers_event_id_idx exists with an unexpected definition.';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Creators insert events" ON public.events;
CREATE POLICY "Creators insert events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1
      FROM public.organizers o
      WHERE o.id = organizer_id AND o.owner_id = auth.uid()
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
  );

DROP POLICY IF EXISTS "Published event tiers are public" ON public.event_ticket_tiers;
CREATE POLICY "Published event tiers are public"
  ON public.event_ticket_tiers FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id AND e.published = true
    )
  );

DROP POLICY IF EXISTS "Event owners read their draft tiers" ON public.event_ticket_tiers;
CREATE POLICY "Event owners read their draft tiers"
  ON public.event_ticket_tiers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Event owners insert their tiers" ON public.event_ticket_tiers;
CREATE POLICY "Event owners insert their tiers"
  ON public.event_ticket_tiers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Event owners update their tiers" ON public.event_ticket_tiers;
CREATE POLICY "Event owners update their tiers"
  ON public.event_ticket_tiers FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Event owners delete their tiers" ON public.event_ticket_tiers;
CREATE POLICY "Event owners delete their tiers"
  ON public.event_ticket_tiers FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.replace_event_ticket_tiers_v1(
  p_event_id uuid,
  p_tiers jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF jsonb_typeof(p_tiers) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Ticket tiers must be provided as an array.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = p_event_id AND e.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Event not found or not owned by the current user.';
  END IF;

  DELETE FROM public.event_ticket_tiers
  WHERE event_id = p_event_id;

  INSERT INTO public.event_ticket_tiers (event_id, name, price, quantity)
  SELECT p_event_id, tier.name, tier.price, tier.quantity
  FROM jsonb_to_recordset(p_tiers) AS tier(
    name text,
    price numeric,
    quantity integer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_event_ticket_tiers_v1(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_event_ticket_tiers_v1(uuid, jsonb) TO authenticated;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'event-covers',
  'event-covers',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'event-covers'
      AND name = 'event-covers'
      AND public = true
      AND file_size_limit = 5242880
      AND cardinality(allowed_mime_types) = 3
      AND allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ) THEN
    RAISE EXCEPTION 'The existing event-covers bucket has unexpected settings. Review it manually; this migration will not overwrite them.';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Event covers are publicly readable" ON storage.objects;
CREATE POLICY "Event covers are publicly readable"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'event-covers');

DROP POLICY IF EXISTS "Users upload their own event covers" ON storage.objects;
CREATE POLICY "Users upload their own event covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update their own event covers" ON storage.objects;
CREATE POLICY "Users update their own event covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete their own event covers" ON storage.objects;
CREATE POLICY "Users delete their own event covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Event covers upload owner guard" ON storage.objects;
CREATE POLICY "Event covers upload owner guard"
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'event-covers'
    OR (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Event covers update owner guard" ON storage.objects;
CREATE POLICY "Event covers update owner guard"
  ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    bucket_id <> 'event-covers'
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id <> 'event-covers'
    OR (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Event covers delete owner guard" ON storage.objects;
CREATE POLICY "Event covers delete owner guard"
  ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'event-covers'
    OR (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Event covers anon insert guard" ON storage.objects;
CREATE POLICY "Event covers anon insert guard"
  ON storage.objects AS RESTRICTIVE FOR INSERT TO anon
  WITH CHECK (bucket_id <> 'event-covers');

DROP POLICY IF EXISTS "Event covers anon update guard" ON storage.objects;
CREATE POLICY "Event covers anon update guard"
  ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon
  USING (bucket_id <> 'event-covers')
  WITH CHECK (bucket_id <> 'event-covers');

DROP POLICY IF EXISTS "Event covers anon delete guard" ON storage.objects;
CREATE POLICY "Event covers anon delete guard"
  ON storage.objects AS RESTRICTIVE FOR DELETE TO anon
  USING (bucket_id <> 'event-covers');

COMMIT;
