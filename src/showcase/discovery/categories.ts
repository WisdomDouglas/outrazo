import {
  Briefcase,
  Laptop,
  LayoutGrid,
  Music,
  Palette,
  PartyPopper,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import { EVENTS, type CategoryId } from "../sample-data";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
  count: string;
}

const countFor = (id: CategoryId) => {
  const total = id === "all" ? EVENTS.length : EVENTS.filter((e) => e.category === id).length;
  return `${total} ${total === 1 ? "event" : "events"}`;
};

const defs: Array<{ id: CategoryId; label: string; icon: LucideIcon }> = [
  { id: "all", label: "All events", icon: LayoutGrid },
  { id: "parties", label: "Parties", icon: PartyPopper },
  { id: "music", label: "Music", icon: Music },
  { id: "tech", label: "Tech", icon: Laptop },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "culture", label: "Culture", icon: Palette },
  { id: "food", label: "Food", icon: UtensilsCrossed },
  { id: "sports", label: "Sports", icon: Trophy },
];

/** Counts derive from the demo dataset so labels never drift from the data. */
export const CATEGORIES: CategoryDef[] = defs.map((d) => ({ ...d, count: countFor(d.id) }));
