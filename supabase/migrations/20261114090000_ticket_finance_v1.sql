-- Ticket finance V1 (P5 proposal).
--
-- STATUS: PROPOSED — PENDING REVIEW. NOT APPLIED.
-- Do not execute it without explicit authorization and the pre-checks below.
--
-- Approved decisions (P5 scoping):
-- * Platform commission default is 10%, changeable only by super_admin or
--   finance_admin. Each event locks its rate when it is first published;
--   later default changes never rewrite locked rates.
-- * Organizers see gross, platform fee, and net earnings (read-only).
-- * Payouts are manual records only: staff execute the bank transfer outside
--   Outrazo, then record it here. Nothing in this migration moves money.
-- * Admin finance sees full per-order transaction records (permission-gated
--   in the server functions, not in these grants).
--
-- What it does:
-- * Adds public.commission_rates: append-only default-rate history in
--   percent (numeric), seeded with the approved 10.00 opening row. The
--   current default is the row with the greatest effective_at at or below
--   now(). Writes go through set_default_commission_pct() only.
-- * Adds events.commission_pct (nullable): the locked per-event rate.
--   Existing events are backfilled to the 10.00 opening rate (they predate
--   finance; documented, not silent). New drafts stay NULL until publish.
-- * Adds a BEFORE trigger on events: the false -> true publish flip stamps
--   the current default when no rate is set, and any later change to a set
--   rate raises. Publish is client-direct (RLS), so the lock must live here
--   to also cover admin edits and direct database writes. service_role is
--   the documented escape hatch for server-side corrections only.
-- * Adds public.organizer_payouts: manual payout records with the approved
--   workflow pending -> approved -> processing -> paid, plus on_hold and
--   failed. Only a confirmed transfer (with its bank reference) may become
--   paid. No client writes; organizers read their own rows.
-- * Adds create_organizer_payout() RPC (super_admin/finance_admin): refuses
--   to record more than the organizer has net-earned (paid orders minus
--   locked-rate fees, minus already-recorded non-failed payouts), so the
--   same earnings cannot be paid twice and failed attempts free their
--   reservation.
-- * Adds transition_organizer_payout() RPC (super_admin/finance_admin):
--   locked-row status transitions with the valid-transition map, the paid
--   transfer-reference requirement, and an audit entry per transition.
--
-- What it deliberately does NOT do:
-- * No automated money movement, no provider payouts, no ticket refunds
--   (refunds stay a manual human process outside the platform).
-- * No provider-fee tracking (Outrazo absorbs provider fees; no fee data is
--   captured from Bachs in this phase).
-- * No changes to orders, tiers, codes, promotions, or existing RPCs.
--
-- Preconditions: profiles, events, ticket_orders, admin_roles, audit_log exist.
-- Reviewer checklist before applying:
-- 1. Confirm no objects named public.commission_rates / public.organizer_payouts
--    exist, events has no commission_pct column, and no lock_event_commission
--    trigger exists.
-- 2. Confirm the 10.00 opening rate and the full backfill of existing events.
-- 3. Apply exactly once.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL
    OR to_regclass('public.events') IS NULL
    OR to_regclass('public.ticket_orders') IS NULL
    OR to_regclass('public.admin_roles') IS NULL
    OR to_regclass('public.audit_log') IS NULL
  THEN
    RAISE EXCEPTION 'Ticket finance V1 requires the profiles, events, ticket_orders, admin_roles, and audit_log tables.';
  END IF;
  IF to_regclass('public.commission_rates') IS NOT NULL THEN
    RAISE EXCEPTION 'commission_rates already exists; do not apply Ticket finance V1 twice.';
  END IF;
  IF to_regclass('public.organizer_payouts') IS NOT NULL THEN
    RAISE EXCEPTION 'organizer_payouts already exists; do not apply Ticket finance V1 twice.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'commission_pct'
  ) THEN
    RAISE EXCEPTION 'events.commission_pct already exists; do not apply Ticket finance V1 twice.';
  END IF;
END;
$$;

