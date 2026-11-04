// Points rewards migration safeguard tests (proposal).
//
// Scope, stated honestly: these tests read the PROPOSAL migration FILE and
// assert its safeguards are present. They cannot execute SQL and do NOT
// prove live database behavior — that proof requires review, applying the
// migration, and exercising wallet/withdrawal drills against a real database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MIGRATION_PATH = new URL(
  "../supabase/migrations/20261115090000_points_rewards_v1.sql",
  import.meta.url,
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

function functionBody(name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `expected function ${name} in the migration`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `expected end of function ${name} in the migration`);
  return sql.slice(start, end);
}

const settingBody = functionBody("set_reward_setting");
const creditBody = functionBody("credit_points");
const requestBody = functionBody("request_withdrawal");
const cancelBody = functionBody("cancel_withdrawal_request");
const transitionBody = functionBody("transition_withdrawal");

describe("points rewards proposal boundaries", () => {
  it("is marked proposed-pending-review and refuses double application", () => {
    assert.match(sql, /STATUS: PROPOSED — PENDING REVIEW\. NOT APPLIED/);
    assert.match(sql, /reward_settings already exists; do not apply Points rewards V1 twice/);
    assert.match(sql, /points_wallets already exists; do not apply Points rewards V1 twice/);
    assert.match(sql, /points_ledger already exists; do not apply Points rewards V1 twice/);
    assert.match(sql, /user_bank_details already exists; do not apply Points rewards V1 twice/);
    assert.match(sql, /withdrawal_requests already exists; do not apply Points rewards V1 twice/);
  });

  it("seeds the approved opening values with audited, gated writes", () => {
    assert.match(sql, /CREATE TABLE public\.reward_settings/);
    assert.match(sql, /\('naira_per_point', '10'\)/);
    assert.match(sql, /\('min_withdrawal_naira', '3000'\)/);
    assert.match(sql, /REVOKE ALL ON public\.reward_settings FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT SELECT ON public\.reward_settings TO authenticated/);
    assert.match(settingBody, /Only a super_admin or finance_admin may manage rewards settings/);
    assert.match(settingBody, /'admin\.rewards\.set_setting'/);
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.set_reward_setting\(text, jsonb\) FROM PUBLIC, anon/,
    );
  });

  it("keeps wallets non-negative with owner-only reads", () => {
    assert.match(sql, /CREATE TABLE public\.points_wallets/);
    assert.match(sql, /balance_points bigint NOT NULL DEFAULT 0 CHECK \(balance_points >= 0\)/);
    assert.match(sql, /CREATE POLICY "Users read own wallet"/);
    assert.match(sql, /GRANT SELECT ON public\.points_wallets TO authenticated/);
  });

  it("keeps the ledger append-only with running balances", () => {
    assert.match(sql, /CREATE TABLE public\.points_ledger/);
    assert.match(sql, /balance_after bigint NOT NULL CHECK \(balance_after >= 0\)/);
    assert.match(sql, /CREATE POLICY "Users read own ledger"/);
    assert.match(sql, /REVOKE ALL ON public\.points_ledger FROM PUBLIC, anon, authenticated/);
    assert.match(creditBody, /FOR UPDATE/);
    assert.match(creditBody, /That adjustment exceeds the available balance/);
    assert.match(creditBody, /'admin\.rewards\.credit'/);
  });

  it("keeps bank details owner-only", () => {
    assert.match(sql, /CREATE TABLE public\.user_bank_details/);
    assert.match(sql, /account_number ~ '\^?\[0-9\]\{10\}\$?'/);
    assert.match(sql, /CREATE POLICY "Owners manage own bank details"/);
    assert.match(sql, /REVOKE ALL ON public\.user_bank_details FROM PUBLIC, anon/);
  });

  it("hides full account numbers from owners and dedupes by idempotency key", () => {
    assert.match(sql, /CREATE TABLE public\.withdrawal_requests/);
    assert.match(sql, /UNIQUE \(user_id, idempotency_key\)/);
    assert.match(sql, /GRANT SELECT \(id, user_id, idempotency_key, points/);
    assert.ok(
      !sql.match(/GRANT SELECT \([^\n]*account_number[^\n]*\) ON public\.withdrawal_requests/),
      "owner column grant must exclude the full account number",
    );
  });

  it("reserves atomically under a wallet lock with all gates", () => {
    assert.match(requestBody, /FOR UPDATE/);
    assert.match(requestBody, /Withdrawals are currently disabled/);
    assert.match(requestBody, /That is below the minimum withdrawal/);
    assert.match(requestBody, /Save your bank details first/);
    assert.match(requestBody, /Insufficient points balance/);
    assert.match(requestBody, /daily withdrawal limit/);
    assert.match(requestBody, /monthly withdrawal limit/);
    assert.match(requestBody, /'withdraw_reserve'/);
    assert.match(requestBody, /'withdrawal_submitted'/);
  });

  it("restores points on owner cancellation with a reversal entry", () => {
    assert.match(cancelBody, /Only pending withdrawals can be cancelled/);
    assert.match(cancelBody, /That withdrawal belongs to another account/);
    assert.match(cancelBody, /'cancel_reversal'/);
    assert.match(cancelBody, /'withdrawal_cancelled'/);
  });

  it("enforces the admin workflow with locked transitions and amount match", () => {
    assert.match(transitionBody, /FOR UPDATE/);
    assert.match(transitionBody, /terminal and cannot move/);
    assert.match(transitionBody, /That withdrawal transition is not allowed/);
    assert.match(transitionBody, /Record the bank transfer reference before marking paid/);
    assert.match(transitionBody, /must match the approved withdrawal amount/);
    assert.match(transitionBody, /'withdraw_reversal'/);
    assert.match(transitionBody, /'admin\.withdrawal\.transition'/);
    assert.match(transitionBody, /'withdrawal_paid'/);
    assert.match(transitionBody, /'withdrawal_rejected'/);
  });

  it("extends the inbox types without dropping the old ones", () => {
    assert.match(sql, /notifications_type_check CHECK \(type IN/);
    assert.match(sql, /'withdrawal_submitted', 'withdrawal_processing', 'withdrawal_paid'/);
    assert.match(sql, /'withdrawal_rejected', 'withdrawal_cancelled'/);
    assert.match(sql, /'rsvp_confirmed', 'rsvp_cancelled', 'order_paid', 'event_cancelled'/);
  });

  it("verifies its own objects before committing", () => {
    assert.match(sql, /did not create reward_settings/);
    assert.match(sql, /did not create points_wallets/);
    assert.match(sql, /did not create points_ledger/);
    assert.match(sql, /did not create user_bank_details/);
    assert.match(sql, /did not create withdrawal_requests/);
    assert.match(sql, /did not seed the opening conversion rate/);
    assert.match(sql, /did not seed the opening minimum/);
  });
});
