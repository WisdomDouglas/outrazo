import { useCallback, useEffect, useMemo, useState } from "react";

import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { EVENTS, type CategoryId, type OutrazoEvent } from "../sample-data";

export type DiscoveryStatus = "loading" | "ready" | "error";

export interface DiscoveryState {
  category: CategoryId;
  setCategory: (id: CategoryId) => void;
  city: string | null;
  setCity: (city: string | null) => void;
  events: OutrazoEvent[];
  /** All loaded events, before category/city filters. */
  allEvents: OutrazoEvent[];
  status: DiscoveryStatus;
  retry: () => void;
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => void;
  savedCount: number;
  reset: () => void;
}

/**
 * Client-side discovery state: category filter, city filter and saved events.
 * `source` is the only piece that changes when the database lands — swap it for
 * an API/query result and the components keep working.
 */
export function useDiscovery(source: OutrazoEvent[] = EVENTS): DiscoveryState {
  const [category, setCategory] = useState<CategoryId>("all");
  const [city, setCity] = useState<string | null>(null);
  const [status, setStatus] = useState<DiscoveryStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const { isSaved, toggle, saved } = useSavedItems();

  // Demo data resolves on mount. Replace with the real fetch lifecycle later.
  useEffect(() => {
    setStatus("loading");
    const timer = window.setTimeout(() => setStatus("ready"), 350);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const events = useMemo(
    () =>
      source.filter(
        (event) =>
          (category === "all" || event.category === category) &&
          (!city || event.city === city),
      ),
    [source, category, city],
  );

  const reset = useCallback(() => {
    setCategory("all");
    setCity(null);
  }, []);

  return {
    category,
    setCategory,
    city,
    setCity,
    events,
    allEvents: source,
    status,
    retry,
    isSaved,
    toggleSave: toggle,
    savedCount: saved.length,
    reset,
  };
}
