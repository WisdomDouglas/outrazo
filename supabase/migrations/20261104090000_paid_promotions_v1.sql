-- PROPOSED forward-only Supabase migration: paid self-service promotions (P1).
--
-- STATUS: PROPOSED — PENDING REVIEW. NOT APPLIED. Do not execute it without
-- explicit authorization. No Paystack, server-function, or UI code exists yet;
-- this migration only creates the database foundation those phases need.
--
-- Why this migration is needed:
-- Organizers cannot promote their own events today: scheduling is staff-only
-- and free, and only one promotion window may be live at a time (the 2C-2
-- global exclusion). This migration adds promotion pricing, paid orders with
-- pending-window reservations, an audited refund queue, and payment-verified
-- activation — while replacing the global one-slot rule with per-event
-- overlap protection so different events promote simultaneously.
--
-- What it does:
-- * Creates public.promotion_pricing (append-only): the admin-set daily rate
--   in integer kobo. The current price is the latest effective row. History
--   is never rewritten, so any past charge stays explainable.
-- * Creates public.promotion_orders: one row per organizer checkout with an
--   immutable price snapshot (days, daily_amount_kobo, total_amount_kobo),
--   a provider reference, and a 7-state lifecycle:
--     pending -> paid | failed | expired | cancelled | refund_pending
--     {expired, cancelled, failed} + verified late payment -> paid
--       (late honor, slot free) | refund_pending (slot blocked)
--     refund_pending -> refunded (admin executes + records the refund)
--   paid and refunded are absorbing: no transition leaves them, and nothing
--   ever returns an order to pending.
-- * Reserves pending windows with a partial unique index: at most ONE live
--   (pending) checkout per event. Promotions start at payment time, so any
--   two paid checkouts for the same event would overlap by construction —
--   the index makes the second overlapping reservation impossible, under any
--   concurrency, with no lock ordering to get wrong. Expired/failed/
--   cancelled rows fall outside the predicate, so terminal orders release
--   their reservation automatically. Different events are fully independent.
-- * Creates public.promotion_webhook_events: the idempotent provider-event
--   log (unique per provider event id). P2's webhook route records every
--   delivery here; duplicates converge on the existing row.
-- * Creates public.promotion_refunds: one audited row per executed refund
--   (V1 refunds are full-order only, executed by an authorized admin).
-- * Adds public.event_promotions.order_id (nullable): NULL means a
--   staff/organic promotion exactly as before; set means paid. Existing rows
--   are untouched and staff scheduling keeps working.
-- * Replaces the global exclusion constraint with a per-event exclusion
--   constraint (event_id equality + window overlap, active rows only), which
--   needs the btree_gist extension for uuid equality inside GiST. The old
--   constraint is dropped by looked-up name — never a guessed name — and the
--   new constraint carries an explicit name so future migrations and tests
--   can reference it. Because the global rule forbade ALL overlaps, no
--   existing rows can violate the narrower per-event rule: the swap cannot
--   fail on current data.
-- * Replaces create_event_promotion() with a per-event friendly overlap
--   check (same signature, same grants, same audit shape). The error text
--   keeps the "overlaps an existing promotion" prefix so the existing
--   client-side friendly-error mapping keeps matching.
-- * Adds activate_paid_promotion() RPC (SECURITY DEFINER, service-role
--   EXECUTE only): locks the order row, asserts the verified payment matches
--   the snapshot, rechecks event eligibility + live-window overlap + other
--   live reservations, then delivers or routes to refund_pending — atomically.
--   The current order is excluded from its own pending check
--   (clarification A); a late payment facing a newer valid reservation goes
--   to refund_pending without disturbing it (clarification B).
-- * Adds cancel_promotion_order() RPC (service-role only): flips a pending
--   order to cancelled for the owning organizer. The P2 server function
--   rechecks Paystack BEFORE calling it; a payment landing in between is
--   caught by the late-payment recovery path, never stranded.
-- * Adds set_promotion_price() RPC (super_admin/finance_admin): appends a
--   pricing row with audit. The daily floor is kobo 10000, because the minimum
--   transaction is NGN 100 (approved decision 6) and the minimum duration is
--   1 day — enforced again by the orders table CHECK on the total.
-- * Adds record_promotion_refund() RPC (super_admin/finance_admin): locks a
--   refund_pending order, records the executed refund, flips to refunded.
--
-- Money invariants (each enforced below, each pinned by tests):
-- 1. All amounts are integer kobo; total_amount_kobo = days * daily_amount_kobo
--    is a table CHECK, so snapshots cannot disagree with themselves.
-- 2. Activation and recovery run in ONE locked transaction per order: two
--    simultaneous notifications serialize on the row lock; the loser sees a
--    terminal state and no-ops. Webhook + frontend verify share this path.
-- 3. Verified money with no delivery MUST become refund_pending: amount or
--    reference mismatch, ineligible event, taken slot, blocking reservation,
--    and exclusion-race loss all route there with a reason code. No bare
--    exception strands paid money on a non-refund order.
-- 4. No client can self-activate: activation/cancel RPCs revoke EXECUTE from
--    authenticated entirely. Pricing/refund RPCs are role-gated inside.
--
-- DELETION RESTRICTION (extends the 2C-2 rule — reviewers please confirm):
-- promotion_orders references events and profiles with ON DELETE RESTRICT,
-- and promotion_refunds references orders with ON DELETE RESTRICT. Deleting
-- an event (or profile) with ANY paid-promotion history FAILS with a
-- foreign-key violation (23503). Money trails must not vanish; refunds stay
-- queryable forever. There is intentionally no purge path in this migration.
--
-- Security boundary (SECURITY DEFINER review):
-- * Owner: the role that applies this migration (postgres via the SQL Editor).
--   New RPCs execute with the owner's rights; only the owner/superuser can
--   replace them. Verify after applying:
--     select p.proname, pg_get_userbyid(p.proowner) as owner,
--       p.prosecdef as security_definer
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('activate_paid_promotion', 'cancel_promotion_order',
--         'set_promotion_price', 'record_promotion_refund',
--         'move_order_to_refund_pending');
-- * Grants: activate/cancel/move-to-refund EXECUTE to service_role ONLY
--   (revoked from PUBLIC, anon, AND authenticated); pricing/refund EXECUTE to
--   authenticated + service_role with internal super/finance role gates.
-- * Search path: every new or replaced RPC runs with SET search_path = '',
--   with all tables public-qualified and auth.uid() qualified. Remaining bare
--   names (now, make_interval, coalesce, tstzrange, jsonb_build_object,
--   format, uuid/text/integer/boolean/timestamptz, operators) are pg_catalog
--   built-ins or SQL keywords.
--
-- Deliberately NOT included:
-- * No Paystack calls, secrets, server functions, or webhook routes (P2).
-- * No admin pricing UI (P3), organizer checkout UI (P4), or card redesign (P5).
-- * No order-creation RPC: P2's server function inserts the single order row
--   (CHECKs + the reservation index guard it); multi-step money moves are RPCs.
-- * No partial refunds, no automatic refunds, no refund API calls: V1 refunds
--   are full-order, manual by an authorized admin, recorded with evidence.
-- * No cron/sweeper: pending orders expire lazily (documented in P2); expiry
--   is a status, and late money always has the recovery path.
-- * No changes to events, profiles, organizers, tiers, attendees, RSVP
--   trigger/function, Realtime publication, admin_roles, audit_log schema,
--   event_reports, ticket_orders, or any existing policy — except the two
--   documented event_promotions changes (order_id column, exclusion swap).
--
-- Reviewer checklist before applying:
-- 1. Confirm the 2C-2 promotions migration is applied (event_promotions table
--    + global exclusion + create/cancel RPCs exist).
-- 2. Confirm the deletion-restriction extension above is acceptable.
-- 3. Confirm btree_gist placement satisfies the Supabase advisor after apply.
-- 4. Apply once via the SQL Editor, then run the verification queries in the
--    P1 report (policies, grants, RPCs, reservation + state-machine drills
--    with two test checkouts, including a late-payment simulation).
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Paid promotions require the existing public.profiles table.';
  END IF;
  IF to_regclass('public.events') IS NULL THEN
    RAISE EXCEPTION 'Paid promotions require the existing public.events table.';
  END IF;
  IF to_regclass('public.admin_roles') IS NULL THEN
    RAISE EXCEPTION 'Paid promotions require the Phase 1 public.admin_roles table. Apply that migration first.';
  END IF;
  IF to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION 'Paid promotions require the Phase 1 public.audit_log table. Apply that migration first.';
  END IF;
  IF to_regclass('public.event_promotions') IS NULL THEN
    RAISE EXCEPTION 'Paid promotions require the Phase 2C-2 public.event_promotions table. Apply that migration first.';
  END IF;
  IF to_regprocedure('public.create_event_promotion(uuid, timestamptz, timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Paid promotions require the Phase 2C-2 create_event_promotion() RPC. Apply that migration first.';
  END IF;
END;
$$;

-- Append-only daily-rate history. The current price is the row with the
-- greatest effective_at at or below now(); nothing here is ever updated.
CREATE TABLE IF NOT EXISTS public.promotion_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_amount_kobo integer NOT NULL CHECK (daily_amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.promotion_pricing IS
  'Append-only promotion daily-rate history in integer kobo. Current price = latest effective row. Writes go through set_promotion_price() only; organizers read the current price for checkout quotes.';

CREATE INDEX IF NOT EXISTS promotion_pricing_effective_idx
  ON public.promotion_pricing (effective_at DESC);

ALTER TABLE public.promotion_pricing ENABLE ROW LEVEL SECURITY;

-- Published prices are not sensitive: any signed-in organizer may read them
-- to build a checkout quote. No write policies: direct writes are denied.
CREATE POLICY "Authenticated organizers read promotion pricing"
  ON public.promotion_pricing FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.promotion_pricing FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.promotion_pricing TO authenticated;
GRANT ALL ON public.promotion_pricing TO service_role;

CREATE TABLE IF NOT EXISTS public.promotion_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  days integer NOT NULL CHECK (days BETWEEN 1 AND 30),
  daily_amount_kobo integer NOT NULL CHECK (daily_amount_kobo > 0),
  total_amount_kobo integer NOT NULL CHECK (total_amount_kobo >= 10000),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refund_pending', 'refunded')),
  status_reason text,
  provider text NOT NULL DEFAULT 'paystack',
  provider_reference text NOT NULL UNIQUE
    CHECK (provider_reference ~ '^[A-Za-z0-9._=-]+$'),
  promotion_id uuid REFERENCES public.event_promotions(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The snapshot cannot disagree with itself: the total is always exactly
  -- days * daily rate, set once at checkout creation.
  CHECK (total_amount_kobo = days * daily_amount_kobo)
);

COMMENT ON TABLE public.promotion_orders IS
  'Paid promotion checkouts with immutable kobo snapshots. One live (pending) order per event (partial unique index). Writes are server-side only; organizers read their own rows. Events/profiles with order history cannot be deleted (RESTRICT).';

-- THE reservation mechanism: at most one pending checkout per event. Second
-- overlapping reservations fail atomically on this index, whatever the
-- concurrency. Terminal rows leave the predicate, releasing automatically.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_orders_one_pending_per_event
  ON public.promotion_orders (event_id) WHERE (status = 'pending');

CREATE INDEX IF NOT EXISTS promotion_orders_organizer_idx
  ON public.promotion_orders (organizer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS promotion_orders_event_idx
  ON public.promotion_orders (event_id);
CREATE INDEX IF NOT EXISTS promotion_orders_status_idx
  ON public.promotion_orders (status);

ALTER TABLE public.promotion_orders ENABLE ROW LEVEL SECURITY;

-- Organizers read their own orders only. No insert/update/delete policies:
-- every write is server-side (P2 server functions + the RPCs below).
CREATE POLICY "Organizers read own promotion orders"
  ON public.promotion_orders FOR SELECT TO authenticated
  USING (organizer_id = auth.uid());

REVOKE ALL ON public.promotion_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, event_id, days, daily_amount_kobo, total_amount_kobo, currency, status, status_reason, provider, provider_reference, promotion_id, paid_at, created_at)
  ON public.promotion_orders TO authenticated;
GRANT ALL ON public.promotion_orders TO service_role;

-- Provider-event log for idempotent webhook processing (P2). The unique key
-- makes duplicate deliveries converge; the payload stays for forensics.
CREATE TABLE IF NOT EXISTS public.promotion_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'paystack',
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

COMMENT ON TABLE public.promotion_webhook_events IS
  'Idempotent provider webhook-event log. Service-role only; no client access. P2 records every delivery here before processing.';

CREATE INDEX IF NOT EXISTS promotion_webhook_events_reference_idx
  ON public.promotion_webhook_events (reference);

ALTER TABLE public.promotion_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.promotion_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.promotion_webhook_events TO service_role;

-- One row per executed refund. V1 refunds are full-order only (UNIQUE on
-- order_id); partial refunds are out of scope and must not be improvised.
CREATE TABLE IF NOT EXISTS public.promotion_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.promotion_orders(id) ON DELETE RESTRICT,
  amount_kobo integer NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  reason text NOT NULL,
  paystack_reference text NOT NULL UNIQUE,
  admin_note text,
  processed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.promotion_refunds IS
  'Executed promotion refunds, one per order (full refunds only in V1), each with a unique provider reference. Written by record_promotion_refund() after an authorized admin executes the provider-side refund.';

ALTER TABLE public.promotion_refunds ENABLE ROW LEVEL SECURITY;

-- Organizers may see refunds on their OWN orders (transparency for money
-- owed back). Staff identities stay hidden via the column grant below.
CREATE POLICY "Organizers read own promotion refunds"
  ON public.promotion_refunds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.promotion_orders o
      WHERE o.id = order_id AND o.organizer_id = auth.uid()
    )
  );

