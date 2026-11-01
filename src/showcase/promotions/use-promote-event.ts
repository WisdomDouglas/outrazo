// Promote-event page state (P2 Step 4B). Loads the organizer's event,
// its promotion orders, and a server-authoritative quote; starts or
// resumes the Bachs checkout; cancels pending orders. The browser never
// prices, verifies, or activates anything — every money decision is the
// server's, this hook only renders it.
import { useCallback, useEffect, useMemo, useState } from "react";

import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import { useAuth } from "@/showcase/auth/auth-context";
import {
  fetchOrganizerEvents,
  type OrganizerEvent,
} from "@/showcase/organizer/organizer-events";
import {
  ORDER_DAYS_MAX,
  ORDER_DAYS_MIN,
  ORDER_SUGGESTED_DURATIONS,
} from "./paid-promotion-orders";
import {
  cancelMyPromotionOrder,
  getPromotionQuoteFn,
  listMyPromotionOrders,
  startPromotionCheckout,
  type PromotionOrderSummary,
  type PromotionQuote,
} from "./promotion-functions";

export interface PromoteEventState {
  event: OrganizerEvent | null;
  eventLoading: boolean;
  eventError: string | null;
  pendingOrder: PromotionOrderSummary | null;
  ordersLoading: boolean;
  days: number;
  setDays: (days: number) => void;
  suggestedDurations: readonly number[];
  quote: PromotionQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  starting: boolean;
  startError: string | null;
  cancelling: boolean;
  cancelError: string | null;
  notice: string | null;
  startCheckout: () => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  dismissNotice: () => void;
  refreshOrders: () => void;
}

export function usePromoteEvent(eventId: string): PromoteEventState {
  const { session } = useAuth();
  const token = useAccessToken();
  const userId = session?.user.id ?? null;

  const [event, setEvent] = useState<OrganizerEvent | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);

  const [orders, setOrders] = useState<PromotionOrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersRequest, setOrdersRequest] = useState(0);

  const [days, setDaysState] = useState<number>(ORDER_SUGGESTED_DURATIONS[0]);
  const [quote, setQuote] = useState<PromotionQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshOrders = useCallback(() => setOrdersRequest((n) => n + 1), []);
  const dismissNotice = useCallback(() => {
    setNotice(null);
    setStartError(null);
    setCancelError(null);
  }, []);

  const setDays = useCallback((next: number) => {
    if (!Number.isInteger(next)) return;
    setDaysState(Math.min(Math.max(next, ORDER_DAYS_MIN), ORDER_DAYS_MAX));
  }, []);

  useEffect(() => {
    if (!userId) {
      setEvent(null);
      setEventError(null);
      setEventLoading(false);
      return;
    }
    let active = true;
    setEventLoading(true);
    setEventError(null);
    fetchOrganizerEvents(userId).then(
      (rows) => {
        if (!active) return;
        const found = rows.find((row) => row.id === eventId) ?? null;
        setEvent(found);
        if (!found) setEventError("That event was not found among your events.");
        setEventLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setEventError(friendlyAdminError(caught));
        setEventLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [eventId, userId]);

  useEffect(() => {
    if (!token) {
      setOrders([]);
      setOrdersLoading(false);
      return;
    }
    let active = true;
    setOrdersLoading(true);
    listMyPromotionOrders({
      data: { limit: 50 },
      headers: { Authorization: `Bearer ${token}` },
    }).then(
      (result) => {
        if (!active) return;
        setOrders(result.orders.filter((order) => order.eventId === eventId));
        setOrdersLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        // Orders failing to load must not block quoting: the create call
        // re-checks everything server-side anyway.
        setOrders([]);
        setOrdersLoading(false);
        setQuoteError((current) => current ?? friendlyAdminError(caught));
      },
    );
    return () => {
      active = false;
    };
  }, [eventId, token, ordersRequest]);

  useEffect(() => {
    if (!token) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }
    let active = true;
    setQuoteLoading(true);
    setQuoteError(null);
    getPromotionQuoteFn({
      data: { eventId, days },
      headers: { Authorization: `Bearer ${token}` },
    }).then(
      (result) => {
        if (!active) return;
        setQuote(result);
        setQuoteLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setQuote(null);
        setQuoteError(friendlyAdminError(caught));
        setQuoteLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [days, eventId, token]);

  const pendingOrder = useMemo(
    () => orders.find((order) => order.status === "pending") ?? null,
    [orders],
  );

  const startCheckout = useCallback(async () => {
    if (!token || starting) return;
    setStarting(true);
    setStartError(null);
    setNotice(null);
    try {
      const result = await startPromotionCheckout({
        data: { eventId, days },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result.status === "already-active") {
        setNotice(
          result.outcome === "refund_pending"
            ? "Payment was received but the promotion needs manual review. Our team will resolve it — nothing more to pay."
            : "Payment already confirmed — your promotion is active.",
        );
        refreshOrders();
        return;
      }
      // Only a server-issued session URL is ever opened. ready and resumed
      // both carry one; anything else never reaches this line.
      window.location.href = result.checkoutUrl;
    } catch (caught) {
      setStartError(friendlyAdminError(caught));
    } finally {
      setStarting(false);
    }
  }, [days, eventId, refreshOrders, starting, token]);

  const cancelOrder = useCallback(
    async (orderId: string) => {
      if (!token || cancelling) return;
      setCancelling(true);
      setCancelError(null);
      setNotice(null);
      try {
        const result = await cancelMyPromotionOrder({
          data: { orderId },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (result.status === "paid") {
          setNotice("Payment was already confirmed — your promotion is active.");
        } else if (result.status === "refund_pending") {
          setNotice(
            "Payment was received but the promotion needs manual review. Our team will resolve it.",
          );
        } else {
          setNotice("The pending checkout was cancelled. No payment was made.");
        }
        refreshOrders();
      } catch (caught) {
        setCancelError(friendlyAdminError(caught));
      } finally {
        setCancelling(false);
      }
    },
    [cancelling, refreshOrders, token],
  );

  return {
    event,
    eventLoading,
    eventError,
    pendingOrder,
    ordersLoading,
    days,
    setDays,
    suggestedDurations: ORDER_SUGGESTED_DURATIONS,
    quote,
    quoteLoading,
    quoteError,
    starting,
    startError,
    cancelling,
    cancelError,
    notice,
    startCheckout,
    cancelOrder,
    dismissNotice,
    refreshOrders,
  };
}
