import { useCallback, useMemo, useState } from "react";

import { useSavedItems } from "@/design-system/lib/use-saved-items";
import { EVENTS, type CategoryId, type OutrazoEvent } from "../sample-data";

export interface DiscoveryState {
  category: CategoryId;
  setCategory: (id: CategoryId) => void;
  city: string | null;
  setCity: (city: string | null) => void;
  events: OutrazoEvent[];
  /** All loaded events, before category/city filters. */
  allEvents: OutrazoEvent[];
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
  const { isSaved, toggle, saved } = useSavedItems();

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
    isSaved,
    toggleSave: toggle,
    savedCount: saved.length,
    reset,
  };
}