REVOKE ALL ON public.promotion_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, order_id, amount_kobo, currency, reason, paystack_reference, processed_at)
  ON public.promotion_refunds TO authenticated;
GRANT ALL ON public.promotion_refunds TO service_role;

-- Paid provenance for promotion rows. NULL = staff/organic promotion exactly
-- as in 2C-2; set = activated by a paid order. Existing rows keep NULL.
ALTER TABLE public.event_promotions
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.promotion_orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.event_promotions.order_id IS
  'Paid-order provenance: NULL for staff/organic promotions, otherwise the promotion_orders row whose verified payment activated this window.';

CREATE INDEX IF NOT EXISTS event_promotions_order_idx
  ON public.event_promotions (order_id);

COMMENT ON TABLE public.event_promotions IS
  'Homepage feature windows: staff-scheduled (order_id NULL) and paid self-service (order_id set). At most one live window per event (exclusion below); different events promote simultaneously. Writes go through the promotion RPCs only; the public reads currently active rows. Referenced events cannot be deleted (RESTRICT); deleted staff anonymize to NULL (SET NULL).';

-- btree_gist supplies uuid equality inside GiST so the per-event exclusion
-- below can compare event_id. Reviewers: confirm placement satisfies the
-- Supabase advisor after applying.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Global one-slot rule -> per-event overlap protection. The old constraint
-- was created unnamed, so it is dropped by looked-up name (never guessed).
-- Re-running is safe: when the new constraint already exists the block skips.
DO $$
DECLARE
  v_old_name text;
  v_old_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'event_promotions_event_window_excl'
      AND conrelid = 'public.event_promotions'::pg_catalog.regclass
  ) THEN
    RAISE NOTICE 'Per-event promotion exclusion already present; skipping swap.';
    RETURN;
  END IF;
  SELECT count(*) INTO v_old_count FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.event_promotions'::pg_catalog.regclass AND contype = 'x';
  IF v_old_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one exclusion constraint on event_promotions (the 2C-2 global rule); found %. Was 2C-2 applied?', v_old_count;
  END IF;
  SELECT conname INTO v_old_name FROM pg_catalog.pg_constraint
  WHERE conrelid = 'public.event_promotions'::pg_catalog.regclass AND contype = 'x';
  EXECUTE pg_catalog.format('ALTER TABLE public.event_promotions DROP CONSTRAINT %I', v_old_name);
  -- Same '[)' bounds as before: back-to-back windows stay legal; cancelled
  -- rows stay outside via the partial predicate. event_id equality confines
  -- the rule to one event, so different events never block each other.
  ALTER TABLE public.event_promotions
    ADD CONSTRAINT event_promotions_event_window_excl
    EXCLUDE USING gist (event_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'active');
