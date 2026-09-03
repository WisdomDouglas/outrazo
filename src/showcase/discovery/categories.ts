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

import type { CategoryId } from "../sample-data";

export interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: LucideIcon;
  count: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "all", label: "All events", icon: LayoutGrid, count: "1,227 events" },
  { id: "parties", label: "Parties", icon: PartyPopper, count: "412 events" },
  { id: "music", label: "Music", icon: Music, count: "268 events" },
  { id: "tech", label: "Tech", icon: Laptop, count: "154 events" },
  { id: "business", label: "Business", icon: Briefcase, count: "97 events" },
  { id: "culture", label: "Culture", icon: Palette, count: "132 events" },
  { id: "food", label: "Food", icon: UtensilsCrossed, count: "88 events" },
  { id: "sports", label: "Sports", icon: Trophy, count: "76 events" },
];
