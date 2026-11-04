-- Points rewards & manual withdrawals V1 (proposal).
--
-- STATUS: PROPOSED — PENDING REVIEW. NOT APPLIED.
-- Do not execute it without explicit authorization and the pre-checks below.
--
-- Approved decisions:
-- * 100 Outrazo Points = ₦1,000 (1 point = ₦10). Minimum withdrawal ₦3,000
--   (300 points). Both configurable by super_admin / finance_admin only.
-- * Points live in an append-only ledger; balances are derived, never edited.
-- * Withdrawals are manual records only: staff transfer money by bank outside
--   Outrazo, then record it here. Nothing in this migration moves money.
-- * Bank verification provider: none configured. account_name is user-supplied
--   and details are stored unverified until a provider is approved.
--
-- What it does:
-- * Adds public.reward_settings: key/value rewards configuration with audited
--   writes through set_reward_setting() only. Seeded with the approved
--   opening values.
-- * Adds public.points_wallets: one balance row per user (lazy-created).
-- * Adds public.points_ledger: immutable append-only points movements with
--   running balances and conversion snapshots.
-- * Adds public.user_bank_details: one bank-details row per user, readable
--   and writable ONLY by that user. Staff access goes through audited
--   server code (service_role), never a client policy.
-- * Adds public.withdrawal_requests: manual withdrawal records with the
--   workflow pending -> processing -> paid, plus rejected and cancelled.
--   Owners read their own rows MINUS the full account number (column grant);
--   every write is a gated RPC.
-- * Extends the notifications type check with the five withdrawal types.
-- * Adds credit_points() RPC: locked-row wallet credits with ledger entries.
-- * Adds request_withdrawal() RPC: reserves points + ledger entry + request
--   row atomically; enforces settings, minimums, limits, and balance under
--   a wallet lock; idempotency key defeats double-submits.
-- * Adds cancel_withdrawal_request() RPC: owner cancels own pending request,
--   reserved points return through a reversal ledger entry.
-- * Adds transition_withdrawal() RPC: locked-row admin transitions with the
--   valid-transition map, the paid amount-match + reference requirements,
--   reversal entries on reject/cancel, and an audit entry per transition.
-- * Each withdrawal RPC inserts the matching inbox notification in the same
--   transaction, so the user is told exactly what happened.
--
-- What it deliberately does NOT do:
-- * No automated money movement, disbursement APIs, payout workers, or
--   refunds of any kind.
-- * No automatic earning rules (attendance/referral/campaign credits arrive
--   later through credit_points(); only manual admin credits exist now).
-- * No changes to orders, tiers, codes, payouts, promotions, or existing RPCs.
--
-- Preconditions: profiles, admin_roles, audit_log, notifications exist.
-- Reviewer checklist before applying:
-- 1. Confirm no objects named public.reward_settings / public.points_wallets /
--    public.points_ledger / public.user_bank_details / public.withdrawal_requests
--    exist.
-- 2. Confirm the opening values: 10 naira per point, ₦3,000 minimum.
-- 3. Apply exactly once.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL
    OR to_regclass('public.admin_roles') IS NULL
    OR to_regclass('public.audit_log') IS NULL
    OR to_regclass('public.notifications') IS NULL
  THEN
    RAISE EXCEPTION 'Points rewards V1 requires the profiles, admin_roles, audit_log, and notifications tables.';
  END IF;
  IF to_regclass('public.reward_settings') IS NOT NULL THEN
    RAISE EXCEPTION 'reward_settings already exists; do not apply Points rewards V1 twice.';
  END IF;
  IF to_regclass('public.points_wallets') IS NOT NULL THEN
    RAISE EXCEPTION 'points_wallets already exists; do not apply Points rewards V1 twice.';
  END IF;
  IF to_regclass('public.points_ledger') IS NOT NULL THEN
    RAISE EXCEPTION 'points_ledger already exists; do not apply Points rewards V1 twice.';
  END IF;
  IF to_regclass('public.user_bank_details') IS NOT NULL THEN
    RAISE EXCEPTION 'user_bank_details already exists; do not apply Points rewards V1 twice.';
  END IF;
  IF to_regclass('public.withdrawal_requests') IS NOT NULL THEN
    RAISE EXCEPTION 'withdrawal_requests already exists; do not apply Points rewards V1 twice.';
  END IF;
