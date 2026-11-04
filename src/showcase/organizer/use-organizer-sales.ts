// Organizer sales + buyers state (P2). All figures come from the
// ownership-checked server functions; the browser only renders them.
import { useCallback, useEffect, useState } from "react";

import { useAccessToken } from "@/showcase/admin/admin-client";
import {
  getOrganizerSalesSnapshot,
  listEventBuyers,
  listEventSales,
  type EventBuyerRow,
  type OrganizerOrderRow,
  type SalesSnapshot,
} from "./organizer-reports";

export function friendlySalesError(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  return "Something went wrong. Please try again.";
}

export interface SalesSnapshotState {
  snapshot: (SalesSnapshot & { eventTitles: Record<string, string> }) | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useOrganizerSalesSnapshot(): SalesSnapshotState {
  const token = useAccessToken();
  const [snapshot, setSnapshot] = useState<(SalesSnapshot & { eventTitles: Record<string, string> }) | null>(null);
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
    getOrganizerSalesSnapshot({ headers: { Authorization: `Bearer ${token}` } }).then(
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

export interface EventSalesState {
  eventTitle: string;
  orders: OrganizerOrderRow[];
  totals: { paidOrders: number; pendingOrders: number; ticketsSold: number; grossKobo: number };
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEventSales(eventId: string | null): EventSalesState {
  const token = useAccessToken();
  const [state, setState] = useState<{
    eventTitle: string;
    orders: OrganizerOrderRow[];
    totals: EventSalesState["totals"];
  }>({ eventTitle: "", orders: [], totals: { paidOrders: 0, pendingOrders: 0, ticketsSold: 0, grossKobo: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  const refresh = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    if (!token || !eventId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listEventSales({
      data: { eventId },
      headers: { Authorization: `Bearer ${token}` },
    }).then(
      (result) => {
        if (!active) return;
        setState({ eventTitle: result.eventTitle, orders: result.orders, totals: result.totals });
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
  }, [eventId, request, token]);

  return { ...state, loading, error, refresh };
}

export interface EventBuyersState {
  buyers: EventBuyerRow[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useEventBuyers(eventId: string | null): EventBuyersState {
  const token = useAccessToken();
  const [buyers, setBuyers] = useState<EventBuyerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  const refresh = useCallback(() => setRequest((n) => n + 1), []);

  useEffect(() => {
    if (!token || !eventId) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listEventBuyers({
      data: { eventId },
      headers: { Authorization: `Bearer ${token}` },
    }).then(
      (result) => {
        if (!active) return;
        setBuyers(result.buyers);
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
  }, [eventId, request, token]);

  return { buyers, loading, error, refresh };
}
