// Client-side notifications hook (P4). Loads the caller's own inbox through
// the RLS-scoped server functions and keeps a local copy for instant
// read-state updates. Nothing here can read or touch another user's rows.
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/showcase/auth/auth-context";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "./notifications";

export interface UseNotificationsState {
  notifications: NotificationRow[];
  unread: number;
  loading: boolean;
  error: string | null;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => void;
}

function authHeaders(token: string | null): { Authorization: string } | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

export function useNotifications(): UseNotificationsState {
  const { session, loading: authLoading } = useAuth();
  const token = session?.access_token ?? null;
  const userId = session?.user.id ?? null;
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);
  const failedOnce = useRef(false);

  const refresh = useCallback(() => setRequest((current) => current + 1), []);

  useEffect(() => {
    if (authLoading) return;
    if (!userId || !token) {
      setNotifications([]);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    listMyNotifications({ data: { limit: 30 }, headers: authHeaders(token) }).then(
      (result) => {
        if (!active) return;
        failedOnce.current = false;
        setNotifications(result.notifications);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        // The inbox tables may not exist yet (migration pending); fail
        // quietly once rather than alarming the user on every visit.
        if (!failedOnce.current) {
          console.error("[notifications] load failed", caught);
          failedOnce.current = true;
        }
        setError("Could not load notifications.");
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [authLoading, userId, token, request]);

  const markRead = useCallback(
    async (id: string) => {
      if (!token) return;
      setNotifications((current) =>
        current.map((row) =>
          row.id === id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row,
        ),
      );
      try {
        await markNotificationRead({ data: { id }, headers: authHeaders(token) });
      } catch (caught) {
        console.error("[notifications] mark-read failed", caught);
      }
    },
    [token],
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    const stamped = new Date().toISOString();
    setNotifications((current) =>
      current.map((row) => (row.readAt ? row : { ...row, readAt: stamped })),
    );
    try {
      await markAllNotificationsRead({ headers: authHeaders(token) });
    } catch (caught) {
      console.error("[notifications] mark-all-read failed", caught);
    }
  }, [token]);

  const unread = notifications.filter((row) => !row.readAt).length;
  return { notifications, unread, loading, error, markRead, markAllRead, refresh };
}