END;
$$;

-- Staff scheduling under the new rule: same signature, same grants, same
-- audit shape as 2C-2 — only the friendly overlap check becomes per-event.
-- (CREATE OR REPLACE preserves the existing EXECUTE grants.)
CREATE OR REPLACE FUNCTION public.create_event_promotion(
  p_event_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_promotion_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to manage promotions.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'moderation_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or moderation_admin may manage promotions.';
  END IF;
  IF p_starts_at IS NULL OR p_ends_at IS NULL THEN
    RAISE EXCEPTION 'Choose a promotion start and end.';
  END IF;
  IF p_starts_at >= p_ends_at THEN
    RAISE EXCEPTION 'Promotion must start before it ends.';
  END IF;
  IF p_ends_at <= now() THEN
    RAISE EXCEPTION 'That window already ended. Choose an end time in the future.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'That event no longer exists.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = p_event_id AND published = true AND COALESCE(status, '') <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Only published, non-cancelled events can be promoted.';
  END IF;
  -- Friendly overlap check first, now scoped to THIS event (the per-event
  -- exclusion constraint below is the backstop for concurrent writers,
  -- including a staff-schedule-vs-paid-activation race).
  IF EXISTS (
    SELECT 1 FROM public.event_promotions
    WHERE status = 'active'
      AND event_id = p_event_id
      AND tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'That window overlaps an existing promotion for this event.';
  END IF;
  INSERT INTO public.event_promotions (event_id, starts_at, ends_at, created_by)
  VALUES (p_event_id, p_starts_at, p_ends_at, v_caller)
  RETURNING id INTO v_promotion_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    'admin.promotion.schedule',
    'event_promotions',
    v_promotion_id::text,
    jsonb_build_object('event_id', p_event_id, 'starts_at', p_starts_at::text, 'ends_at', p_ends_at::text)
  );
  RETURN v_promotion_id;
END;
$$;

-- Single audited shape for "verified money, no delivery". Called only from
-- activate_paid_promotion inside its locked transaction (service-role only).
CREATE OR REPLACE FUNCTION public.move_order_to_refund_pending(
  p_order_id uuid,
  p_reason text,
  p_detail jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organizer_id uuid;
BEGIN
  UPDATE public.promotion_orders
  SET status = 'refund_pending', status_reason = p_reason, paid_at = now()
  WHERE id = p_order_id
  RETURNING organizer_id INTO v_organizer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion order not found.';
  END IF;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_organizer_id,
    'promotion.order.refund_pending',
    'promotion_orders',
    p_order_id::text,
    jsonb_build_object('reason', p_reason) || COALESCE(p_detail, '{}'::jsonb)
  );
END;
$$;

-- Payment-verified activation with late-payment recovery.
--
-- The caller is a P2 server function that has JUST verified this payment with
-- Paystack (server-side verify call or signed webhook + verify). Every path
-- below therefore implies money moved, so every non-delivery MUST land in
-- refund_pending — never a bare exception that would strand paid money.
-- Returns 'paid' (fresh delivery), 'paid_late_honored' (recovery delivery),
-- or 'refund_pending' (money safe in the audited refund queue).
CREATE OR REPLACE FUNCTION public.activate_paid_promotion(
  p_order_id uuid,
  p_provider_reference text,
  p_amount_kobo integer
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := now();
  v_status text;
  v_event_id uuid;
  v_organizer_id uuid;
  v_days integer;
  v_total integer;
  v_reference text;
  v_created_at timestamptz;
  v_late boolean;
  v_end timestamptz;
  v_promotion_id uuid;
BEGIN
  -- Lock the order first: simultaneous webhook + verify deliveries serialize
  -- here; the loser sees a terminal state below and no-ops instead of
  -- double-activating.
  SELECT status, event_id, organizer_id, days, total_amount_kobo,
         provider_reference, created_at
    INTO v_status, v_event_id, v_organizer_id, v_days, v_total,
         v_reference, v_created_at
    FROM public.promotion_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion order not found.';
  END IF;
  -- Idempotent replays: duplicate deliveries after success converge here.
  IF v_status = 'paid' THEN
    RETURN 'paid';
  END IF;
  IF v_status IN ('refund_pending', 'refunded') THEN
    RETURN v_status;
  END IF;
  -- The verified payment must match the order snapshot exactly. A mismatch
  -- means the snapshot and the actual charge disagree — the money is real,
  -- so route to the refund queue instead of raising.
  IF v_reference IS DISTINCT FROM p_provider_reference OR v_total IS DISTINCT FROM p_amount_kobo THEN
    PERFORM public.move_order_to_refund_pending(
      p_order_id,
      'amount_mismatch',
      jsonb_build_object(
        'event_id', v_event_id, 'from_status', v_status,
        'expected_reference', v_reference, 'verified_reference', p_provider_reference,
        'expected_amount_kobo', v_total, 'verified_amount_kobo', p_amount_kobo
      )
    );
    RETURN 'refund_pending';
  END IF;
  -- Late = anything but a fresh pending reservation: expired, failed, or
  -- cancelled orders, or a pending order older than the 24-hour reservation.
  v_late := v_status <> 'pending' OR v_created_at <= v_now - make_interval(hours => 24);
  v_end := v_now + make_interval(days => v_days);
  -- Recovery rechecks (also the delivery preconditions for fresh orders):
  -- the event must still be promotable ...
  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = v_event_id AND published = true
      AND COALESCE(status, '') <> 'cancelled' AND ends_at > v_now
  ) THEN
    PERFORM public.move_order_to_refund_pending(
      p_order_id,
      'event_ineligible',
      jsonb_build_object('event_id', v_event_id, 'from_status', v_status, 'late', v_late)
    );
    RETURN 'refund_pending';
  END IF;
  -- ... no live window may overlap the delivery window. Staff windows count:
  -- this check is by status, never by provenance ...
  IF EXISTS (
    SELECT 1 FROM public.event_promotions
    WHERE status = 'active' AND event_id = v_event_id
      AND tstzrange(starts_at, ends_at, '[)') && tstzrange(v_now, v_end, '[)')
  ) THEN
    PERFORM public.move_order_to_refund_pending(
      p_order_id,
      'slot_taken',
      jsonb_build_object('event_id', v_event_id, 'from_status', v_status, 'late', v_late)
    );
    RETURN 'refund_pending';
  END IF;
  -- ... and no OTHER live reservation may exist for the event. The current
  -- order is excluded from its own check (clarification A). A late payment
  -- facing a newer valid reservation goes to the refund queue without
  -- disturbing that reservation (clarification B). The fresh-order branch is
  -- defensive-only: the partial unique index makes a second pending order
  -- unreachable, but money must stay safe even if that ever broke.
  IF EXISTS (
    SELECT 1 FROM public.promotion_orders
    WHERE event_id = v_event_id AND status = 'pending'
      AND created_at > v_now - make_interval(hours => 24)
      AND id <> p_order_id
  ) THEN
    IF v_late THEN
      PERFORM public.move_order_to_refund_pending(
        p_order_id,
        'newer_reservation_exists',
        jsonb_build_object('event_id', v_event_id, 'from_status', v_status, 'late', v_late)
      );
    ELSE
      PERFORM public.move_order_to_refund_pending(
        p_order_id,
        'concurrent_pending_conflict',
        jsonb_build_object('event_id', v_event_id, 'from_status', v_status, 'late', v_late)
      );
    END IF;
    RETURN 'refund_pending';
  END IF;
  -- Deliver. The per-event exclusion constraint is the final backstop for a
  -- staff-schedule-vs-activation race: losing it refunds, never strands.
  BEGIN
    INSERT INTO public.event_promotions (event_id, starts_at, ends_at, created_by, order_id)
    VALUES (v_event_id, v_now, v_end, v_organizer_id, p_order_id)
    RETURNING id INTO v_promotion_id;
  EXCEPTION WHEN exclusion_violation THEN
    v_promotion_id := NULL;
  END;
  IF v_promotion_id IS NULL THEN
    PERFORM public.move_order_to_refund_pending(
      p_order_id,
      'overlap_race',
      jsonb_build_object('event_id', v_event_id, 'from_status', v_status, 'late', v_late)
    );
    RETURN 'refund_pending';
  END IF;
  UPDATE public.promotion_orders
  SET status = 'paid', status_reason = NULL, paid_at = v_now, promotion_id = v_promotion_id
  WHERE id = p_order_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_organizer_id,
    'promotion.order.paid',
    'promotion_orders',
    p_order_id::text,
    jsonb_build_object(
      'event_id', v_event_id, 'promotion_id', v_promotion_id,
      'from_status', v_status, 'late', v_late,
      'days', v_days, 'total_amount_kobo', v_total
    )
  );
  IF v_late THEN
    RETURN 'paid_late_honored';
  END IF;
  RETURN 'paid';
