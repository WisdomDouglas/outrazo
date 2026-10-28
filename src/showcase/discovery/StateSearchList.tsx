import { Check } from "lucide-react";
import { useState } from "react";

import { SearchField } from "@/design-system/components/SearchField";
import { filterStates, shortStateLabel } from "./locations";

interface StateSearchListProps {
  /** Canonical selected state name, or null when nothing is selected. */
  selected: string | null;
  onSelect: (stateName: string) => void;
  listLabel?: string;
}

/**
 * Searchable listbox of all 36 Nigerian states plus the FCT. Popular states
 * stay on top; typing filters by state, capital, or major city so every
 * entry remains discoverable without an overwhelming dropdown.
 */
export function StateSearchList({ selected, onSelect, listLabel }: StateSearchListProps) {
  const [query, setQuery] = useState("");
  const matches = filterStates(query);

  return (
    <div className="grid gap-sm">
      <SearchField
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => setQuery("")}
        label="Search states"
        placeholder="Search 36 states and the FCT…"
      />
      {matches.length ? (
        <ul
          role="listbox"
          aria-label={listLabel ?? "Choose a state"}
          className="grid max-h-72 gap-xs overflow-y-auto p-xs"
        >
          {matches.map((state) => {
            const active = state.name === selected;
            return (
              <li key={state.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onSelect(state.name)}
                  className="focus-ring type-body flex min-h-11 w-full items-center justify-between gap-sm rounded-sm px-sm text-left transition-colors hover:bg-accent/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{shortStateLabel(state.name)}</span>
                    <span className="type-caption block truncate text-muted-text">
                      {state.capital}
                    </span>
                  </span>
                  {active ? <Check aria-hidden className="size-4 shrink-0 text-accent" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="type-body px-sm py-md text-muted-text" role="status">
          No states match your search.
        </p>
      )}
    </div>
  );
}
