-- P2 Step 4 fix: organizer order-read column grants.
--
-- The organizer-facing order queries (promotion success/cancelled pages and
-- the Promotions list) read public.promotion_orders through the caller's own
-- user client and select organizer_id (explicit ownership re-check plus the
-- list filter) and checkout_expires_at (resume display). The base P2 grant
-- covered neither column, so every organizer read failed with "permission
-- denied" while the service-role checkout and webhook paths kept working.
--
-- This migration completes the read grant with exactly those two columns.
-- Deliberately not granted: checkout_id and checkout_url, so the hosted
-- payment URL stays reachable only through the owner-checked service-role
-- server functions.
--
-- Safety properties (pinned by
-- tests/promotion-order-read-grants-migration.test.mjs):
-- - Additive only: granting never removes; every existing column grant stays.
-- - No table-wide SELECT, no policy change, no function change, no row writes.
-- - Owner-scoped row access is unchanged: organizers still read only rows
--   whose organizer_id matches their own auth id.
-- - Idempotent and statement-independent: re-running is harmless, and each
--   statement below runs on its own in the Supabase SQL Editor.
--
-- Review-only: apply once via the Supabase SQL Editor after approval.

-- Precondition: the paid-promotions base table and both columns must exist
-- (base migration plus the checkout-columns migration). Fails loudly with a
-- clear message instead of granting against an unexpected schema.
DO $$
BEGIN
  IF to_regclass('public.promotion_orders') IS NULL THEN
    RAISE EXCEPTION 'promotion_orders table is missing. Apply the paid-promotions base migration first.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'promotion_orders'
      AND column_name = 'organizer_id'
  ) THEN
    RAISE EXCEPTION 'promotion_orders.organizer_id is missing. Apply the paid-promotions base migration first.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'promotion_orders'
      AND column_name = 'checkout_expires_at'
  ) THEN
    RAISE EXCEPTION 'promotion_orders.checkout_expires_at is missing. Apply the checkout-columns migration first.';
  END IF;
END
$$;

GRANT SELECT (organizer_id) ON public.promotion_orders TO authenticated;
GRANT SELECT (checkout_expires_at) ON public.promotion_orders TO authenticated;