-- ── 1. Default-rate history (append-only) ───────────────────────────────────

CREATE TABLE public.commission_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_pct numeric(5, 2) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commission_rates IS
  'Append-only platform commission default history in percent. Current default = latest effective row at or below now(). Writes go through set_default_commission_pct() only; organizers read the current default to see the rate their next publish will lock.';

CREATE INDEX IF NOT EXISTS commission_rates_effective_idx
  ON public.commission_rates (effective_at DESC);

ALTER TABLE public.commission_rates ENABLE ROW LEVEL SECURITY;

-- The default rate is not sensitive: any signed-in user may read it to see
-- the rate a publish would lock. No write policies: direct writes denied.
CREATE POLICY "Authenticated users read commission rates"
  ON public.commission_rates FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.commission_rates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commission_rates TO authenticated;
GRANT ALL ON public.commission_rates TO service_role;

-- Opening row: the approved 10% default. No human author (migration seed).
INSERT INTO public.commission_rates (rate_pct, created_by)
VALUES (10.00, NULL);

-- ── 2. Locked per-event rate ────────────────────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN commission_pct numeric(5, 2) CHECK (commission_pct IS NULL OR (commission_pct >= 0 AND commission_pct <= 100));

COMMENT ON COLUMN public.events.commission_pct IS
  'Locked platform commission percent for this event, stamped from commission_rates on first publish. NULL only for drafts created before finance or never published. The lock_event_commission trigger rejects every later change (service_role corrections excepted).';

-- Pre-finance events (published or draft) predate the feature, so they all
-- carry the opening 10% rate. One plain UPDATE: no trigger exists yet, and
-- NULL meant "no finance", never "0%", so nothing is overwritten silently.
UPDATE public.events SET commission_pct = 10.00 WHERE commission_pct IS NULL;

-- Stamps the publish flip and locks the rate. Runs on every insert/update,
-- so client-direct publishing, admin edits, and raw SQL all hit the same
-- rule. Reads the current default with a locked, deterministic order.
CREATE OR REPLACE FUNCTION public.lock_event_commission()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_default numeric(5, 2);
  v_publishing boolean := false;
BEGIN
  -- Server-side escape hatch for audited corrections only. anon and
  -- authenticated callers always fall through to the lock below.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    v_publishing := COALESCE(NEW.published, false);
  ELSE
    v_publishing := COALESCE(NEW.published, false) AND NOT COALESCE(OLD.published, false);
    -- A set rate never changes: no resets, no edits, no NULL-ing.
    IF OLD.commission_pct IS NOT NULL AND NEW.commission_pct IS DISTINCT FROM OLD.commission_pct THEN
      RAISE EXCEPTION 'The event commission rate is locked and cannot be changed.';
    END IF;
    -- A draft rate can only ever be stamped by publishing, never hand-set.
    IF OLD.commission_pct IS NULL AND NEW.commission_pct IS NOT NULL AND NOT v_publishing THEN
      RAISE EXCEPTION 'The event commission rate is stamped on publish and cannot be set directly.';
    END IF;
  END IF;
  IF v_publishing AND NEW.commission_pct IS NULL THEN
    SELECT rate_pct INTO v_default
    FROM public.commission_rates
    WHERE effective_at <= now()
    ORDER BY effective_at DESC, created_at DESC
    LIMIT 1;
    IF v_default IS NULL THEN
      RAISE EXCEPTION 'No commission default is configured; publishing is paused until finance sets one.';
    END IF;
    NEW.commission_pct := v_default;
  END IF;
  IF COALESCE(NEW.published, false) AND NEW.commission_pct IS NULL THEN
    RAISE EXCEPTION 'Published events must carry a commission rate.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_event_commission ON public.events;
CREATE TRIGGER lock_event_commission
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.lock_event_commission();

-- ── 3. Default-rate management (audited) ────────────────────────────────────

