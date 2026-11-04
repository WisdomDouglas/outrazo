// Rewards wallet server functions (Points V1). Every function below first
// passes through requireSupabaseAuth (proves WHO is calling). Reads use the
// caller's own RLS-scoped client; every points mutation goes through a
// gated RPC on that same client so auth.uid() attributes the ledger row.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface RewardsDb {
  public: {
    Tables: {
      reward_settings: {
        Row: { key: string; value: unknown; updated_by: string | null; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      points_wallets: {
        Row: { user_id: string; balance_points: number; lifetime_earned_points: number; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      points_ledger: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          points: number;
          balance_after: number;
          ref_type: string | null;
          ref_id: string | null;
          description: string;
          naira_per_point: number | string | null;
          naira_amount_kobo: number | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_bank_details: {
        Row: {
          user_id: string;
          bank_name: string;
          account_number: string;
          account_name: string;
          verified: boolean;
          updated_at: string;
        };
        Insert: { user_id: string; bank_name: string; account_number: string; account_name: string };
        Update: { bank_name?: string; account_number?: string; account_name?: string; updated_at?: string };
        Relationships: [];
      };
      withdrawal_requests: {
        Row: {
          id: string;
          user_id: string;
          idempotency_key: string;
          points: number;
          naira_per_point: number | string;
          naira_amount_kobo: number;
          bank_name: string;
          account_name: string;
          account_last4: string;
          status: string;
          status_reason: string | null;
          paid_amount_kobo: number | null;
          paid_reference: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      request_withdrawal: {
        Args: { p_points: number; p_idempotency_key: string };
        Returns: string;
      };
      cancel_withdrawal_request: {
        Args: { p_request_id: string };
        Returns: null;
      };
    };
  };
}

type RewardsClient = SupabaseClient<RewardsDb>;

function asRewardsDb(client: SupabaseClient): RewardsClient {
  return client as unknown as RewardsClient;
}

export class RewardsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewardsError";
  }
}

function authedContext(context: unknown): { supabase: SupabaseClient; userId: string } {
  const ctx = context as { supabase?: SupabaseClient; userId?: unknown };
  if (!ctx.supabase || typeof ctx.userId !== "string" || ctx.userId.length === 0) {
    throw new RewardsError("Sign in is required.");
  }
  return { supabase: ctx.supabase, userId: ctx.userId };
}

function passRewardsError(caught: unknown): never {
  if (caught instanceof RewardsError) throw caught;
  console.error("[rewards] unexpected failure", caught);
  throw new RewardsError("Something went wrong. Please try again.");
}

export interface WalletSettings {
  nairaPerPoint: number;
  minWithdrawalNaira: number;
  maxWithdrawalNaira: number | null;
  rewardsEnabled: boolean;
  withdrawalsEnabled: boolean;
}

function settingsFromRows(rows: { key: string; value: unknown }[]): WalletSettings {
  const get = (key: string): unknown => rows.find((row) => row.key === key)?.value;
  const num = (value: unknown, fallback: number): number => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const optNum = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  return {
    nairaPerPoint: num(get("naira_per_point"), 10),
    minWithdrawalNaira: num(get("min_withdrawal_naira"), 3000),
    maxWithdrawalNaira: optNum(get("max_withdrawal_naira")),
    rewardsEnabled: get("rewards_enabled") !== false,
    withdrawalsEnabled: get("withdrawals_enabled") !== false,
  };
}

export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{
    balancePoints: number;
    lifetimeEarned: number;
    redeemedPoints: number;
    hasBankDetails: boolean;
    settings: WalletSettings;
  }> => {
    const { supabase, userId } = authedContext(context);
    try {
      const db = asRewardsDb(supabase);
      const [{ data: settings }, { data: wallet }, { data: bank }, { data: completed }] =
        await Promise.all([
          db.from("reward_settings").select("key, value"),
          db.from("points_wallets").select("balance_points, lifetime_earned_points").eq("user_id", userId).maybeSingle(),
          db.from("user_bank_details").select("user_id").eq("user_id", userId).maybeSingle(),
          db.from("withdrawal_requests").select("points").eq("user_id", userId).eq("status", "paid").limit(5000),
        ]);
      const redeemedPoints = (completed ?? []).reduce((sum, row) => sum + row.points, 0);
      return {
        balancePoints: wallet?.balance_points ?? 0,
        lifetimeEarned: wallet?.lifetime_earned_points ?? 0,
        redeemedPoints,
        hasBankDetails: Boolean(bank),
        settings: settingsFromRows((settings ?? []) as { key: string; value: unknown }[]),
      };
    } catch (caught) {
      passRewardsError(caught);
    }
  });

export interface LedgerEntry {
  id: string;
  type: string;
  points: number;
  balanceAfter: number;
  description: string;
  nairaAmountKobo: number | null;
  createdAt: string;
}

export const listMyLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ limit: z.number().int().min(1).max(100).default(30), offset: z.number().int().min(0).default(0) }))
  .handler(async ({ data, context }): Promise<{ entries: LedgerEntry[] }> => {
    const { supabase, userId } = authedContext(context);
    try {
      const { data: rows, error } = await asRewardsDb(supabase)
        .from("points_ledger")
        .select("id, type, points, balance_after, description, naira_amount_kobo, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(data.offset, data.offset + data.limit - 1);
      if (error) {
        console.error("[rewards] ledger failed", error);
        throw new RewardsError("Could not load your transactions. Please try again.");
      }
      return {
        entries: (rows ?? []).map((row) => ({
          id: row.id,
          type: row.type,
          points: row.points,
          balanceAfter: row.balance_after,
          description: row.description,
          nairaAmountKobo: row.naira_amount_kobo,
          createdAt: row.created_at,
        })),
      };
    } catch (caught) {
      passRewardsError(caught);
    }
  });

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
  verified: boolean;
  updatedAt: string;
}