END;
$$;

-- Organizer cancellation of a pending order. Service-role-only by grant: the
-- P2 server function rechecks Paystack BEFORE calling, and diverts to
-- activation/recovery when payment is found. A payment landing between that
-- check and this flip is caught by activate_paid_promotion's late-payment
-- recovery — never lost. Terminal paid/refund states raise loudly instead of
-- silently rewriting money history.
CREATE OR REPLACE FUNCTION public.cancel_promotion_order(
  p_order_id uuid,
  p_actor_id uuid
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_event_id uuid;
  v_organizer_id uuid;
BEGIN
  SELECT status, event_id, organizer_id INTO v_status, v_event_id, v_organizer_id
    FROM public.promotion_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion order not found.';
  END IF;
  IF v_organizer_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'That order belongs to a different organizer.';
  END IF;
  IF v_status = 'paid' THEN
    RAISE EXCEPTION 'That order is already paid. Refunds follow the admin process.';
  END IF;
  IF v_status IN ('refund_pending', 'refunded') THEN
    RAISE EXCEPTION 'That order is already in the refund process.';
  END IF;
  IF v_status IN ('failed', 'expired', 'cancelled') THEN
    RETURN v_status;
  END IF;
  UPDATE public.promotion_orders
  SET status = 'cancelled', status_reason = 'cancelled_by_organizer'
  WHERE id = p_order_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_actor_id,
    'promotion.order.cancel',
    'promotion_orders',
    p_order_id::text,
    jsonb_build_object('event_id', v_event_id)
  );
  RETURN 'cancelled';
