-- PROPOSED forward-only Supabase migration: provider-neutral promotion references (P2 Step 1).
--
-- STATUS: PROPOSED — PENDING REVIEW. NOT APPLIED. Do not execute it without
-- explicit authorization.
--
-- Why this migration is needed:
-- P1 named the Paystack provider in live schema identifiers, but Outrazo's
-- financial policy mandates Bachs.io for incoming payments. Financial records
-- must not lie about their provider, so the names change before P2 builds on
-- them. Behavior is unchanged: same signatures, same gates, same state
-- machine, same manual refund workflow.
--
-- What it does:
-- * Renames public.promotion_refunds.paystack_reference to provider_reference
--   (column grants follow the column automatically).
-- * Renames the auto-created unique constraint to
--   promotion_refunds_provider_reference_key (verified-live under its old
--   name during P1 post-migration verification).
-- * Changes the provider DEFAULT from 'paystack' to 'bachs' on
--   promotion_orders and promotion_webhook_events, and rewrites any stray
--   'paystack' values (all four tables verified-live empty, so zero rows are
--   expected; the UPDATEs are defensive, not a backfill).
-- * Drops and recreates record_promotion_refund() with its evidence parameter
--   renamed to p_provider_reference. PostgreSQL rejects input-parameter
--   renames through CREATE OR REPLACE, so DROP + CREATE inside this same
--   transaction is the verified approach; the exact P1 grants are restored
--   below, and the live owner captured before the DROP is restored
--   explicitly after it (a SECURITY DEFINER body executes as its owner, so
--   ownership must never change by accident of who applies the migration).
--   No views, triggers, policies, or other functions call it (checked
--   statically across every migration and src file, and re-checked live by
--   the all-types dependency guard in the precondition block, which also
--   rejects unknown provider values before the rewrite).
--
-- What it does NOT do:
-- * No behavior change: role gates, refund_pending gate, evidence rule,
--   audit shape (key renamed to provider_reference), and grants are
--   identical to P1.
-- * No changes to promotion_orders, promotion_pricing,
--   promotion_webhook_events, or event_promotions beyond the two provider
--   defaults (no columns added or removed anywhere).
-- * The applied P1 migration file stays byte-for-byte identical; every change
--   here is a new forward-only statement.
--
-- Rerun behavior: strictly one-time. The renames have no IF EXISTS, so a
-- rerun after success fails loudly at the first RENAME with the whole
-- transaction rolling back (harmless). A rerun after failure starts clean for
-- the same reason. Never run this twice expecting a no-op skip.
BEGIN;

DO $$
DECLARE
  v_deps integer;
  v_dep_detail text;
  v_stray integer;
