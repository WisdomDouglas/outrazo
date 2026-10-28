import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/showcase/auth/auth-context";
import { fetchOrganizerEvents, setEventPublished, type OrganizerEvent } from "./organizer-events";
import { summarizeOrganizerEvents, type OrganizerEventCounts } from "./organizer-summary";

export interface OrganizerEventsState {
  events: OrganizerEvent[];
  counts: OrganizerEventCounts;
  loading: boolean;
  error: string | null;
  notice: string | null;
  actionError: string | null;
  busyId: string | null;
  refresh: () => void;
  togglePublished: (event: OrganizerEvent) => Promise<void>;
  dismissNotice: () => void;
}

const EMPTY_COUNTS: OrganizerEventCounts = { total: 0, published: 0, drafts: 0, upcoming: 0 };

export function useOrganizerEvents(): OrganizerEventsState {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  const refresh = useCallback(() => setRequest((current) => current + 1), []);
  const dismissNotice = useCallback(() => {
    setNotice(null);
    setActionError(null);
  }, []);

  useEffect(() => {
    if (!userId) {
      setEvents([]);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchOrganizerEvents(userId).then(
      (rows) => {
        if (!active) return;
        setEvents(rows);
        setLoading(false);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Could not load your events.");
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [userId, request]);

  const counts = useMemo(
    () =>
      summarizeOrganizerEvents(
        events.map((event) => ({ published: event.published, startsAt: event.details.startsAt })),
      ),
    [events],
  );

  const togglePublished = useCallback(
    async (event: OrganizerEvent) => {
      if (!userId || busyId) return;
      setBusyId(event.id);
      setNotice(null);
      setActionError(null);
      try {
        const updated = await setEventPublished(event.id, userId, !event.published);
        setEvents((current) =>
          current.map((row) =>
            row.id === updated.id ? { ...row, published: updated.published } : row,
          ),
        );
        setNotice(
          updated.published
            ? `“${event.details.title}” is now published and visible in discovery.`
            : `“${event.details.title}” was unpublished and hidden from discovery. Nothing was deleted.`,
        );
      } catch (caught: unknown) {
        setActionError(caught instanceof Error ? caught.message : "Could not update this event.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, userId],
  );

  return {
    events,
    counts: userId ? counts : EMPTY_COUNTS,
    loading,
    error,
    notice,
    actionError,
    busyId,
    refresh,
    togglePublished,
    dismissNotice,
  };
}
