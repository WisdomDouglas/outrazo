-- Extend the existing event catalogue for organizer-created events.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 0;

ALTER TABLE public.events
  ADD CONSTRAINT events_event_type_check CHECK (event_type IN ('free', 'paid')),
  ADD CONSTRAINT events_capacity_check CHECK (capacity >= 0);

DROP POLICY IF EXISTS "Creators insert events" ON public.events;
CREATE POLICY "Creators insert events"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.organizers o
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
      SELECT 1 FROM public.organizers o
      WHERE o.id = organizer_id AND o.owner_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS events_published_starts_at_idx
  ON public.events (starts_at)
  WHERE published = true;

-- The existing ticket_items table represents purchased tickets, not the
-- organizer's price/quantity tiers, so keep those definitions separate.
CREATE TABLE public.event_ticket_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  price numeric(12, 2) NOT NULL CHECK (price > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_ticket_tiers_event_id_idx
  ON public.event_ticket_tiers (event_id);

GRANT SELECT ON public.event_ticket_tiers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.event_ticket_tiers TO authenticated;
GRANT ALL ON public.event_ticket_tiers TO service_role;

ALTER TABLE public.event_ticket_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published event tiers are public"
  ON public.event_ticket_tiers FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.published = true
    )
  );

CREATE POLICY "Event owners read their draft tiers"
  ON public.event_ticket_tiers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "Event owners insert their tiers"
  ON public.event_ticket_tiers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "Event owners update their tiers"
  ON public.event_ticket_tiers FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

CREATE POLICY "Event owners delete their tiers"
  ON public.event_ticket_tiers FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.created_by = auth.uid()
    )
  );

-- Event artwork is public to read, while uploads are confined to a user's
-- own folder. The public anon key never grants write access to other folders.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-covers',
  'event-covers',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Event covers are publicly readable"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'event-covers');

CREATE POLICY "Users upload their own event covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

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

CREATE POLICY "Users delete their own event covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
