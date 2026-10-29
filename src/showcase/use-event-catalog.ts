import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchPublishedEvents, mergeEventCatalog } from "./event-data";
import { useLiveCountsMap } from "./rsvp/live-count-store";
import { EVENTS } from "./sample-data";

export function useEventCatalog() {
  const [remoteEvents, setRemoteEvents] = useState<typeof EVENTS>([]);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);
  const liveCounts = useLiveCountsMap();

  useEffect(() => {
    let active = true;
    fetchPublishedEvents().then((events) => {
      if (!active) return;
      setRemoteEvents(events);
      setError(null);
    }).catch((caught: unknown) => {
      if (!active) return;
      setError(caught instanceof Error ? caught.message : "Could not load published events.");
    });
    return () => {
      active = false;
    };
  }, [request]);

  const events = useMemo(
    () =>
      mergeEventCatalog(remoteEvents).map((event) => {
        const live = liveCounts.get(event.id);
        return live === undefined || live === event.attendeeCount ? event : { ...event, attendeeCount: live };
      }),
    [remoteEvents, liveCounts],
  );
  const refresh = useCallback(() => setRequest((current) => current + 1), []);

  return {
    events,
    error,
    refresh,
  };
}
