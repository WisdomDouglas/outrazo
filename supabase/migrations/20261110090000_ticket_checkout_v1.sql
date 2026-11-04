-- Ticket checkout V1 (P1 proposal).
--
-- STATUS: PROPOSED — PENDING REVIEW. NOT APPLIED.
-- Do not execute it without explicit authorization and the pre-checks below.
--
-- What it does:
-- * Hardens the existing public.ticket_orders table for real paid ticketing:
--   pending-first lifecycle, unique references, provider/checkout columns,
--   server-side-only writes (organizer/user direct writes removed).
-- * Hardens public.ticket_items: tier references become real uuid foreign
--   keys with snapshots preserved, quantities bounded, duplicates prevented.
-- * Adds public.event_ticket_tiers.sold_quantity so activation can enforce
--   inventory under concurrency (locked increments inside the RPC).
-- * Adds public.ticket_webhook_events: the idempotent Bachs-event log.
-- * Adds public.activate_ticket_order(): locked, single-path delivery —
--   pending-only, snapshot-matching, event-valid, inventory-checked.
-- * Guards public.replace_event_ticket_tiers_v1(): tiers freeze once any
--   ticket is paid, so sold inventory can never be rewritten away.
--
-- What it deliberately does NOT do:
-- * No money-unit conversion. total_amount/unit_price stay numeric naira so
--   the existing AI Event Intelligence revenue reader keeps working
--   unchanged; the ticket server core computes in integer kobo and converts
--   exactly once at each database boundary. A future unit migration must
--   update Intelligence in the same change.
-- * No automated refunds, transfers, or payouts. Verified money that cannot
--   be delivered is recorded with a reason for the MANUAL staff process.
-- * No changes to events, profiles, organizers, attendees, RSVP trigger,
--   Realtime publication, admin_roles, audit_log, event_reports, promotions,
--   pricing, or any existing policy except the ticket tables' own.
--
-- Preconditions (fail loudly, change nothing on violation):
-- * public.ticket_orders, public.ticket_items, public.events,
--   public.event_ticket_tiers, public.profiles all exist with the expected
--   columns (verified live 2026-11-04).
-- * ticket_orders and ticket_items contain ZERO rows. The old schema let any
--   signed-in user insert rows with a 'confirmed' default that verified
--   nothing, so pre-existing rows are ambiguous money records: reconcile
--   them manually (keep or delete through the SQL Editor with a note) and
--   re-run. This migration never rewrites money history silently.
--
-- Reviewer checklist before applying:
-- 1. Confirm zero rows: SELECT count(*) FROM ticket_orders / ticket_items.
-- 2. Confirm no application code writes these tables yet (only reads).
-- 3. Apply exactly once, then regenerate the Supabase TypeScript types so
--    tier_id (now uuid) and the new columns match the generated file.
BEGIN;

DO $$
DECLARE
  missing text;
BEGIN
  IF to_regclass('public.ticket_orders') IS NULL
    OR to_regclass('public.ticket_items') IS NULL
    OR to_regclass('public.events') IS NULL
    OR to_regclass('public.event_ticket_tiers') IS NULL
    OR to_regclass('public.profiles') IS NULL
  THEN
    RAISE EXCEPTION 'Ticket checkout V1 requires the existing ticket_orders, ticket_items, events, event_ticket_tiers, and profiles tables.';
  END IF;

  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO missing
  FROM (VALUES
    ('ticket_orders', 'id'),
    ('ticket_orders', 'user_id'),
    ('ticket_orders', 'event_id'),
    ('ticket_orders', 'status'),
    ('ticket_orders', 'total_amount'),
    ('ticket_orders', 'currency'),
    ('ticket_orders', 'reference'),
    ('ticket_orders', 'created_at'),
    ('ticket_items', 'id'),
    ('ticket_items', 'order_id'),
    ('ticket_items', 'tier_id'),
    ('ticket_items', 'tier_name'),
    ('ticket_items', 'unit_price'),
    ('ticket_items', 'quantity'),
    ('ticket_items', 'created_at'),
    ('event_ticket_tiers', 'id'),
    ('event_ticket_tiers', 'event_id'),
    ('event_ticket_tiers', 'name'),
    ('event_ticket_tiers', 'price'),
    ('event_ticket_tiers', 'quantity')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = required.table_name
      AND actual.column_name = required.column_name
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Ticket checkout V1 base schema is incomplete; missing columns: %', missing;
  END IF;

  IF EXISTS (SELECT 1 FROM public.ticket_orders) THEN
    RAISE EXCEPTION 'ticket_orders already contains rows created under the unverified legacy schema. Reconcile them manually before applying ticket checkout V1.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_items) THEN
    RAISE EXCEPTION 'ticket_items already contains rows created under the unverified legacy schema. Reconcile them manually before applying ticket checkout V1.';
  END IF;
END;
$$;

-- ── 1. ticket_orders hardening ─────────────────────────────────────────────
ALTER TABLE public.ticket_orders
  ALTER COLUMN status SET DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'bachs',
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_id text,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_orders'::regclass AND conname = 'ticket_orders_status_check'
  ) THEN
    ALTER TABLE public.ticket_orders
      ADD CONSTRAINT ticket_orders_status_check
      CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_orders'::regclass AND conname = 'ticket_orders_total_check'
  ) THEN
    ALTER TABLE public.ticket_orders
      ADD CONSTRAINT ticket_orders_total_check CHECK (total_amount >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_orders'::regclass AND conname = 'ticket_orders_reference_key'
  ) THEN
    ALTER TABLE public.ticket_orders
      ADD CONSTRAINT ticket_orders_reference_key UNIQUE (reference);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_orders'::regclass AND conname = 'ticket_orders_provider_reference_key'
  ) THEN
    ALTER TABLE public.ticket_orders
      ADD CONSTRAINT ticket_orders_provider_reference_key UNIQUE (provider_reference);
  END IF;
