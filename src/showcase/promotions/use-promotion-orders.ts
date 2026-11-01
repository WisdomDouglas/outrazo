// Promotion order list + status state (P2 Step 4B). Powers the organizer
// Promotions page and the Bachs return pages. Status always comes from the
// server: return-URL query parameters only name WHICH order to look up.
import { useCallback, useEffect, useRef, useState } from "react";

import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import {
  cancelMyPromotionOrder,
  getPromotionOrderStatus,
  listMyPromotionOrders,
  type PromotionOrderSummary,
} from "./promotion-functions";

const STATUS_POLL_MS = 3000;
const STATUS_POLLS_MAX = 20;

export interface MyPromotionOrdersState {
  orders: PromotionOrderSummary[];
  loading: boolean;
  error: string | null;
  notice: string | null;
  busyId: string | null;
  actionError: string | null;
  refresh: () => void;
  cancelOrder: (orderId: string) => Promise<void>;
  dismissNotice: () => void;
}

export function useMyPromotionOrders(): MyPromotionOrdersState {
  const token = useAccessToken();
  const [orders, setOrders] = useState<PromotionOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

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
    listMyPromotionOrders({
      data: { limit: 50 },
      headers: { Authorization: `Bearer ${token}` },
    }).then(
      (result) => {
        if (!active) return;
        setOrders(result.orders);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlyAdminError(caught));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [request, token]);

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!token || busyId) return;
      setBusyId(orderId);
      setNotice(null);
      setActionError(null);
      try {
        const result = await cancelMyPromotionOrder({
          data: { orderId },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (result.status === "paid") {
          setNotice("Payment was already confirmed — that promotion is active.");
        } else if (result.status === "refund_pending") {
          setNotice("Payment was received but needs manual review. Our team will resolve it.");
        } else {
          setNotice("The pending checkout was cancelled. No payment was made.");
        }
        setRequest((n) => n + 1);
      } catch (caught) {
        setActionError(friendlyAdminError(caught));
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
    actionError,
    refresh,
    cancelOrder,
    dismissNotice,
  };
}

export interface PromotionOrderStatusState {
  order: PromotionOrderSummary | null;
  loading: boolean;
  polling: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Authoritative status for one order, re-polled while it is pending. Used
 * by the Bachs return pages: landing on success/cancelled proves nothing —
 * only the database row decides what the UI claims.
 */
export function usePromotionOrderStatus(
  orderId: string | undefined,
): PromotionOrderStatusState {
  const token = useAccessToken();
  const [order, setOrder] = useState<PromotionOrderSummary | null>(null);
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

    const load = async () => {
      try {
        const result = await getPromotionOrderStatus({
          data: { orderId },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!active) return;
        setOrder(result.order);
        setLoading(false);
        // Pending verification: keep polling briefly for the webhook to
        // settle. Terminal states stop immediately.
        if (result.order.status === "pending" && pollsDone.current < STATUS_POLLS_MAX) {
          pollsDone.current += 1;
          setPolling(true);
          timer = setTimeout(() => {
            if (active) void load();
          }, STATUS_POLL_MS);
        } else {
          setPolling(false);
        }
      } catch (caught) {
        if (!active) return;
        setError(friendlyAdminError(caught));
        setLoading(false);
        setPolling(false);
      }
    };
    void load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, request, token]);

  return { order, loading, polling, error, refresh };
}
