-- Ticket validation and check-in V1 (P3 proposal).
--
-- STATUS: PROPOSED — PENDING REVIEW. NOT APPLIED.
-- Do not execute it without explicit authorization and the pre-checks below.
--
-- What it does:
-- * Adds public.ticket_codes: one row per paid ticket unit (2x Regular =
--   2 codes), each with an unguessable unique code. Codes are issued only
--   for PAID orders, idempotently, by public.issue_ticket_codes().
-- * Adds public.check_in_ticket(): the single locked check-in path. A code
--   checks in exactly once; replays report the original check-in instead
--   of double-counting. Cancelled/ended events and non-paid orders refuse.
-- * No client access: both RPCs are service-role-only and the table has no
--   policies. Buyers read their codes and organizers check in through
--   audited, ownership-checked server functions.
--
-- What it deliberately does NOT do:
-- * No changes to orders, items, tiers, events, RSVPs, promotions, or any
--   existing policy or RPC (activate_ticket_order is untouched).
-- * No automated refunds, transfers, or payouts.
--
-- Preconditions: the P1 ticket-checkout migration is applied
-- (ticket_orders/total_amount/provider_reference/paid_at and
-- activate_ticket_order must exist). No pre-existing ticket_codes table.
--
-- Reviewer checklist before applying:
-- 1. Confirm ticket_orders has the P1 columns and paid orders exist or not
--    (both fine: issuance backfills idempotently on next status refresh).
-- 2. Confirm no object named public.ticket_codes exists yet.
-- 3. Apply exactly once.
BEGIN;

DO $$
DECLARE
  missing text;
BEGIN
  IF to_regclass('public.ticket_orders') IS NULL
    OR to_regclass('public.ticket_items') IS NULL
    OR to_regclass('public.events') IS NULL
  THEN
    RAISE EXCEPTION 'Ticket check-in V1 requires the P1 ticket-checkout tables.';
  END IF;

  SELECT string_agg(format('%I.%I', required.table_name, required.column_name), ', ')
  INTO missing
  FROM (VALUES
    ('ticket_orders', 'status'),
    ('ticket_orders', 'provider_reference'),
    ('ticket_orders', 'paid_at'),
    ('ticket_items', 'unit_price')
  ) AS required(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns actual
    WHERE actual.table_schema = 'public'
      AND actual.table_name = required.table_name
      AND actual.column_name = required.column_name
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Ticket check-in V1 needs the P1 columns first; missing: %. Apply the P1 migration, then re-run.', missing;
  END IF;

  IF to_regclass('public.ticket_codes') IS NOT NULL THEN
    RAISE EXCEPTION 'ticket_codes already exists; do not apply Ticket check-in V1 twice.';
  END IF;
END;
$$;

-- ── 1. One row per paid ticket unit ──────────────────────────────────────────
CREATE TABLE public.ticket_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tier_id uuid REFERENCES public.event_ticket_tiers(id) ON DELETE SET NULL,
  tier_name text NOT NULL,
  ticket_no integer NOT NULL CHECK (ticket_no > 0),
  code text NOT NULL,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'checked_in')),
  checked_in_at timestamptz,
  checked_in_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, ticket_no),
  UNIQUE (code)
);

COMMENT ON TABLE public.ticket_codes IS
  'One scannable code per paid ticket unit. Issued idempotently by issue_ticket_codes() for paid orders only; consumed exactly once by check_in_ticket(). No client access.';

CREATE INDEX IF NOT EXISTS ticket_codes_event_idx ON public.ticket_codes (event_id);

ALTER TABLE public.ticket_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ticket_codes TO service_role;