END;
$$;

-- ── 1. Rewards configuration (current values, audited writes) ───────────────

CREATE TABLE public.reward_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reward_settings IS
  'Current rewards knobs. Writes go through set_reward_setting() only (audited); reads are public to signed-in users so the wallet can price itself. History lives in audit_log, never by rewriting balances.';

ALTER TABLE public.reward_settings ENABLE ROW LEVEL SECURITY;

-- Settings are not sensitive: any signed-in user may read them to see the
-- rate and minimums. No write policies: direct writes are denied.
CREATE POLICY "Authenticated users read reward settings"
  ON public.reward_settings FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.reward_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.reward_settings TO authenticated;
GRANT ALL ON public.reward_settings TO service_role;

-- Opening values (approved): 1 point = ₦10, ₦3,000 minimum, no caps.
INSERT INTO public.reward_settings (key, value) VALUES
  ('naira_per_point', '10'),
  ('min_withdrawal_naira', '3000'),
  ('max_withdrawal_naira', 'null'),
  ('rewards_enabled', 'true'),
  ('withdrawals_enabled', 'true'),
  ('daily_limit_naira', 'null'),
  ('monthly_limit_naira', 'null');

-- ── 2. Wallets + immutable ledger ───────────────────────────────────────────

CREATE TABLE public.points_wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_points bigint NOT NULL DEFAULT 0 CHECK (balance_points >= 0),
  lifetime_earned_points bigint NOT NULL DEFAULT 0 CHECK (lifetime_earned_points >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.points_wallets IS
  'Cached per-user points balances. Owners read their own row; every mutation goes through a gated RPC that writes the ledger first. Rows are created lazily on first credit.';

ALTER TABLE public.points_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own wallet"
  ON public.points_wallets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.points_wallets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.points_wallets TO authenticated;
GRANT ALL ON public.points_wallets TO service_role;

CREATE TABLE public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('earn', 'bonus', 'adjust', 'withdraw_reserve', 'withdraw_complete', 'withdraw_reversal', 'cancel_reversal')),
  points bigint NOT NULL CHECK (points <> 0 OR type = 'withdraw_complete'),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  ref_type text,
  ref_id text,
  description text NOT NULL DEFAULT '',
  naira_per_point numeric,
  naira_amount_kobo bigint,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.points_ledger IS
  'Append-only points movements with running balances. Corrections use compensating entries, never edits. Owners read their own rows; inserts happen only inside the gated RPCs.';

CREATE INDEX IF NOT EXISTS points_ledger_user_idx
  ON public.points_ledger (user_id, created_at DESC);

ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ledger"
  ON public.points_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.points_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;

-- ── 3. User bank details (owner-only) ───────────────────────────────────────

