-- Profiles ------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  email text,
  avatar_url text,
  location text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Organizers ------------------------------------------------------------
CREATE TABLE public.organizers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  community text,
  description text,
  avatar_url text,
  location text,
  website text,
  social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizers TO authenticated;
GRANT ALL ON public.organizers TO service_role;
ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organizers are public" ON public.organizers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Owners insert organizers" ON public.organizers FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update organizers" ON public.organizers FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete organizers" ON public.organizers FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- Events ------------------------------------------------------------
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text,
  description text,
  image_url text,
  category text NOT NULL DEFAULT 'culture',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  venue_name text,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  price_from numeric(12,2),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'upcoming',
  published boolean NOT NULL DEFAULT true,
  attendee_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_organizer_id_idx ON public.events (organizer_id);
CREATE INDEX events_starts_at_idx ON public.events (starts_at);
GRANT SELECT ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Published events are public" ON public.events FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "Creators read own events" ON public.events FOR SELECT TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators insert events" ON public.events FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators update events" ON public.events FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators delete events" ON public.events FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Event attendees ------------------------------------------------------------
CREATE TABLE public.event_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'going',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_attendees TO authenticated;
GRANT ALL ON public.event_attendees TO service_role;
ALTER TABLE public.event_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Attendees read own rsvps" ON public.event_attendees FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Attendees insert own rsvps" ON public.event_attendees FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Attendees update own rsvps" ON public.event_attendees FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Attendees delete own rsvps" ON public.event_attendees FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Saved events ------------------------------------------------------------
CREATE TABLE public.saved_events (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);
GRANT SELECT, INSERT, DELETE ON public.saved_events TO authenticated;
GRANT ALL ON public.saved_events TO service_role;
ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own saves" ON public.saved_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own saves" ON public.saved_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own saves" ON public.saved_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Ticket orders ------------------------------------------------------------
CREATE TABLE public.ticket_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'confirmed',
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  reference text NOT NULL DEFAULT gen_random_uuid()::text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ticket_orders TO authenticated;
GRANT ALL ON public.ticket_orders TO service_role;
ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own orders" ON public.ticket_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own orders" ON public.ticket_orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own orders" ON public.ticket_orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Ticket items ------------------------------------------------------------
CREATE TABLE public.ticket_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  tier_id text,
  tier_name text NOT NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_items_order_id_idx ON public.ticket_items (order_id);
GRANT SELECT, INSERT ON public.ticket_items TO authenticated;
GRANT ALL ON public.ticket_items TO service_role;
ALTER TABLE public.ticket_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own ticket items" ON public.ticket_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ticket_orders o WHERE o.id = order_id AND o.user_id = auth.uid()));
CREATE POLICY "Users insert own ticket items" ON public.ticket_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ticket_orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

-- Profile bootstrap ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();