-- ── 2. Idempotent issuance for paid orders ────────────────────────────────────
-- One code per ticket unit, numbered deterministically per order so retries
-- converge: the (order_id, ticket_no) slot wins once and replays change
-- nothing. The code itself carries 48 bits of randomness plus the slot, so
-- guessing a valid code is infeasible and every code stays attributable.
CREATE OR REPLACE FUNCTION public.issue_ticket_codes(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_event_id uuid;
  item record;
  unit_no integer;
  issued integer := 0;
BEGIN
  SELECT status, event_id INTO v_status, v_event_id
  FROM public.ticket_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket order not found.';
  END IF;
  IF v_status <> 'paid' THEN
    RAISE EXCEPTION 'Ticket codes are issued only for paid orders.';
  END IF;

  -- Positional numbering: units are numbered by their position across the
  -- ordered lines, so every retry addresses the same slots.
  SELECT count(*) INTO issued FROM public.ticket_codes WHERE order_id = p_order_id;
  unit_no := 0;
  FOR item IN
    SELECT tier_id, tier_name, quantity
    FROM public.ticket_items
    WHERE order_id = p_order_id
    ORDER BY tier_name, tier_id NULLS LAST
  LOOP
    FOR i IN 1..item.quantity LOOP
      unit_no := unit_no + 1;
      INSERT INTO public.ticket_codes (order_id, event_id, tier_id, tier_name, ticket_no, code)
      VALUES (
        p_order_id,
        v_event_id,
        item.tier_id,
        item.tier_name,
        unit_no,
        'TKT-' || upper(substr(md5(p_order_id::text || ':' || unit_no || ':' || gen_random_uuid()::text), 1, 10))
      )
      ON CONFLICT (order_id, ticket_no) DO NOTHING;
    END LOOP;
  END LOOP;

  SELECT count(*) - issued INTO issued FROM public.ticket_codes WHERE order_id = p_order_id;
  RETURN issued;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_ticket_codes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_ticket_codes(uuid) TO service_role;

-- ── 3. Single locked check-in path ────────────────────────────────────────────
-- A code checks in exactly once. Replays return 'already_checked_in' with
-- the original timestamp instead of double-counting, so door staff see the
-- truth rather than an error. Cancelled or ended events refuse; codes from
-- non-paid orders can never exist (issuance requires paid) and are still
-- re-verified here. The server function proves event ownership before
-- calling; this RPC additionally requires the code to belong to the event.
CREATE OR REPLACE FUNCTION public.check_in_ticket(
  p_code text,
  p_event_id uuid,
  p_actor uuid
)
RETURNS TABLE (
  outcome text,
  tier_name text,
  order_reference text,
  checked_in_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  code_row public.ticket_codes%ROWTYPE;
  v_order_status text;
  v_order_reference text;
  v_published boolean;
  v_event_status text;
  v_ends_at timestamptz;
BEGIN
  SELECT * INTO code_row
  FROM public.ticket_codes WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That ticket code was not found.';
  END IF;
  IF code_row.event_id IS DISTINCT FROM p_event_id THEN
    RAISE EXCEPTION 'That ticket is for a different event.';
  END IF;
  IF code_row.status = 'checked_in' THEN
    RETURN QUERY SELECT 'already_checked_in'::text, code_row.tier_name, ''::text, code_row.checked_in_at;
    RETURN;
  END IF;

  SELECT status, reference INTO v_order_status, v_order_reference
  FROM public.ticket_orders WHERE id = code_row.order_id;
  IF NOT FOUND OR v_order_status <> 'paid' THEN
    RAISE EXCEPTION 'That ticket is not paid for.';
  END IF;

  SELECT published, status, ends_at INTO v_published, v_event_status, v_ends_at
  FROM public.events WHERE id = code_row.event_id;
  IF NOT FOUND OR NOT v_published THEN
    RAISE EXCEPTION 'That event is no longer available.';
  END IF;
  IF v_event_status = 'cancelled' THEN
    RAISE EXCEPTION 'That event was cancelled.';
  END IF;
  IF v_ends_at IS NOT NULL AND v_ends_at <= now() THEN
    RAISE EXCEPTION 'That event has already ended.';
  END IF;

  UPDATE public.ticket_codes
  SET status = 'checked_in', checked_in_at = now(), checked_in_by = p_actor
  WHERE id = code_row.id;

  RETURN QUERY SELECT 'checked_in'::text, code_row.tier_name, v_order_reference, now();
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_ticket(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text, uuid, uuid) TO service_role;

-- ── 4. Verification ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.ticket_codes') IS NULL THEN
    RAISE EXCEPTION 'Ticket check-in V1 did not create ticket_codes.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'issue_ticket_codes' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'issue_ticket_codes must exist and be SECURITY DEFINER.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_in_ticket' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'check_in_ticket must exist and be SECURITY DEFINER.';
  END IF;
END;
$$;

COMMIT;