export const getMyBankDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ details: BankDetails | null }> => {
    const { supabase, userId } = authedContext(context);
    try {
      const { data, error } = await asRewardsDb(supabase)
        .from("user_bank_details")
        .select("bank_name, account_number, account_name, verified, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("[rewards] bank read failed", error);
        throw new RewardsError("Could not load your bank details. Please try again.");
      }
      return {
        details: data
          ? {
              bankName: data.bank_name,
              accountNumber: data.account_number,
              accountName: data.account_name,
              verified: data.verified,
              updatedAt: data.updated_at,
            }
          : null,
      };
    } catch (caught) {
      passRewardsError(caught);
    }
  });

const bankSchema = z.object({
  bankName: z.string().trim().min(2).max(80),
  accountNumber: z.string().trim().regex(/^[0-9]{10}$/),
  accountName: z.string().trim().min(2).max(100),
});

export const saveMyBankDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(bankSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = authedContext(context);
    try {
      const { error } = await asRewardsDb(supabase).from("user_bank_details").upsert(
        {
          user_id: userId,
          bank_name: data.bankName,
          account_number: data.accountNumber,
          account_name: data.accountName,
        },
        { onConflict: "user_id" },
      );
      if (error) {
        console.error("[rewards] bank save failed", error);
        throw new RewardsError("Could not save your bank details. Please try again.");
      }
      return { ok: true };
    } catch (caught) {
      passRewardsError(caught);
    }
  });

export interface WithdrawalRow {
  id: string;
  points: number;
  nairaAmountKobo: number;
  bankName: string;
  accountName: string;
  accountLast4: string;
  status: string;
  statusReason: string | null;
  paidReference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ limit: z.number().int().min(1).max(100).default(30) }))
  .handler(async ({ data, context }): Promise<{ withdrawals: WithdrawalRow[] }> => {
    const { supabase, userId } = authedContext(context);
    try {
      const { data: rows, error } = await asRewardsDb(supabase)
        .from("withdrawal_requests")
        .select("id, points, naira_amount_kobo, bank_name, account_name, account_last4, status, status_reason, paid_reference, paid_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (error) {
        console.error("[rewards] withdrawals failed", error);
        throw new RewardsError("Could not load your withdrawals. Please try again.");
      }
      return {
        withdrawals: (rows ?? []).map((row) => ({
          id: row.id,
          points: row.points,
          nairaAmountKobo: row.naira_amount_kobo,
          bankName: row.bank_name,
          accountName: row.account_name,
          accountLast4: row.account_last4,
          status: row.status,
          statusReason: row.status_reason,
          paidReference: row.paid_reference,
          paidAt: row.paid_at,
          createdAt: row.created_at,
        })),
      };
    } catch (caught) {
      passRewardsError(caught);
    }
  });

export const requestMyWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ points: z.number().int().min(1), idempotencyKey: z.string().min(8).max(64) }))
  .handler(async ({ data, context }): Promise<{ ok: true; requestId: string }> => {
    const { supabase } = authedContext(context);
    try {
      const { data: requestId, error } = await asRewardsDb(supabase).rpc("request_withdrawal", {
        p_points: data.points,
        p_idempotency_key: data.idempotencyKey,
      });
      if (error || !requestId) {
        if (error) {
          for (const known of [
            "below the minimum",
            "exceeds the maximum",
            "Insufficient points",
            "Save your bank details",
            "daily withdrawal limit",
            "monthly withdrawal limit",
            "Withdrawals are currently disabled",
          ]) {
            if (error.message.includes(known)) throw new RewardsError(friendlyWithdrawalError(error.message));
          }
          console.error("[rewards] withdrawal request failed", error);
        }
        throw new RewardsError("Could not submit your withdrawal. Please try again.");
      }
      return { ok: true, requestId };
    } catch (caught) {
      passRewardsError(caught);
    }
  });

function friendlyWithdrawalError(message: string): string {
  if (message.includes("below the minimum")) return "That is below the minimum withdrawal.";
  if (message.includes("exceeds the maximum")) return "That exceeds the maximum withdrawal.";
  if (message.includes("Insufficient points")) return "That exceeds your available balance.";
  if (message.includes("Save your bank details")) return "Save your bank details in Settings first.";
  if (message.includes("daily withdrawal limit")) return "That exceeds the daily withdrawal limit.";
  if (message.includes("monthly withdrawal limit")) return "That exceeds the monthly withdrawal limit.";
  if (message.includes("currently disabled")) return "Withdrawals are currently disabled.";
  return "Could not submit your withdrawal. Please try again.";
}

export const cancelMyWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = authedContext(context);
    try {
      const { error } = await asRewardsDb(supabase).rpc("cancel_withdrawal_request", {
        p_request_id: data.requestId,
      });
      if (error) {
        if (error.message.includes("Only pending")) {
          throw new RewardsError("Only pending withdrawals can be cancelled.");
        }
        if (error.message.includes("another account") || error.message.includes("not found")) {
          throw new RewardsError("That withdrawal was not found.");
        }
        console.error("[rewards] withdrawal cancel failed", error);
        throw new RewardsError("Could not cancel that withdrawal. Please try again.");
      }
      return { ok: true };
    } catch (caught) {
      passRewardsError(caught);
    }
  });