END;
$$;

-- Append a daily-rate row. Existing orders keep their snapshots: pricing
-- changes affect new checkouts only, by construction (orders copy the rate,
-- never reference it).
CREATE OR REPLACE FUNCTION public.set_promotion_price(
  p_daily_amount_kobo integer
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_price_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to manage promotion pricing.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or finance_admin may manage promotion pricing.';
  END IF;
  -- Minimum transaction NGN 100 (approved decision 6) with minimum duration
  -- 1 day, so the daily rate itself must be at least 10000 kobo.
  IF p_daily_amount_kobo IS NULL OR p_daily_amount_kobo < 10000 THEN
    RAISE EXCEPTION 'Daily promotion price must be at least 10000 kobo (NGN 100 minimum transaction).';
  END IF;
  INSERT INTO public.promotion_pricing (daily_amount_kobo, created_by)
  VALUES (p_daily_amount_kobo, v_caller)
  RETURNING id INTO v_price_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    'admin.pricing.set',
    'promotion_pricing',
    v_price_id::text,
    jsonb_build_object('daily_amount_kobo', p_daily_amount_kobo, 'currency', 'NGN')
  );
  RETURN v_price_id;
END;
$$;

-- Record an executed refund. The authorized admin executes the provider-side
-- refund first (Paystack dashboard in V1), then calls this with the provider
-- reference as evidence. Row lock + status gate make concurrent recordings
-- safe: the loser sees 'refunded' and raises instead of double-recording.
CREATE OR REPLACE FUNCTION public.record_promotion_refund(
  p_order_id uuid,
  p_paystack_reference text,
  p_admin_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_status text;
  v_total integer;
  v_reason text;
  v_currency text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to record promotion refunds.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or finance_admin may record promotion refunds.';
  END IF;
  IF p_paystack_reference IS NULL OR btrim(p_paystack_reference) = '' THEN
    RAISE EXCEPTION 'Record the Paystack refund reference as evidence.';
  END IF;
  SELECT status, total_amount_kobo, status_reason, currency
    INTO v_status, v_total, v_reason, v_currency
    FROM public.promotion_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion order not found.';
  END IF;
  IF v_status <> 'refund_pending' THEN
    RAISE EXCEPTION 'Only orders awaiting refund can be recorded as refunded.';
  END IF;
  INSERT INTO public.promotion_refunds (order_id, amount_kobo, currency, reason, paystack_reference, admin_note, processed_by)
  VALUES (p_order_id, v_total, v_currency, COALESCE(v_reason, 'unspecified'), btrim(p_paystack_reference), p_admin_note, v_caller);
  UPDATE public.promotion_orders SET status = 'refunded' WHERE id = p_order_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    'admin.promotion.refund',
    'promotion_orders',
    p_order_id::text,
    jsonb_build_object('amount_kobo', v_total, 'reason', COALESCE(v_reason, 'unspecified'), 'paystack_reference', btrim(p_paystack_reference))
  );