END;
$$;

-- One live checkout per buyer per event: double-clicks and concurrent tabs
-- converge on a single pending order instead of minting duplicate sessions
-- the buyer could pay twice.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_orders_one_pending_per_user_event
  ON public.ticket_orders (user_id, event_id) WHERE (status = 'pending');

COMMENT ON TABLE public.ticket_orders IS
  'Paid ticket checkouts. Server-side writes only (service role + RPCs); buyers read their own rows. Amounts are numeric naira; the server core computes in integer kobo.';

-- ── 2. ticket_items hardening ───────────────────────────────────────────────
-- tier_id becomes a real foreign key; snapshots (tier_name/unit_price) stay
-- so history survives tier edits. The cast fails loudly on non-uuid values
-- instead of silently dropping rows.
ALTER TABLE public.ticket_items
  ALTER COLUMN tier_id TYPE uuid USING tier_id::uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_items'::regclass AND conname = 'ticket_items_unit_check'
  ) THEN
    ALTER TABLE public.ticket_items
      ADD CONSTRAINT ticket_items_unit_check CHECK (unit_price >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_items'::regclass AND conname = 'ticket_items_quantity_check'
  ) THEN
    ALTER TABLE public.ticket_items
      ADD CONSTRAINT ticket_items_quantity_check CHECK (quantity > 0 AND quantity <= 10);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ticket_items'::regclass AND conname = 'ticket_items_tier_id_fkey'
  ) THEN
    ALTER TABLE public.ticket_items
      ADD CONSTRAINT ticket_items_tier_id_fkey
      FOREIGN KEY (tier_id) REFERENCES public.event_ticket_tiers(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- One line per tier per order; NULL tiers (deleted after sale) stay exempt.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_items_order_tier_key
  ON public.ticket_items (order_id, tier_id) WHERE tier_id IS NOT NULL;

COMMENT ON TABLE public.ticket_items IS
  'Per-tier lines of a ticket order with price snapshots. Server-side writes only; buyers read lines of their own orders.';

-- ── 3. Tier inventory counter ───────────────────────────────────────────────
ALTER TABLE public.event_ticket_tiers
  ADD COLUMN IF NOT EXISTS sold_quantity integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_ticket_tiers'::regclass AND conname = 'event_ticket_tiers_sold_check'
  ) THEN
    ALTER TABLE public.event_ticket_tiers
      ADD CONSTRAINT event_ticket_tiers_sold_check
      CHECK (sold_quantity >= 0 AND sold_quantity <= quantity);
  END IF;
END;
$$;

-- ── 4. Webhook event log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'bachs',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  reference text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id)
);

COMMENT ON TABLE public.ticket_webhook_events IS
  'Idempotent Bachs webhook-event log for ticket payments. Service-role only; no client access.';

CREATE INDEX IF NOT EXISTS ticket_webhook_events_reference_idx
  ON public.ticket_webhook_events (reference);

ALTER TABLE public.ticket_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ticket_webhook_events TO service_role;

-- ── 5. Order/item access: buyers read, server writes ─────────────────────────
-- Direct buyer writes end here: every insert/update/delete flows through the
-- service-role server core and the activation RPC below. Reads stay
-- self-scoped so My Tickets keeps working on the caller's own client.
DROP POLICY IF EXISTS "Users insert own orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "Users update own orders" ON public.ticket_orders;
DROP POLICY IF EXISTS "Users read own orders" ON public.ticket_orders;
CREATE POLICY "Users read own orders"
  ON public.ticket_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own ticket items" ON public.ticket_items;
DROP POLICY IF EXISTS "Users read own ticket items" ON public.ticket_items;
CREATE POLICY "Users read own ticket items"
  ON public.ticket_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ticket_orders o
      WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.ticket_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, event_id, status, status_reason, total_amount, currency, reference, provider, provider_reference, paid_at, pending_expires_at, checkout_id, checkout_url, checkout_expires_at, created_at)
  ON public.ticket_orders TO authenticated;
