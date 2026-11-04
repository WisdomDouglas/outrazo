-- Account engagement V1 (P4 proposal).
--
-- STATUS: PROPOSED — PENDING REVIEW. NOT APPLIED.
-- Do not execute it without explicit authorization and the pre-checks below.
--
-- What it does:
-- * Adds public.notifications: per-user inbox rows. Clients read their own
--   and flip read_at only; all inserts come from the server core or the
--   RSVP trigger below. No client inserts, no deletes.
-- * Adds an event_attendees trigger: RSVP insert -> "reservation confirmed"
--   notification; RSVP delete -> "reservation cancelled" notification.
-- * Adds public.event_reviews: one verified-attendance review per user per
--   event. Insert/update/delete are self-scoped; anyone may read reviews
--   of published events. Writing requires an RSVP row or a paid order for
--   an event that has already started.
--
-- What it deliberately does NOT do:
-- * No profile schema changes (name/location editing uses existing columns).
-- * No avatar storage bucket (deferred; see the P4 report).
-- * No changes to orders, tiers, promotions, or existing policies/RPCs.
-- * No automated money movement of any kind.
--
-- Preconditions: profiles, events, event_attendees, ticket_orders exist.
-- Reviewer checklist before applying:
-- 1. Confirm no objects named public.notifications / public.event_reviews exist.
-- 2. Apply exactly once. Safe with existing rows (new tables only).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL
    OR to_regclass('public.events') IS NULL
    OR to_regclass('public.event_attendees') IS NULL
    OR to_regclass('public.ticket_orders') IS NULL
  THEN
    RAISE EXCEPTION 'Account engagement V1 requires the profiles, events, event_attendees, and ticket_orders tables.';
  END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN
    RAISE EXCEPTION 'notifications already exists; do not apply Account engagement V1 twice.';
  END IF;
  IF to_regclass('public.event_reviews') IS NOT NULL THEN
    RAISE EXCEPTION 'event_reviews already exists; do not apply Account engagement V1 twice.';
  END IF;
END;
$$;

-- ── 1. Notifications inbox ──────────────────────────────────────────────────
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('rsvp_confirmed', 'rsvp_cancelled', 'order_paid', 'event_cancelled')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS
  'Per-user inbox. Server and trigger inserts only; owners read their own rows and flip read_at.';

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Read receipts only: the UPDATE grant below is column-restricted to
-- read_at, so this policy cannot rewrite notification content.
CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.notifications FROM PUBLIC, anon;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- RSVP lifecycle notifications. SECURITY DEFINER so the insert survives
-- RLS (attendees cannot insert notifications directly) and still reads
-- the event title for context.
CREATE OR REPLACE FUNCTION public.notify_rsvp_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_title text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT title INTO v_title FROM public.events WHERE id = NEW.event_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'rsvp_confirmed',
      'Reservation confirmed',
      'Your spot' || CASE WHEN v_title IS NOT NULL THEN ' at ' || v_title ELSE '' END || ' is reserved. See you there!',
      '/app/tickets'
    );
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    SELECT title INTO v_title FROM public.events WHERE id = OLD.event_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      OLD.user_id,
      'rsvp_cancelled',
      'Reservation cancelled',
      'Your spot' || CASE WHEN v_title IS NOT NULL THEN ' at ' || v_title ELSE '' END || ' was cancelled.',
      '/events'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_rsvp_change_trigger ON public.event_attendees;
CREATE TRIGGER notify_rsvp_change_trigger
  AFTER INSERT OR DELETE ON public.event_attendees
  FOR EACH ROW EXECUTE FUNCTION public.notify_rsvp_change();

-- ── 2. Verified-attendance reviews ───────────────────────────────────────────
CREATE TABLE public.event_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

COMMENT ON TABLE public.event_reviews IS
  'One review per user per event, gated on attendance (RSVP row or paid order) and event start. Authors manage their own; staff delete through audited server code.';

CREATE INDEX IF NOT EXISTS event_reviews_event_idx
  ON public.event_reviews (event_id, created_at DESC);

ALTER TABLE public.event_reviews ENABLE ROW LEVEL SECURITY;

-- Public read for published events (powers the details page for guests).
CREATE POLICY "Anyone reads reviews of published events"
  ON public.event_reviews FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.published = true AND e.status <> 'cancelled'
    )
  );

-- Authors read their own reviews anywhere (including drafts they attend).
CREATE POLICY "Authors read own reviews"
  ON public.event_reviews FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Write gate: own row, published uncancelled event, event started, and the
-- writer holds an RSVP row or a paid order for the event.
CREATE POLICY "Attendees write own reviews"
  ON public.event_reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.published = true AND e.status <> 'cancelled'
        AND e.starts_at <= now()
        AND (
          EXISTS (SELECT 1 FROM public.event_attendees a WHERE a.event_id = e.id AND a.user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM public.ticket_orders o WHERE o.event_id = e.id AND o.user_id = auth.uid() AND o.status = 'paid')
        )
    )
  );

CREATE POLICY "Attendees update own reviews"
  ON public.event_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.published = true AND e.status <> 'cancelled'
    )
  );

CREATE POLICY "Authors delete own reviews"
  ON public.event_reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.event_reviews FROM PUBLIC, anon;
GRANT SELECT ON public.event_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_reviews TO authenticated;
GRANT ALL ON public.event_reviews TO service_role;

-- ── 3. Verification ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'Account engagement V1 did not create notifications.';
  END IF;
  IF to_regclass('public.event_reviews') IS NULL THEN
    RAISE EXCEPTION 'Account engagement V1 did not create event_reviews.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'notify_rsvp_change_trigger'
  ) THEN
    RAISE EXCEPTION 'Account engagement V1 did not create the RSVP notify trigger.';
  END IF;
END;
$$;

COMMIT;