END;
$$;

-- Money movers: service-role ONLY. No browser token may invoke activation,
-- cancellation, or the refund-pending helper — P2 server functions call these
-- after server-side Paystack verification.
REVOKE ALL ON FUNCTION public.activate_paid_promotion(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_promotion_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_order_to_refund_pending(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paid_promotion(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_promotion_order(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_order_to_refund_pending(uuid, text, jsonb) TO service_role;

-- Pricing and refunds: staff-callable with internal super/finance role gates
-- (the pricing.manage holders). P3 server functions add permission checks.
REVOKE ALL ON FUNCTION public.set_promotion_price(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_promotion_refund(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_promotion_price(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_promotion_refund(uuid, text, text) TO authenticated, service_role;

COMMIT;

-- Rollback (review only; run as one script if the proposal is withdrawn BEFORE
-- any paid order exists — never run after real money has moved):
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.record_promotion_refund(uuid, text, text);
-- DROP FUNCTION IF EXISTS public.set_promotion_price(integer);
-- DROP FUNCTION IF EXISTS public.cancel_promotion_order(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.activate_paid_promotion(uuid, text, integer);
-- DROP FUNCTION IF EXISTS public.move_order_to_refund_pending(uuid, text, jsonb);
-- ALTER TABLE public.event_promotions DROP COLUMN IF EXISTS order_id;
-- -- Exclusion restore: valid ONLY when no overlapping active windows exist
-- -- (verify first, or this statement fails and the rollback stops here).
-- ALTER TABLE public.event_promotions DROP CONSTRAINT IF EXISTS event_promotions_event_window_excl;
-- ALTER TABLE public.event_promotions ADD CONSTRAINT event_promotions_global_window_excl
--   EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'active');
-- DROP TABLE IF EXISTS public.promotion_refunds;
-- DROP TABLE IF EXISTS public.promotion_webhook_events;
-- DROP TABLE IF EXISTS public.promotion_orders;
-- DROP TABLE IF EXISTS public.promotion_pricing;
-- -- NOTE: create_event_promotion() keeps its per-event overlap check after this
-- -- rollback; restore the 2C-2 global check from that migration file if the
-- -- single-slot rule must return.
-- COMMIT;
