// Ticket order list + status state (P1). Powers My Tickets and the Bachs
// return pages. Status always comes from the server: return-URL query
// parameters only name WHICH order to look up.
import { useCallback, useEffect, useRef, useState } from "react";

import { useAccessToken } from "@/showcase/admin/admin-client";
import {
  cancelMyTicketOrder,
  getTicketOrderStatus,
  listMyTicketOrders,
  refreshTicketOrder,
  startTicketCheckout,
  type TicketOrderSummary,
} from "./ticket-functions";
import type { TicketLineInput } from "./ticket-orders";

const STATUS_POLL_MS = 3000;
const STATUS_POLLS_MAX = 20;

/** Core errors carry curated safe messages — pass them through untouched. */
export function friendlyTicketError(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  return "Something went wrong. Please try again.";
}

export interface MyTicketOrdersState {
  orders: TicketOrderSummary[];
  loading: boolean;
  error: string | null;
  notice: string | null;
  busyId: string | null;
  syncing: boolean;
  actionError: string | null;
  refresh: () => void;
  checkOrder: (orderId: string) => Promise<void>;
  resumeOrder: (order: TicketOrderSummary) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  dismissNotice: () => void;
}

export function useMyTicketOrders(): MyTicketOrdersState {
  const token = useAccessToken();
  const [orders, setOrders] = useState<TicketOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);
  const verifiedRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => setRequest((n) => n + 1), []);
  const dismissNotice = useCallback(() => {
    setNotice(null);
    setActionError(null);
  }, []);

  useEffect(() => {
    if (!token) {
      setOrders([]);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listMyTicketOrders({
      data: { limit: 50 },
      headers: { Authorization: `Bearer ${token}` },
    }).then(
      (result) => {
        if (!active) return;
        setOrders(result.orders);
        setLoading(false);
        // Heal "paid but still shows pending": re-verify each pending order
        // once against live provider truth (e.g. the buyer returned before
        // the webhook landed). Failures keep the stored row; the buyer can
        // retry with Check status.
        const stale = result.orders.filter(
          (order) => order.status === "pending" && !verifiedRef.current.has(order.orderId),
        );
        if (stale.length === 0) return;
        setSyncing(true);
        const headers = { Authorization: `Bearer ${token}` };
        void (async () => {
          const updates = new Map<string, TicketOrderSummary>();
          for (const staleOrder of stale) {
            verifiedRef.current.add(staleOrder.orderId);
            try {
              const refreshed = await refreshTicketOrder({
                data: { orderId: staleOrder.orderId },
                headers,
              });
              updates.set(staleOrder.orderId, refreshed.order);
            } catch {
              // Keep the stored row.
            }
          }
          if (!active) return;
          if (updates.size > 0) {
            setOrders((current) =>
              current.map((order) => updates.get(order.orderId) ?? order),
            );
            const settled = [...updates.values()].filter((order) => order.status === "paid").length;
            if (settled > 0) {
              setNotice(
                `Payment confirmed — ${settled} ${settled === 1 ? "order" : "orders"} updated. Your tickets are ready below.`,
              );
            }
          }
          setSyncing(false);
        })();
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlyTicketError(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [request, token]);

  const checkOrder = useCallback(
    async (orderId: string) => {
      if (!token || busyId) return;
      setBusyId(orderId);
      setNotice(null);
      setActionError(null);
      try {
        const refreshed = await refreshTicketOrder({
          data: { orderId },
          headers: { Authorization: `Bearer ${token}` },
        });
        verifiedRef.current.add(orderId);
        setOrders((current) =>
          current.map((order) => (order.orderId === orderId ? refreshed.order : order)),
        );
        if (refreshed.order.status === "paid") {
          setNotice("Payment confirmed — your tickets are ready below.");
        } else {
          setNotice("Still awaiting payment confirmation. If you already paid, it usually lands within a minute — check again shortly.");
        }
      } catch (caught) {
        setActionError(friendlyTicketError(caught));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, token],
  );

  const resumeOrder = useCallback(
    async (order: TicketOrderSummary) => {
      if (!token || busyId) return;
      const lines: TicketLineInput[] = [];
      for (const line of order.lines) {
        if (!line.tierId) {
          setActionError("Those tickets changed since checkout. Please start a new order from the event page.");
          return;
        }
        lines.push({ tierId: line.tierId, quantity: line.quantity });
      }
      setBusyId(order.orderId);
      setNotice(null);
      setActionError(null);
      try {
        const result = await startTicketCheckout({
          data: { eventId: order.eventId, lines },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (result.status === "paid" || !result.checkoutUrl) {
          setNotice("Payment was already confirmed for that order.");
          setRequest((n) => n + 1);
          return;
        }
        window.location.href = result.checkoutUrl;
      } catch (caught) {
        setActionError(friendlyTicketError(caught));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, token],
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!token || busyId) return;
      setBusyId(orderId);
      setNotice(null);
      setActionError(null);
      try {
        const result = await cancelMyTicketOrder({
          data: { orderId },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (result.outcome === "already_paid") {
          setNotice("Payment was already confirmed — those tickets are yours.");
        } else {
          setNotice("The pending checkout was cancelled. No payment was made.");
        }
        setRequest((n) => n + 1);
      } catch (caught) {
        setActionError(friendlyTicketError(caught));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, token],
  );

  return {
    orders,
    loading,
    error,
    notice,
    busyId,
    syncing,
    actionError,
    refresh,
    checkOrder,
    resumeOrder,
    cancelOrder,
    dismissNotice,
  };
}

export interface TicketOrderStatusState {
  order: TicketOrderSummary | null;
  loading: boolean;
  polling: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Authoritative status for one order. The first load re-verifies against
 * live Bachs truth (activating when money is confirmed); while pending it
 * polls the stored row briefly so the webhook can settle in the
 * background. Terminal states stop immediately.
 */
export function useTicketOrderStatus(orderId: string | undefined): TicketOrderStatusState {
  const token = useAccessToken();
  const [order, setOrder] = useState<TicketOrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);
  const pollsDone = useRef(0);

  const refresh = useCallback(() => {
    pollsDone.current = 0;
    setRequest((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!orderId || !token) {
      setOrder(null);
      setPolling(false);
      setLoading(false);
      if (orderId && !token) setError("Sign in to view this order.");
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    setError(null);

    const load = async (verifyFirst: boolean) => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const result = verifyFirst
          ? await refreshTicketOrder({ data: { orderId }, headers })
          : await getTicketOrderStatus({ data: { orderId }, headers });
        if (!active) return;
        setOrder(result.order);
        setLoading(false);
        if (result.order.status === "pending" && pollsDone.current < STATUS_POLLS_MAX) {
          pollsDone.current += 1;
          setPolling(true);
          timer = setTimeout(() => {
            if (active) void load(false);
          }, STATUS_POLL_MS);
        } else {
          setPolling(false);
        }
      } catch (caught) {
        if (!active) return;
        setError(friendlyTicketError(caught));
        setLoading(false);
        setPolling(false);
      }
    };
    void load(true);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, request, token]);

  return { order, loading, polling, error, refresh };
}