-- Appends a default-rate row. Locked event rates never move: publishing
-- copies the default, nothing references it afterwards.
CREATE OR REPLACE FUNCTION public.set_default_commission_pct(
  p_rate_pct numeric
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_rate_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to manage the commission default.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or finance_admin may manage the commission default.';
  END IF;
  IF p_rate_pct IS NULL OR p_rate_pct < 0 OR p_rate_pct > 100 THEN
    RAISE EXCEPTION 'Commission default must be between 0 and 100 percent.';
  END IF;
  INSERT INTO public.commission_rates (rate_pct, created_by)
  VALUES (p_rate_pct, v_caller)
  RETURNING id INTO v_rate_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    'admin.commission.set_default',
    'commission_rates',
    v_rate_id::text,
    jsonb_build_object('rate_pct', p_rate_pct)
  );
  RETURN v_rate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_commission_pct(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_commission_pct(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_commission_pct(numeric) TO service_role;

-- ── 4. Manual payout records ────────────────────────────────────────────────

CREATE TABLE public.organizer_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount_kobo integer NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'processing', 'paid', 'on_hold', 'failed')),
  status_reason text,
  reference text,
  admin_note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

COMMENT ON TABLE public.organizer_payouts IS
  'Manual organizer payout records. Staff move money by bank transfer outside Outrazo, then record it here: pending -> approved -> processing -> paid, with on_hold and failed. Only a confirmed transfer with its bank reference may become paid. Organizers read their own rows; every write is a gated RPC.';

CREATE INDEX IF NOT EXISTS organizer_payouts_organizer_idx
  ON public.organizer_payouts (organizer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organizer_payouts_status_idx
  ON public.organizer_payouts (status);

ALTER TABLE public.organizer_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizers read own payouts"
  ON public.organizer_payouts FOR SELECT TO authenticated
  USING (organizer_id = auth.uid());

REVOKE ALL ON public.organizer_payouts FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, organizer_id, amount_kobo, currency, status, status_reason, reference, admin_note, created_at, updated_at, paid_at)
  ON public.organizer_payouts TO authenticated;
GRANT ALL ON public.organizer_payouts TO service_role;

-- Net earned, in kobo, across an organizer's events: every paid order minus
-- its locked-rate fee. Fee is rounded per order (ROUND half away from zero
-- in Postgres numeric), matching the TypeScript earnings aggregate.
CREATE OR REPLACE FUNCTION public.organizer_net_earned_kobo(p_organizer_id uuid)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_net bigint;
BEGIN
  SELECT COALESCE(SUM(
    (o.total_amount * 100)::bigint
    - ROUND((o.total_amount * 100) * COALESCE(e.commission_pct, 10.00) / 100)::bigint
  ), 0)
  INTO v_net
  FROM public.ticket_orders o
  JOIN public.events e ON e.id = o.event_id
  WHERE o.status = 'paid' AND e.created_by = p_organizer_id;
  RETURN v_net;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_net_earned_kobo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organizer_net_earned_kobo(uuid) TO service_role;

