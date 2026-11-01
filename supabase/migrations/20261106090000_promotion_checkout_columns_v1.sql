-- P2 Step 4: resumable Bachs checkout sessions on promotion orders.
--
-- Adds three NULLABLE columns so the checkout flow can resume an issued
-- session (same URL, no second payable session) and run recheck-before-
-- release recovery on stale reservations (verification needs the stored
-- checkout id). Additive only: existing rows are untouched, no backfill.
--
-- Security: the authenticated role's column-level SELECT grant on
-- promotion_orders enumerates its columns and does NOT include the new
-- checkout_* columns, so checkout URLs stay reachable only through the
-- service-role server functions (owner-checked there). This migration adds
-- no grant for them.
--
-- Review-only: apply once via the Supabase SQL Editor after approval.
-- Statements are independent (IF NOT EXISTS); safe under incremental
-- execution.

ALTER TABLE public.promotion_orders
  ADD COLUMN IF NOT EXISTS checkout_id text,
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz;

-- One order per Bachs session id. Partial index: NULLs (session not yet
-- issued or issuance uncertain) are exempt, so concurrent creates never
-- collide on the NULL placeholder.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_orders_checkout_id_key
  ON public.promotion_orders (checkout_id)
  WHERE checkout_id IS NOT NULL;

COMMENT ON COLUMN public.promotion_orders.checkout_id IS
  'Bachs checkout-session id for the pending order. NULL until a session is issued; used for resume and recheck-before-release recovery.';
COMMENT ON COLUMN public.promotion_orders.checkout_url IS
  'Hosted Bachs payment URL. Owner-visible only via server functions; never granted to client roles.';
COMMENT ON COLUMN public.promotion_orders.checkout_expires_at IS
  'Local copy of the 24h Bachs session expiry. Resume treats a past value as dead and re-verifies before recreating.';