CREATE TABLE public.user_bank_details (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_name text NOT NULL CHECK (char_length(bank_name) BETWEEN 2 AND 80),
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{10}$'),
  account_name text NOT NULL CHECK (char_length(account_name) BETWEEN 2 AND 100),
  verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_bank_details IS
  'Bank details each user supplies for MANUAL withdrawals. Owner-only reads and writes; staff withdrawal tooling reads through audited server code. Names are user-supplied until a verification provider is approved.';

ALTER TABLE public.user_bank_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own bank details"
  ON public.user_bank_details FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.user_bank_details FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.user_bank_details TO authenticated;
GRANT ALL ON public.user_bank_details TO service_role;

-- ── 4. Withdrawal requests (manual records) ─────────────────────────────────

CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  points bigint NOT NULL CHECK (points > 0),
  naira_per_point numeric NOT NULL CHECK (naira_per_point > 0),
  naira_amount_kobo bigint NOT NULL CHECK (naira_amount_kobo > 0),
  bank_name text NOT NULL,
  account_name text NOT NULL,
  account_number text NOT NULL,
  account_last4 text NOT NULL CHECK (account_last4 ~ '^[0-9]{4}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'rejected', 'cancelled')),
  status_reason text,
  paid_amount_kobo bigint,
  paid_reference text,
  paid_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

COMMENT ON TABLE public.withdrawal_requests IS
  'Manual withdrawal records. Points reserve at request time and return on reject/cancel through reversal ledger entries. Owners read their own rows WITHOUT the full account number (column grant); staff reads go through audited server code.';

CREATE INDEX IF NOT EXISTS withdrawal_requests_user_idx
  ON public.withdrawal_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx
  ON public.withdrawal_requests (status, created_at DESC);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own withdrawal requests"
  ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- The full account number is deliberately absent from this column list.
REVOKE ALL ON public.withdrawal_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, idempotency_key, points, naira_per_point, naira_amount_kobo, bank_name, account_name, account_last4, status, status_reason, paid_amount_kobo, paid_reference, paid_at, created_at, updated_at)
  ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;

-- ── 5. Withdrawal notification types ────────────────────────────────────────

-- The inbox CHECK enumerates its types; extend it (drop + re-add reads the
-- live rows, so this fails closed if an unknown type ever sneaks in).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'rsvp_confirmed', 'rsvp_cancelled', 'order_paid', 'event_cancelled',
  'withdrawal_submitted', 'withdrawal_processing', 'withdrawal_paid',
  'withdrawal_rejected', 'withdrawal_cancelled'
));