-- Records a manual payout. Refuses amounts above the organizer's available
-- balance (net earned minus every non-failed recorded payout), so the same
-- earnings cannot be paid twice and failed attempts free their reservation.
CREATE OR REPLACE FUNCTION public.create_organizer_payout(
  p_organizer_id uuid,
  p_amount_kobo integer,
  p_admin_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_net bigint;
  v_reserved bigint;
  v_payout_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to record payouts.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or finance_admin may record payouts.';
  END IF;
  IF p_organizer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_organizer_id) THEN
    RAISE EXCEPTION 'Organizer not found.';
  END IF;
  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be above zero.';
  END IF;
  LOCK TABLE public.organizer_payouts IN SHARE ROW EXCLUSIVE MODE;
  v_net := public.organizer_net_earned_kobo(p_organizer_id);
  SELECT COALESCE(SUM(amount_kobo), 0) INTO v_reserved
  FROM public.organizer_payouts
  WHERE organizer_id = p_organizer_id AND status <> 'failed';
  IF v_reserved + p_amount_kobo > v_net THEN
    RAISE EXCEPTION 'That payout exceeds the available balance.';
  END IF;
  INSERT INTO public.organizer_payouts (organizer_id, amount_kobo, admin_note, created_by)
  VALUES (p_organizer_id, p_amount_kobo, p_admin_note, v_caller)
  RETURNING id INTO v_payout_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    'admin.payout.create',
    'organizer_payouts',
    v_payout_id::text,
    jsonb_build_object('organizer_id', p_organizer_id, 'amount_kobo', p_amount_kobo)
  );
  RETURN v_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organizer_payout(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organizer_payout(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organizer_payout(uuid, integer, text) TO service_role;

-- Moves one payout along the approved workflow. Row lock + status gate make
-- concurrent transitions safe: the loser sees the new status and raises
-- instead of double-moving. Only confirmed transfers become paid.
CREATE OR REPLACE FUNCTION public.transition_organizer_payout(
  p_payout_id uuid,
  p_to_status text,
  p_reference text DEFAULT NULL,
  p_admin_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_from text;
  v_allowed boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to move payouts.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or finance_admin may move payouts.';
  END IF;
  SELECT status INTO v_from FROM public.organizer_payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found.';
  END IF;
  IF v_from = 'paid' OR v_from = 'failed' THEN
    RAISE EXCEPTION 'Paid and failed payouts are terminal and cannot move.';
  END IF;
  v_allowed :=
    (v_from = 'pending' AND p_to_status IN ('approved', 'on_hold', 'failed'))
    OR (v_from = 'approved' AND p_to_status IN ('processing', 'on_hold', 'failed'))
    OR (v_from = 'processing' AND p_to_status IN ('paid', 'failed'))
    OR (v_from = 'on_hold' AND p_to_status IN ('pending', 'failed'));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'That payout transition is not allowed.';
  END IF;
  IF p_to_status = 'paid' AND (p_reference IS NULL OR btrim(p_reference) = '') THEN
    RAISE EXCEPTION 'Record the bank transfer reference before marking paid.';
  END IF;
  IF p_to_status = 'failed' AND (p_admin_note IS NULL OR btrim(p_admin_note) = '') THEN
    RAISE EXCEPTION 'Record why the payout failed.';
  END IF;
  UPDATE public.organizer_payouts
  SET status = p_to_status,
      status_reason = CASE WHEN p_to_status IN ('on_hold', 'failed') THEN NULLIF(btrim(COALESCE(p_admin_note, '')), '') ELSE status_reason END,
      reference = CASE WHEN p_to_status = 'paid' THEN btrim(p_reference) ELSE reference END,
      admin_note = COALESCE(NULLIF(btrim(COALESCE(p_admin_note, '')), ''), admin_note),
      decided_by = v_caller,
      updated_at = now(),
      paid_at = CASE WHEN p_to_status = 'paid' THEN now() ELSE paid_at END
  WHERE id = p_payout_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    'admin.payout.transition',
    'organizer_payouts',
    p_payout_id::text,
    jsonb_build_object('from', v_from, 'to', p_to_status)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_organizer_payout(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_organizer_payout(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_organizer_payout(uuid, text, text, text) TO service_role;

-- ── 5. Verification ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.commission_rates') IS NULL THEN
    RAISE EXCEPTION 'Ticket finance V1 did not create commission_rates.';
  END IF;
  IF to_regclass('public.organizer_payouts') IS NULL THEN
    RAISE EXCEPTION 'Ticket finance V1 did not create organizer_payouts.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'lock_event_commission'
  ) THEN
    RAISE EXCEPTION 'Ticket finance V1 did not create the commission lock trigger.';
  END IF;
  IF (SELECT count(*) FROM public.commission_rates WHERE rate_pct = 10.00) < 1 THEN
    RAISE EXCEPTION 'Ticket finance V1 did not seed the 10%% opening rate.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.events WHERE commission_pct IS NULL) THEN
    RAISE EXCEPTION 'Ticket finance V1 left events without a locked rate.';
  END IF;
END;
$$;

COMMIT;