GRANT ALL ON public.ticket_orders TO service_role;

REVOKE ALL ON public.ticket_items FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, order_id, tier_id, tier_name, unit_price, quantity, created_at)
  ON public.ticket_items TO authenticated;
GRANT ALL ON public.ticket_items TO service_role;

-- ── 6. Locked single-path activation ─────────────────────────────────────────
-- The ONLY way an order becomes paid. Guards, in order: the row exists and is
-- still pending (locked); the verified money matches the stored snapshot;
-- the event is still buyable; every tier line still has inventory (each tier
-- row locked, then incremented). Concurrent activations serialize on the
-- order lock; the loser sees paid and returns 'already_paid' instead of
-- double-delivering. No refunds, transfers, or payouts happen here — a
-- failure raises, and the caller records the reason for MANUAL handling.
CREATE OR REPLACE FUNCTION public.activate_ticket_order(
  p_order_id uuid,
  p_provider_reference text,
  p_amount_kobo integer
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_total_kobo integer;
  v_reference text;
  v_event_id uuid;
  v_published boolean;
  v_event_status text;
  v_ends_at timestamptz;
  item record;
BEGIN
  SELECT status, round(total_amount * 100)::integer, provider_reference, event_id
    INTO v_status, v_total_kobo, v_reference, v_event_id
    FROM public.ticket_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket order not found.';
  END IF;
  IF v_status = 'paid' THEN
    RETURN 'already_paid';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending ticket orders can be activated.';
  END IF;
  IF v_reference IS DISTINCT FROM p_provider_reference
    OR v_total_kobo IS DISTINCT FROM p_amount_kobo
  THEN
    RAISE EXCEPTION 'Payment does not match the order snapshot.';
  END IF;

  SELECT published, status, ends_at
    INTO v_published, v_event_status, v_ends_at
    FROM public.events WHERE id = v_event_id;
  IF NOT FOUND OR NOT v_published THEN
    RAISE EXCEPTION 'That event is no longer available.';
  END IF;
  IF v_event_status = 'cancelled' THEN
    RAISE EXCEPTION 'That event was cancelled.';
  END IF;
  IF v_ends_at IS NOT NULL AND v_ends_at <= now() THEN
    RAISE EXCEPTION 'That event has already ended.';
  END IF;

  FOR item IN
    SELECT tier_id, quantity, tier_name
    FROM public.ticket_items
    WHERE order_id = p_order_id AND tier_id IS NOT NULL
  LOOP
    PERFORM 1 FROM public.event_ticket_tiers WHERE id = item.tier_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The % tier no longer exists.', item.tier_name;
    END IF;
    UPDATE public.event_ticket_tiers
    SET sold_quantity = sold_quantity + item.quantity
    WHERE id = item.tier_id
      AND sold_quantity + item.quantity <= quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Not enough % tickets left.', item.tier_name;
    END IF;
  END LOOP;

  UPDATE public.ticket_orders
  SET status = 'paid', paid_at = now(), status_reason = NULL
  WHERE id = p_order_id;
  RETURN 'activated';
END;
$$;

REVOKE ALL ON FUNCTION public.activate_ticket_order(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_ticket_order(uuid, text, integer) TO service_role;

-- ── 7. Freeze tiers once tickets are paid ─────────────────────────────────────
-- replace_event_ticket_tiers_v1 rewrites a whole tier set; after any sale
-- that would orphan sold inventory. Same body as Create Event V1 plus the
-- paid-order guard, applied before any delete happens.
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

  IF EXISTS (
    SELECT 1 FROM public.ticket_orders
    WHERE event_id = p_event_id AND status = 'paid'
  ) THEN
    RAISE EXCEPTION 'Ticket tiers cannot be changed after tickets have been sold for this event.';
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

-- ── 8. Verification ─────────────────────────────────────────────────────────
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(need, ', ')
  INTO missing
  FROM (VALUES
    ('ticket_orders_status_check'),
    ('ticket_orders_total_check'),
    ('ticket_orders_reference_key'),
    ('ticket_orders_provider_reference_key'),
    ('ticket_items_unit_check'),
    ('ticket_items_quantity_check'),
    ('ticket_items_tier_id_fkey'),
    ('event_ticket_tiers_sold_check')
  ) AS required(need)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = required.need
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Ticket checkout V1 is missing constraints: %', missing;
  END IF;

  IF to_regclass('public.ticket_webhook_events') IS NULL THEN
    RAISE EXCEPTION 'Ticket checkout V1 did not create ticket_webhook_events.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'activate_ticket_order' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'activate_ticket_order must be SECURITY DEFINER.';
  END IF;
END;
$$;

COMMIT;
