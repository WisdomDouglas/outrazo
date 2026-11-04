// Client-side rewards state (Points V1). Thin loaders over the RLS-scoped
// server functions; every money decision happens server-side.
import { useCallback, useEffect, useState } from "react";

import { useAccessToken } from "@/showcase/admin/admin-client";
import { useAuth } from "@/showcase/auth/auth-context";
import {
  cancelMyWithdrawal,
  getMyBankDetails,
  getMyWallet,
  listMyLedger,
  listMyWithdrawals,
  requestMyWithdrawal,
  saveMyBankDetails,
  type BankDetails,
  type LedgerEntry,
  type WalletSettings,
  type WithdrawalRow,
} from "./rewards-functions";

function friendlyError(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  return "Something went wrong. Please try again.";
}

export interface WalletState {
  balancePoints: number;
  lifetimeEarned: number;
  redeemedPoints: number;
  hasBankDetails: boolean;
  settings: WalletSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMyWallet(): WalletState {
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token ?? null;
  const [snapshot, setSnapshot] = useState<{
    balancePoints: number;
    lifetimeEarned: number;
    redeemedPoints: number;
    hasBankDetails: boolean;
    settings: WalletSettings;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  const refresh = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    getMyWallet({ headers: { Authorization: `Bearer ${token}` } }).then(
      (result) => {
        if (!active) return;
        setSnapshot(result);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlyError(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [authLoading, request, token]);

  return {
    balancePoints: snapshot?.balancePoints ?? 0,
    lifetimeEarned: snapshot?.lifetimeEarned ?? 0,
    redeemedPoints: snapshot?.redeemedPoints ?? 0,
    hasBankDetails: snapshot?.hasBankDetails ?? false,
    settings: snapshot?.settings ?? null,
    loading: authLoading || loading,
    error,
    refresh,
  };
}

export function useMyLedger(limit = 30) {
  const token = useAccessToken();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);
  const refresh = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    if (!token) {
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listMyLedger({ data: { limit, offset: 0 }, headers: { Authorization: `Bearer ${token}` } }).then(
      (result) => {
        if (!active) return;
        setEntries(result.entries);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlyError(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [limit, request, token]);

  return { entries, loading, error, refresh };
}

export function useMyWithdrawals() {
  const token = useAccessToken();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);
  const refresh = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    if (!token) {
      setWithdrawals([]);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listMyWithdrawals({ data: { limit: 30 }, headers: { Authorization: `Bearer ${token}` } }).then(
      (result) => {
        if (!active) return;
        setWithdrawals(result.withdrawals);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlyError(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [request, token]);

  return { withdrawals, loading, error, refresh };
}

export function useMyBankDetails() {
  const token = useAccessToken();
  const [details, setDetails] = useState<BankDetails | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [request, setRequest] = useState(0);
  const refresh = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    if (!token) {
      setDetails(null);
      setError(null);
      setLoading(false);
      setLoaded(true);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    getMyBankDetails({ headers: { Authorization: `Bearer ${token}` } }).then(
      (result) => {
        if (!active) return;
        setDetails(result.details);
        setLoading(false);
        setLoaded(true);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlyError(caught));
        setLoading(false);
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, [request, token]);

  const save = useCallback(
    async (input: { bankName: string; accountNumber: string; accountName: string }) => {
      if (!token) throw new Error("Sign in is required.");
      setSaving(true);
      try {
        await saveMyBankDetails({ data: input, headers: { Authorization: `Bearer ${token}` } });
        setRequest((n) => n + 1);
      } finally {
        setSaving(false);
      }
    },
    [token],
  );

  return { details, loaded, loading, error, saving, save, refresh };
}

export function useWithdrawalActions(onDone: () => void) {
  const token = useAccessToken();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (points: number) => {
      if (!token || busy) return;
      setBusy(true);
      setError(null);
      try {
        const key =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await requestMyWithdrawal({
          data: { points, idempotencyKey: key },
          headers: { Authorization: `Bearer ${token}` },
        });
        onDone();
      } catch (caught) {
        setError(friendlyError(caught));
      } finally {
        setBusy(false);
      }
    },
    [busy, onDone, token],
  );

  const cancel = useCallback(
    async (requestId: string) => {
      if (!token || busy) return;
      setBusy(true);
      setError(null);
      try {
        await cancelMyWithdrawal({
          data: { requestId },
          headers: { Authorization: `Bearer ${token}` },
        });
        onDone();
      } catch (caught) {
        setError(friendlyError(caught));
      } finally {
        setBusy(false);
      }
    },
    [busy, onDone, token],
  );

  return { busy, error, submit, cancel, clearError: () => setError(null) };
}
