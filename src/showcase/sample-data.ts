import type { AvatarStackPerson } from "@/design-system/components/AvatarStack";

export const ATTENDEES: AvatarStackPerson[] = [
  { name: "Ada Nwosu" },
  { name: "Tolu Bakare" },
  { name: "Kemi Ade" },
  { name: "Jide Okon" },
  { name: "Zara Bello" },
  { name: "Femi Cole" },
];

export type CategoryId =
  | "all"
  | "parties"
  | "music"
  | "tech"
  | "business"
  | "culture"
  | "food"
  | "sports";

export interface OutrazoEvent {
  id: string;
  title: string;
  imageSrc: string;
  date: string;
  time?: string;
  location: string;
  city: string;
  price?: string;
  host: { name: string };
  category: Exclude<CategoryId, "all">;
  tag?: string;
  tagVariant?: "accent" | "transactional";
}

const img = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

/** Temporary in-memory catalogue. Replace with a database query later. */
export const EVENTS: OutrazoEvent[] = [
  {
    id: "lagos-night-market",
    title: "Lagos Night Market: Sound & Supper",
    imageSrc: img("photo-1514525253161-7a46d19cd819"),
    date: "Fri 12 Sep",
    time: "8:00 PM",
    location: "Freedom Park, Lagos Island",
    city: "Lagos",
    price: "₦12,000",
    host: { name: "Nocturne Collective" },
    category: "parties",
    tag: "Trending",
    tagVariant: "accent",
  },
  {
    id: "build-week-ai",
    title: "Build Week: Shipping AI Products",
    imageSrc: img("photo-1505373877841-8d25f7d46678"),
    date: "Sat 13 Sep",
    time: "10:00 AM",
    location: "Ikeja Tech Hub",
    city: "Lagos",
    host: { name: "Outrazo Builders" },
    category: "tech",
    tag: "This weekend",
    tagVariant: "transactional",
  },
  {
    id: "sunrise-run-club",
    title: "Sunrise Run Club — Lekki Loop",
    imageSrc: img("photo-1552674605-db6ffd4facb5"),
    date: "Sun 14 Sep",
    time: "6:30 AM",
    location: "Lekki Phase 1",
    city: "Lagos",
    host: { name: "Morning People" },
    category: "sports",
    tag: "Free entry",
  },
  {
    id: "rnb-and-vibes",
    title: "RnB & Vibes: Live Session",
    imageSrc: img("photo-1493225457124-a3eb161ffa5f"),
    date: "Fri 12 Sep",
    time: "9:00 PM",
    location: "The Grand Rooftop, VI",
    city: "Lagos",
    price: "₦8,500",
    host: { name: "Soundhouse Lagos" },
    category: "music",
    tag: "Tonight",
    tagVariant: "transactional",
  },
  {
    id: "founders-breakfast",
    title: "Founders Breakfast: Raising in 2026",
    imageSrc: img("photo-1517457373958-b7bdd4587205"),
    date: "Tue 16 Sep",
    time: "8:30 AM",
    location: "Alliance Place, Ikoyi",
    city: "Lagos",
    price: "₦15,000",
    host: { name: "Growth Circle" },
    category: "business",
  },
  {
    id: "abuja-art-walk",
    title: "Abuja Art Walk & Gallery Night",
    imageSrc: img("photo-1531058020387-3be344556be6"),
    date: "Sat 13 Sep",
    time: "5:00 PM",
    location: "Thought Pyramid, Wuse II",
    city: "Abuja",
    host: { name: "Nok Gallery" },
    category: "culture",
    tag: "This weekend",
    tagVariant: "transactional",
  },
  {
    id: "supper-club-ph",
    title: "Supper Club: West African Tasting",
    imageSrc: img("photo-1555939594-58d7cb561ad1"),
    date: "Sun 14 Sep",
    time: "7:00 PM",
    location: "Old GRA, Port Harcourt",
    city: "Port Harcourt",
    price: "₦22,000",
    host: { name: "Table Nine" },
    category: "food",
  },
  {
    id: "ibadan-live-band",
    title: "Live Band Session — Ibadan Sessions",
    imageSrc: img("photo-1524368535928-5b5e00ddc76b"),
    date: "Sat 13 Sep",
    time: "8:00 PM",
    location: "Jericho, Ibadan",
    city: "Ibadan",
    price: "₦5,000",
    host: { name: "Sessions NG" },
    category: "music",
  },
  {
    id: "house-party-lekki",
    title: "Detty December Warm-Up House Party",
    imageSrc: img("photo-1470229722913-7c0e2dbbafd3"),
    date: "Fri 12 Sep",
    time: "10:00 PM",
    location: "Chevron Drive, Lekki",
    city: "Lagos",
    price: "₦10,000",
    host: { name: "Lagos After Dark" },
    category: "parties",
    tag: "Tonight",
    tagVariant: "transactional",
  },
];

export const CITIES = [
  {
    name: "Lagos",
    count: "1,234 events",
    distance: "Nearby",
    src: img("photo-1618828665011-0abd973f7bb4", 700),
  },
  {
    name: "Abuja",
    count: "842 events",
    distance: "525 km",
    src: img("photo-1590846406792-0adc7f938f1d", 700),
  },
  {
    name: "Port Harcourt",
    count: "612 events",
    distance: "436 km",
    src: img("photo-1449824913935-59a10b8d2000", 700),
  },
  {
    name: "Ibadan",
    count: "423 events",
    distance: "128 km",
    src: img("photo-1477959858617-67f85cf4f1df", 700),
  },
];
