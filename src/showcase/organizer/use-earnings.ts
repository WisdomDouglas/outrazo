// Organizer earnings + payouts state (P5). All figures come from the
// ownership-checked server functions; the browser only renders them.
import { useCallback, useEffect, useState } from "react";

import { useAccessToken } from "@/showcase/admin/admin-client";
import {
  getEarningsSummary,
  listMyPayouts,
  type OrganizerEarningsSnapshot,
  type OrganizerPayoutRow,
} from "./organizer-reports";
import { friendlySalesError } from "./use-organizer-sales";

export interface EarningsState {
  snapshot: OrganizerEarningsSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEarningsSummary(): EarningsState {
  const token = useAccessToken();
  const [snapshot, setSnapshot] = useState<OrganizerEarningsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  const refresh = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    if (!token) {
      setSnapshot(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    getEarningsSummary({ headers: { Authorization: `Bearer ${token}` } }).then(
      (result) => {
        if (!active) return;
        setSnapshot(result);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlySalesError(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [request, token]);

  return { snapshot, loading, error, refresh };
}

export interface MyPayoutsState {
  payouts: OrganizerPayoutRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMyPayouts(): MyPayoutsState {
  const token = useAccessToken();
  const [payouts, setPayouts] = useState<OrganizerPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  const refresh = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    if (!token) {
      setPayouts([]);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listMyPayouts({ headers: { Authorization: `Bearer ${token}` } }).then(
      (result) => {
        if (!active) return;
        setPayouts(result.payouts);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlySalesError(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [request, token]);

  return { payouts, loading, error, refresh };
}