-- ── 6. Settings management (audited) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_reward_setting(
  p_key text,
  p_value jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to manage rewards settings.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or finance_admin may manage rewards settings.';
  END IF;
  IF p_key NOT IN ('naira_per_point', 'min_withdrawal_naira', 'max_withdrawal_naira', 'rewards_enabled', 'withdrawals_enabled', 'daily_limit_naira', 'monthly_limit_naira') THEN
    RAISE EXCEPTION 'Unknown rewards setting.';
  END IF;
  IF p_key IN ('naira_per_point', 'min_withdrawal_naira') THEN
    IF jsonb_typeof(p_value) <> 'number' OR (p_value::text)::numeric <= 0 THEN
      RAISE EXCEPTION 'That setting must be a number above zero.';
    END IF;
  ELSIF p_key IN ('max_withdrawal_naira', 'daily_limit_naira', 'monthly_limit_naira') THEN
    IF jsonb_typeof(p_value) <> 'number' AND jsonb_typeof(p_value) <> 'null' THEN
      RAISE EXCEPTION 'That setting must be a number or empty.';
    END IF;
    IF jsonb_typeof(p_value) = 'number' AND (p_value::text)::numeric <= 0 THEN
      RAISE EXCEPTION 'That setting must be a number above zero or empty.';
    END IF;
  ELSE
    IF jsonb_typeof(p_value) <> 'boolean' THEN
      RAISE EXCEPTION 'That setting must be true or false.';
    END IF;
  END IF;
  INSERT INTO public.reward_settings (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, v_caller, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller, 'admin.rewards.set_setting', 'reward_settings', p_key, jsonb_build_object('key', p_key, 'value', p_value));
END;
$$;

REVOKE ALL ON FUNCTION public.set_reward_setting(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_reward_setting(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_reward_setting(text, jsonb) TO service_role;

-- ── 7. Wallet credits (locked-row, ledger-first) ────────────────────────────

-- Credits (or supervised debits) one wallet. Service-role callers are the
-- future automatic earn rules; human callers must be finance staff. The
-- wallet row locks first, so concurrent credits serialize and the running
-- balance can never go negative or skip a beat.
CREATE OR REPLACE FUNCTION public.credit_points(
  p_user_id uuid,
  p_points bigint,
  p_type text,
  p_description text DEFAULT '',
  p_naira_per_point numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_balance bigint;
  v_earned bigint;
  v_entry_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Sign in is required to credit points.';
    END IF;
    SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin') THEN
      RAISE EXCEPTION 'Only a super_admin or finance_admin may credit points.';
    END IF;
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found.';
  END IF;
  IF p_type NOT IN ('earn', 'bonus', 'adjust') THEN
    RAISE EXCEPTION 'That credit type is not valid.';
  END IF;
  IF p_points IS NULL OR p_points = 0 THEN
    RAISE EXCEPTION 'Credit amount must not be zero.';
  END IF;
  INSERT INTO public.points_wallets (user_id, balance_points, lifetime_earned_points)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_points, lifetime_earned_points INTO v_balance, v_earned
  FROM public.points_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance + p_points < 0 THEN
    RAISE EXCEPTION 'That adjustment exceeds the available balance.';
  END IF;
  INSERT INTO public.points_ledger (user_id, type, points, balance_after, description, naira_per_point, actor_id)
  VALUES (p_user_id, p_type, p_points, v_balance + p_points, COALESCE(p_description, ''), p_naira_per_point, v_caller)
  RETURNING id INTO v_entry_id;
  UPDATE public.points_wallets
  SET balance_points = v_balance + p_points,
      lifetime_earned_points = v_earned + CASE WHEN p_points > 0 THEN p_points ELSE 0 END,
      updated_at = now()
  WHERE user_id = p_user_id;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller, 'admin.rewards.credit', 'points_ledger', v_entry_id::text,
    jsonb_build_object('user_id', p_user_id, 'type', p_type, 'points', p_points));
  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_points(uuid, bigint, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_points(uuid, bigint, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_points(uuid, bigint, text, text, numeric) TO service_role;

-- ── 8. Withdrawal requests (reserve atomically) ─────────────────────────────

-- One atomic reservation: settings + bank + limits + balance are all checked
-- while the wallet row is locked, then the request, the reserve ledger
-- entry, and the inbox note land together. The idempotency key makes a
-- double-tap return the original request instead of reserving twice.
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_points bigint,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_existing uuid;
  v_rate numeric;
  v_min_naira numeric;
  v_max_naira numeric;
  v_withdrawals_on boolean;
  v_daily_cap numeric;
  v_monthly_cap numeric;
  v_kobo bigint;
  v_balance bigint;
  v_bank_name text;
  v_account_name text;
  v_account_number text;
  v_used_today bigint;
  v_used_month bigint;
  v_request_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to request a withdrawal.';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'A request key is required.';
  END IF;
  SELECT id INTO v_existing FROM public.withdrawal_requests
  WHERE user_id = v_caller AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;
  IF p_points IS NULL OR p_points <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be above zero.';
  END IF;
  SELECT value INTO v_rate FROM public.reward_settings WHERE key = 'naira_per_point';
  SELECT value INTO v_min_naira FROM public.reward_settings WHERE key = 'min_withdrawal_naira';
  SELECT value INTO v_max_naira FROM public.reward_settings WHERE key = 'max_withdrawal_naira';
  SELECT value INTO v_withdrawals_on FROM public.reward_settings WHERE key = 'withdrawals_enabled';
  SELECT value INTO v_daily_cap FROM public.reward_settings WHERE key = 'daily_limit_naira';
  SELECT value INTO v_monthly_cap FROM public.reward_settings WHERE key = 'monthly_limit_naira';
  v_rate := COALESCE((v_rate::text)::numeric, 10);
  v_min_naira := COALESCE((v_min_naira::text)::numeric, 3000);
  v_max_naira := CASE WHEN v_max_naira IS NULL OR jsonb_typeof(v_max_naira) = 'null' THEN NULL ELSE (v_max_naira::text)::numeric END;
  v_withdrawals_on := COALESCE((v_withdrawals_on::text)::boolean, true);
  v_daily_cap := CASE WHEN v_daily_cap IS NULL OR jsonb_typeof(v_daily_cap) = 'null' THEN NULL ELSE (v_daily_cap::text)::numeric END;
  v_monthly_cap := CASE WHEN v_monthly_cap IS NULL OR jsonb_typeof(v_monthly_cap) = 'null' THEN NULL ELSE (v_monthly_cap::text)::numeric END;
  IF NOT v_withdrawals_on THEN
    RAISE EXCEPTION 'Withdrawals are currently disabled.';
  END IF;
  v_kobo := (p_points::numeric * v_rate * 100)::bigint;
  IF (v_kobo::numeric / 100) < v_min_naira THEN
    RAISE EXCEPTION 'That is below the minimum withdrawal.';
  END IF;
  IF v_max_naira IS NOT NULL AND (v_kobo::numeric / 100) > v_max_naira THEN
    RAISE EXCEPTION 'That exceeds the maximum withdrawal.';
  END IF;
  SELECT bank_name, account_name, account_number INTO v_bank_name, v_account_name, v_account_number
  FROM public.user_bank_details WHERE user_id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Save your bank details first.';
  END IF;
  INSERT INTO public.points_wallets (user_id, balance_points, lifetime_earned_points)
  VALUES (v_caller, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_points INTO v_balance FROM public.points_wallets WHERE user_id = v_caller FOR UPDATE;
  IF v_balance < p_points THEN
    RAISE EXCEPTION 'Insufficient points balance.';
  END IF;
  IF v_daily_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(naira_amount_kobo), 0) INTO v_used_today FROM public.withdrawal_requests
    WHERE user_id = v_caller AND status NOT IN ('rejected', 'cancelled') AND created_at >= date_trunc('day', now());
    IF ((v_used_today + v_kobo)::numeric / 100) > v_daily_cap THEN
      RAISE EXCEPTION 'That exceeds the daily withdrawal limit.';
    END IF;
  END IF;
  IF v_monthly_cap IS NOT NULL THEN
    SELECT COALESCE(SUM(naira_amount_kobo), 0) INTO v_used_month FROM public.withdrawal_requests
    WHERE user_id = v_caller AND status NOT IN ('rejected', 'cancelled') AND created_at >= date_trunc('month', now());
    IF ((v_used_month + v_kobo)::numeric / 100) > v_monthly_cap THEN
      RAISE EXCEPTION 'That exceeds the monthly withdrawal limit.';
    END IF;
  END IF;
  INSERT INTO public.withdrawal_requests (user_id, idempotency_key, points, naira_per_point, naira_amount_kobo, bank_name, account_name, account_number, account_last4)
  VALUES (v_caller, p_idempotency_key, p_points, v_rate, v_kobo, v_bank_name, v_account_name, v_account_number, right(v_account_number, 4))
  RETURNING id INTO v_request_id;
  INSERT INTO public.points_ledger (user_id, type, points, balance_after, ref_type, ref_id, description, naira_per_point, naira_amount_kobo, actor_id)
  VALUES (v_caller, 'withdraw_reserve', -p_points, v_balance - p_points, 'withdrawal_requests', v_request_id::text, 'Withdrawal reservation', v_rate, v_kobo, v_caller);
  UPDATE public.points_wallets SET balance_points = v_balance - p_points, updated_at = now() WHERE user_id = v_caller;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_caller, 'withdrawal_submitted', 'Withdrawal requested',
    'Your withdrawal request is pending review.', '/app/rewards');
  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_withdrawal(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(bigint, text) TO service_role;

-- ── 9. Owner cancellation (restores through a reversal) ─────────────────────

CREATE OR REPLACE FUNCTION public.cancel_withdrawal_request(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_points bigint;
  v_rate numeric;
  v_kobo bigint;
  v_balance bigint;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to cancel a withdrawal.';
  END IF;
  SELECT user_id, status, points, naira_per_point, naira_amount_kobo
  INTO v_owner, v_status, v_points, v_rate, v_kobo
  FROM public.withdrawal_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found.';
  END IF;
  IF v_owner <> v_caller THEN
    RAISE EXCEPTION 'That withdrawal belongs to another account.';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending withdrawals can be cancelled.';
  END IF;
  SELECT balance_points INTO v_balance FROM public.points_wallets WHERE user_id = v_caller FOR UPDATE;
  UPDATE public.withdrawal_requests
  SET status = 'cancelled', status_reason = 'Cancelled by you.', updated_at = now()
  WHERE id = p_request_id;
  INSERT INTO public.points_ledger (user_id, type, points, balance_after, ref_type, ref_id, description, naira_per_point, naira_amount_kobo, actor_id)
  VALUES (v_caller, 'cancel_reversal', v_points, v_balance + v_points, 'withdrawal_requests', p_request_id::text, 'Cancelled withdrawal restored', v_rate, v_kobo, v_caller);
  UPDATE public.points_wallets SET balance_points = v_balance + v_points, updated_at = now() WHERE user_id = v_caller;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_caller, 'withdrawal_cancelled', 'Withdrawal cancelled',
    'Your withdrawal was cancelled and the points returned to your wallet.', '/app/rewards');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_withdrawal_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal_request(uuid) TO service_role;

-- ── 10. Admin transitions (locked, audited, amount-matched) ─────────────────

-- Moves one withdrawal along pending -> processing -> paid, with rejected
-- and cancelled as exits. Row lock + status gate make concurrent moves safe.
-- Rejections and cancellations restore points through reversal entries.
-- Paid demands the matching amount plus the bank reference, so a withdrawal
-- can never be marked paid twice or for the wrong sum.
CREATE OR REPLACE FUNCTION public.transition_withdrawal(
  p_request_id uuid,
  p_to_status text,
  p_reason text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_paid_amount_kobo bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_role text;
  v_owner uuid;
  v_from text;
  v_points bigint;
  v_rate numeric;
  v_kobo bigint;
  v_balance bigint;
  v_allowed boolean := false;
  v_note text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in is required to move withdrawals.';
  END IF;
  SELECT role INTO v_caller_role FROM public.admin_roles WHERE user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin') THEN
    RAISE EXCEPTION 'Only a super_admin or finance_admin may move withdrawals.';
  END IF;
  SELECT user_id, status, points, naira_per_point, naira_amount_kobo
  INTO v_owner, v_from, v_points, v_rate, v_kobo
  FROM public.withdrawal_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found.';
  END IF;
  IF v_from IN ('paid', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Paid, rejected, and cancelled withdrawals are terminal and cannot move.';
  END IF;
  v_allowed :=
    (v_from = 'pending' AND p_to_status IN ('processing', 'rejected', 'cancelled'))
    OR (v_from = 'processing' AND p_to_status IN ('paid', 'rejected', 'cancelled'));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'That withdrawal transition is not allowed.';
  END IF;
  v_note := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF p_to_status = 'paid' THEN
    IF p_reference IS NULL OR btrim(p_reference) = '' THEN
      RAISE EXCEPTION 'Record the bank transfer reference before marking paid.';
    END IF;
    IF p_paid_amount_kobo IS NULL OR p_paid_amount_kobo <> v_kobo THEN
      RAISE EXCEPTION 'The recorded amount must match the approved withdrawal amount.';
    END IF;
  END IF;
  IF p_to_status IN ('rejected', 'cancelled') AND v_note IS NULL THEN
    RAISE EXCEPTION 'Record why the withdrawal was not paid.';
  END IF;
  UPDATE public.withdrawal_requests
  SET status = p_to_status,
      status_reason = CASE WHEN p_to_status IN ('rejected', 'cancelled') THEN v_note ELSE status_reason END,
      paid_amount_kobo = CASE WHEN p_to_status = 'paid' THEN p_paid_amount_kobo ELSE paid_amount_kobo END,
      paid_reference = CASE WHEN p_to_status = 'paid' THEN btrim(p_reference) ELSE paid_reference END,
      paid_by = CASE WHEN p_to_status = 'paid' THEN v_caller ELSE paid_by END,
      paid_at = CASE WHEN p_to_status = 'paid' THEN now() ELSE paid_at END,
      updated_at = now()
  WHERE id = p_request_id;
  IF p_to_status IN ('rejected', 'cancelled') THEN
    SELECT balance_points INTO v_balance FROM public.points_wallets WHERE user_id = v_owner FOR UPDATE;
    INSERT INTO public.points_ledger (user_id, type, points, balance_after, ref_type, ref_id, description, naira_per_point, naira_amount_kobo, actor_id)
    VALUES (v_owner, 'withdraw_reversal', v_points, v_balance + v_points, 'withdrawal_requests', p_request_id::text, 'Rejected withdrawal restored', v_rate, v_kobo, v_caller);
    UPDATE public.points_wallets SET balance_points = v_balance + v_points, updated_at = now() WHERE user_id = v_owner;
  END IF;
  IF p_to_status = 'paid' THEN
    INSERT INTO public.points_ledger (user_id, type, points, balance_after, ref_type, ref_id, description, naira_per_point, naira_amount_kobo, actor_id)
    SELECT v_owner, 'withdraw_complete', 0, balance_points, 'withdrawal_requests', p_request_id::text, 'Withdrawal paid out', v_rate, v_kobo, v_caller
    FROM public.points_wallets WHERE user_id = v_owner;
  END IF;
  INSERT INTO public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_caller, 'admin.withdrawal.transition', 'withdrawal_requests', p_request_id::text,
    jsonb_build_object('from', v_from, 'to', p_to_status));
  IF p_to_status = 'processing' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_owner, 'withdrawal_processing', 'Withdrawal processing',
      'Staff started processing your withdrawal request.', '/app/rewards');
  ELSIF p_to_status = 'paid' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_owner, 'withdrawal_paid', 'Withdrawal paid',
      'Your withdrawal of ₦' || trim(to_char((v_kobo::numeric / 100), 'FM999,999,990.00')) || ' has been processed and marked as paid. The funds have been transferred to your registered bank account.', '/app/rewards');
  ELSIF p_to_status = 'rejected' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_owner, 'withdrawal_rejected', 'Withdrawal rejected',
      'Your withdrawal request was rejected: ' || COALESCE(v_note, 'no reason given') || ' The points returned to your wallet.', '/app/rewards');
  ELSIF p_to_status = 'cancelled' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_owner, 'withdrawal_cancelled', 'Withdrawal cancelled',
      'Your withdrawal request was cancelled and the points returned to your wallet.', '/app/rewards');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_withdrawal(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_withdrawal(uuid, text, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_withdrawal(uuid, text, text, text, bigint) TO service_role;

-- ── 11. Verification ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.reward_settings') IS NULL THEN
    RAISE EXCEPTION 'Points rewards V1 did not create reward_settings.';
  END IF;
  IF to_regclass('public.points_wallets') IS NULL THEN
    RAISE EXCEPTION 'Points rewards V1 did not create points_wallets.';
  END IF;
  IF to_regclass('public.points_ledger') IS NULL THEN
    RAISE EXCEPTION 'Points rewards V1 did not create points_ledger.';
  END IF;
  IF to_regclass('public.user_bank_details') IS NULL THEN
    RAISE EXCEPTION 'Points rewards V1 did not create user_bank_details.';
  END IF;
  IF to_regclass('public.withdrawal_requests') IS NULL THEN
    RAISE EXCEPTION 'Points rewards V1 did not create withdrawal_requests.';
  END IF;
  IF (SELECT count(*) FROM public.reward_settings WHERE key = 'naira_per_point' AND value::text = '10') < 1 THEN
    RAISE EXCEPTION 'Points rewards V1 did not seed the opening conversion rate.';
  END IF;
  IF (SELECT count(*) FROM public.reward_settings WHERE key = 'min_withdrawal_naira' AND value::text = '3000') < 1 THEN
    RAISE EXCEPTION 'Points rewards V1 did not seed the opening minimum.';
  END IF;
END;
$$;

COMMIT;