BEGIN
  IF to_regclass('public.promotion_refunds') IS NULL THEN
    RAISE EXCEPTION 'Provider rename requires public.promotion_refunds. Apply the P1 paid-promotions migration first.';
  END IF;
  IF to_regclass('public.promotion_orders') IS NULL
    OR to_regclass('public.promotion_webhook_events') IS NULL THEN
    RAISE EXCEPTION 'Provider rename requires public.promotion_orders and public.promotion_webhook_events. Apply the P1 paid-promotions migration first.';
  END IF;
  -- The old column must exist and the new one must not: anything else means
  -- this migration already ran or P1 was altered by hand.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.promotion_refunds'::pg_catalog.regclass
      AND attname = 'paystack_reference' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'Expected promotion_refunds.paystack_reference to exist. Was this rename already applied?';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.promotion_refunds'::pg_catalog.regclass
      AND attname = 'provider_reference' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'promotion_refunds.provider_reference already exists. This rename already ran.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'promotion_refunds_paystack_reference_key'
      AND conrelid = 'public.promotion_refunds'::pg_catalog.regclass
  ) THEN
    RAISE EXCEPTION 'Expected unique constraint promotion_refunds_paystack_reference_key to exist.';
  END IF;
  IF to_regprocedure('public.record_promotion_refund(uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Provider rename requires record_promotion_refund(uuid, text, text). Apply the P1 paid-promotions migration first.';
  END IF;
  -- Provider values guard: only the two known labels may exist. Anything
  -- else means unknown manual rows, and the rewrite below must not silently
  -- leave them behind.
  SELECT count(*) INTO v_stray
  FROM public.promotion_orders WHERE provider NOT IN ('paystack', 'bachs');
  IF v_stray <> 0 THEN
    RAISE EXCEPTION 'promotion_orders has % rows with unexpected provider values; investigate before renaming.', v_stray;
  END IF;
  SELECT count(*) INTO v_stray
  FROM public.promotion_webhook_events WHERE provider NOT IN ('paystack', 'bachs');
  IF v_stray <> 0 THEN
    RAISE EXCEPTION 'promotion_webhook_events has % rows with unexpected provider values; investigate before renaming.', v_stray;
  END IF;
  -- Live dependency guard: a standalone RPC carries no pg_depend rows of ANY
  -- type — normal, auto, internal, extension, or pin. (Owner and grants live
  -- in pg_shdepend, not here, and are rebuilt explicitly below.) Any row
  -- aborts the migration before the DROP instead of after it.
  SELECT count(*),
         COALESCE(string_agg(d.deptype::text || ':' || d.classid::regclass::text, ', '), '')
    INTO v_deps, v_dep_detail
  FROM pg_catalog.pg_depend d
  WHERE d.refobjid = to_regprocedure('public.record_promotion_refund(uuid, text, text)')
    AND d.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass;
  IF v_deps <> 0 THEN
    RAISE EXCEPTION 'record_promotion_refund has % unexpected dependencies (%); investigate before renaming.', v_deps, v_dep_detail;
  END IF;
END;
$$;

-- Capture the live owner before the DROP: SECURITY DEFINER executes as its
-- owner, so the recreated function must run as exactly the same role. The
-- temp table dies with this transaction, on success and on rollback alike.
CREATE TEMPORARY TABLE _record_refund_owner ON COMMIT DROP AS
SELECT pg_catalog.pg_get_userbyid(p.proowner) AS owner_name
FROM pg_catalog.pg_proc p
WHERE p.oid = to_regprocedure('public.record_promotion_refund(uuid, text, text)');

ALTER TABLE public.promotion_refunds RENAME COLUMN paystack_reference TO provider_reference;

ALTER TABLE public.promotion_refunds RENAME CONSTRAINT promotion_refunds_paystack_reference_key TO promotion_refunds_provider_reference_key;

ALTER TABLE public.promotion_orders ALTER COLUMN provider SET DEFAULT 'bachs';

ALTER TABLE public.promotion_webhook_events ALTER COLUMN provider SET DEFAULT 'bachs';

UPDATE public.promotion_orders SET provider = 'bachs' WHERE provider = 'paystack';

UPDATE public.promotion_webhook_events SET provider = 'bachs' WHERE provider = 'paystack';

-- Record an executed refund. The authorized admin executes the provider-side
-- refund first (Bachs dashboard in V1: incoming payments are automated, all
-- outgoing money moves by hand), then calls this with the provider reference
-- as evidence. Row lock + status gate make concurrent recordings safe: the
-- loser sees 'refunded' and raises instead of double-recording.
DROP FUNCTION public.record_promotion_refund(uuid, text, text);

CREATE FUNCTION public.record_promotion_refund(
  p_order_id uuid,
  p_provider_reference text,
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
  IF p_provider_reference IS NULL OR btrim(p_provider_reference) = '' THEN
    RAISE EXCEPTION 'Record the provider refund reference as evidence.';
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
  INSERT INTO public.promotion_refunds (order_id, amount_kobo, currency, reason, provider_reference, admin_note, processed_by)
  VALUES (p_order_id, v_total, v_currency, COALESCE(v_reason, 'unspecified'), btrim(p_provider_reference), p_admin_note, v_caller);
  UPDATE public.promotion_orders SET status = 'refunded' WHERE id = p_order_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_caller,
    'admin.promotion.refund',
    'promotion_orders',
    p_order_id::text,
    jsonb_build_object('amount_kobo', v_total, 'reason', COALESCE(v_reason, 'unspecified'), 'provider_reference', btrim(p_provider_reference))
  );
END;
$$;

-- Exact P1 grants, restored after the DROP (a DROP discards grants, so they
-- are re-issued here rather than assumed): staff-callable with the internal
-- super/finance role gates above.
REVOKE ALL ON FUNCTION public.record_promotion_refund(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_promotion_refund(uuid, text, text) TO authenticated, service_role;

-- Restore the captured owner explicitly: DROP + CREATE would otherwise leave
-- the function owned by whoever applies this migration, silently changing
-- what the SECURITY DEFINER body executes as if that role ever differed.
DO $$
DECLARE
  v_owner text;
BEGIN
  SELECT owner_name INTO v_owner FROM _record_refund_owner;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Owner capture for record_promotion_refund is missing; refusing to leave ownership to chance.';
  END IF;
  EXECUTE pg_catalog.format('ALTER FUNCTION public.record_promotion_refund(uuid, text, text) OWNER TO %I', v_owner);
END;
$$;

COMMIT;

-- Rollback (review only; run as one script if the proposal is withdrawn BEFORE
-- P2 builds on the new names — never after recorded refunds reference them):
-- BEGIN;
-- ALTER TABLE public.promotion_refunds RENAME COLUMN provider_reference TO paystack_reference;
-- ALTER TABLE public.promotion_refunds RENAME CONSTRAINT promotion_refunds_provider_reference_key TO promotion_refunds_paystack_reference_key;
-- ALTER TABLE public.promotion_orders ALTER COLUMN provider SET DEFAULT 'paystack';
-- ALTER TABLE public.promotion_webhook_events ALTER COLUMN provider SET DEFAULT 'paystack';
-- UPDATE public.promotion_orders SET provider = 'paystack' WHERE provider = 'bachs';
-- UPDATE public.promotion_webhook_events SET provider = 'paystack' WHERE provider = 'bachs';
-- DROP FUNCTION public.record_promotion_refund(uuid, text, text);
-- -- Then recreate the P1 function body verbatim from
-- -- supabase/migrations/20261104090000_paid_promotions_v1.sql and re-issue:
-- -- REVOKE ALL ON FUNCTION public.record_promotion_refund(uuid, text, text) FROM PUBLIC, anon;
-- -- GRANT EXECUTE ON FUNCTION public.record_promotion_refund(uuid, text, text) TO authenticated, service_role;
-- COMMIT;
