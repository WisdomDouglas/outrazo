import type { AvatarStackPerson } from "@/design-system/components/AvatarStack";

/**
 * Centralized development/demo dataset for Outrazo.
 *
 * Everything here is sample content used to build and preview the UI — it is
 * NOT real platform data. When the backend lands, replace the arrays below
 * (or the loader in `use-discovery.ts`) with API results; the exported types
 * are the contract the UI depends on.
 */

export interface OrganizerSocialLink {
  /** Platform label, e.g. "Instagram". */
  label: string;
  url: string;
}

export interface Organizer {
  id: string;
  name: string;
  /** Community or venue the organizer is associated with. */
  community: string;
  verified?: boolean;
  description?: string;
  avatarSrc?: string;
  /** Home city for the organizer, e.g. "Lagos, Nigeria". */
  location?: string;
  website?: string;
  socialLinks?: OrganizerSocialLink[];
}

export interface Attendee extends AvatarStackPerson {
  id: string;
}

export type CategoryId =
  | "all"
  | "parties"
  | "music"
  | "tech"
  | "business"
  | "culture"
  | "food"
  | "sports";

export interface TicketTier {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  description?: string;
}

export interface EventVenue {
  name: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
}

export interface OutrazoEvent {
  id: string;
  title: string;
  imageSrc: string;
  /** Short date label, e.g. "Fri 12 Sep". */
  date: string;
  time?: string;
  /** ISO date for future sorting/filtering. */
  startsAt: string;
  location: string;
  city: string;
  /** Display price, e.g. "₦12,000". Omit for a free event. */
  price?: string;
  organizerId: string;
  category: Exclude<CategoryId, "all">;
  tag?: string;
  tagVariant?: "accent" | "transactional";
  /** Demo attendance count for this event record. */
  attendeeCount: number;
  /** Attendee ids used for the avatar stack. */
  attendeeIds: string[];
  /** Demo flag powering the "tonight" surfaces. */
  tonight?: boolean;
  /** Real host details for published Supabase events. */
  organizerDetails?: Organizer;
  eventType?: "free" | "paid";
  capacity?: number;
  summary?: string;
  description?: string;
  endTime?: string;
  venue?: EventVenue;
  ticketTiers?: TicketTier[];
  status?: "upcoming" | "sold-out" | "cancelled";
}

const img = (id: string, w = 800) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

export const ATTENDEES: Attendee[] = [
  { id: "ada", name: "Ada Nwosu" },
  { id: "tolu", name: "Tolu Bakare" },
  { id: "kemi", name: "Kemi Ade" },
  { id: "jide", name: "Jide Okon" },
  { id: "zara", name: "Zara Bello" },
  { id: "femi", name: "Femi Cole" },
  { id: "chidi", name: "Chidi Eze" },
  { id: "amara", name: "Amara Obi" },
  { id: "seyi", name: "Seyi Adeyemi" },
  { id: "hauwa", name: "Hauwa Sani" },
  { id: "ifeanyi", name: "Ifeanyi Nnaji" },
  { id: "bisi", name: "Bisi Ogundipe" },
];

export const ORGANIZERS: Organizer[] = [
  { id: "nocturne", name: "Nocturne Collective", community: "Lagos Nightlife", verified: true, description: "Curating unforgettable nightlife, food, and sound experiences across Lagos.", location: "Lagos, Nigeria", website: "https://nocturne.example.com", socialLinks: [{ label: "Instagram", url: "https://instagram.com/nocturne" }, { label: "X", url: "https://x.com/nocturne" }] },
  { id: "builders", name: "Outrazo Builders", community: "Tech Community", verified: true, description: "A community helping ambitious Nigerian builders learn, connect, and ship together.", location: "Lagos, Nigeria", website: "https://builders.example.com", socialLinks: [{ label: "X", url: "https://x.com/outrazobuilders" }] },
  { id: "morning", name: "Morning People", community: "Run Club", description: "An inclusive movement making early mornings active, social, and joyful.", location: "Lagos, Nigeria", socialLinks: [{ label: "Instagram", url: "https://instagram.com/morningpeople" }] },
  { id: "soundhouse", name: "Soundhouse Lagos", community: "Live Music", description: "Independent live music experiences spotlighting Nigeria’s most exciting sounds.", location: "Lagos, Nigeria", website: "https://soundhouse.example.com" },
  { id: "growth", name: "Growth Circle", community: "Founders Network", verified: true, description: "A trusted gathering place for founders, operators, and investors building in Africa.", location: "Lagos, Nigeria", website: "https://growthcircle.example.com", socialLinks: [{ label: "LinkedIn", url: "https://linkedin.com/company/growthcircle" }] },
  { id: "nok", name: "Nok Gallery", community: "Abuja Arts", description: "Thoughtful art encounters connecting contemporary artists with curious audiences.", location: "Abuja, Nigeria", socialLinks: [{ label: "Instagram", url: "https://instagram.com/nokgallery" }] },
  { id: "tablenine", name: "Table Nine", community: "Supper Club", description: "Intimate dining experiences celebrating West African ingredients and hospitality.", location: "Lagos, Nigeria" },
  { id: "sessions", name: "Sessions NG", community: "Ibadan Music", description: "Live sessions and community shows built around emerging Nigerian music.", location: "Ibadan, Nigeria", socialLinks: [{ label: "Instagram", url: "https://instagram.com/sessionsng" }] },
  { id: "afterdark", name: "Lagos After Dark", community: "Party Series", description: "High-energy Lagos parties designed around music, movement, and community.", location: "Lagos, Nigeria" },
  { id: "kanoarts", name: "Kano Arts Circle", community: "Northern Creatives", description: "Supporting northern creatives through markets, exhibitions, and cultural gatherings.", location: "Kano, Nigeria" },
  { id: "enugutech", name: "Enugu Tech Hub", community: "Coal City Devs", description: "A practical community for developers and product builders in the South East.", location: "Enugu, Nigeria", website: "https://enugutech.example.com" },
  { id: "ceremony", name: "Ceremony NG", community: "Culture & Heritage", description: "Modern experiences rooted in Nigerian culture, comedy, and celebration.", location: "Lagos, Nigeria" },
  { id: "hoopsng", name: "Hoops Lagos", community: "Street Basketball", description: "Building community through street basketball, leagues, and open play.", location: "Lagos, Nigeria" },
  { id: "pepperclub", name: "Pepper Club", community: "Food Lovers", description: "Food-led gatherings for people who love bold flavours and shared tables.", location: "Port Harcourt, Nigeria" },
];

const organizerById = new Map(ORGANIZERS.map((o) => [o.id, o]));
const attendeeById = new Map(ATTENDEES.map((a) => [a.id, a]));

export const getOrganizer = (id: string): Organizer =>
  organizerById.get(id) ?? { id, name: "Outrazo Organizer", community: "Community" };

export const getAttendees = (ids: string[]): Attendee[] =>
  ids.map((id) => attendeeById.get(id)).filter(Boolean) as Attendee[];

/** Temporary in-memory catalogue. Replace with a database query later. */
export const EVENTS: OutrazoEvent[] = [
  {
    id: "lagos-night-market",
    title: "Lagos Night Market: Sound & Supper",
    imageSrc: img("photo-1514525253161-7a46d19cd819"),
    date: "Fri 12 Sep",
    time: "8:00 PM",
    startsAt: "2026-09-12T19:00:00Z",
    location: "Freedom Park, Lagos Island",
    city: "Lagos",
    price: "₦12,000",
    organizerId: "nocturne",
    category: "parties",
    tag: "Trending",
    tagVariant: "accent",
    attendeeCount: 412,
    attendeeIds: ["ada", "tolu", "kemi", "jide", "zara"],
    tonight: true,
  },
  {
    id: "build-week-ai",
    title: "Build Week: Shipping AI Products",
    imageSrc: img("photo-1505373877841-8d25f7d46678"),
    date: "Sat 13 Sep",
    time: "10:00 AM",
    startsAt: "2026-09-13T09:00:00Z",
    location: "Ikeja Tech Hub",
    city: "Lagos",
    organizerId: "builders",
    category: "tech",
    tag: "This weekend",
    tagVariant: "transactional",
    attendeeCount: 186,
    attendeeIds: ["chidi", "amara", "seyi", "femi"],
  },
  {
    id: "sunrise-run-club",
    title: "Sunrise Run Club — Lekki Loop",
    imageSrc: img("photo-1552674605-db6ffd4facb5"),
    date: "Sun 14 Sep",
    time: "6:30 AM",
    startsAt: "2026-09-14T05:30:00Z",
    location: "Lekki Phase 1",
    city: "Lagos",
    organizerId: "morning",
    category: "sports",
    tag: "Free entry",
    attendeeCount: 94,
    attendeeIds: ["bisi", "jide", "hauwa"],
  },
  {
    id: "rnb-and-vibes",
    title: "RnB & Vibes: Live Session",
    imageSrc: img("photo-1493225457124-a3eb161ffa5f"),
    date: "Fri 12 Sep",
    time: "9:00 PM",
    startsAt: "2026-09-12T20:00:00Z",
    location: "The Grand Rooftop, VI",
    city: "Lagos",
    price: "₦8,500",
    organizerId: "soundhouse",
    category: "music",
    tag: "Tonight",
    tagVariant: "transactional",
    attendeeCount: 268,
    attendeeIds: ["zara", "femi", "ada", "seyi"],
    tonight: true,
  },
  {
    id: "founders-breakfast",
    title: "Founders Breakfast: Raising in 2026",
    imageSrc: img("photo-1517457373958-b7bdd4587205"),
    date: "Tue 16 Sep",
    time: "8:30 AM",
    startsAt: "2026-09-16T07:30:00Z",
    location: "Alliance Place, Ikoyi",
    city: "Lagos",
    price: "₦15,000",
    organizerId: "growth",
    category: "business",
    attendeeCount: 72,
    attendeeIds: ["amara", "chidi", "tolu"],
  },
  {
    id: "abuja-art-walk",
    title: "Abuja Art Walk & Gallery Night",
    imageSrc: img("photo-1531058020387-3be344556be6"),
    date: "Sat 13 Sep",
    time: "5:00 PM",
    startsAt: "2026-09-13T16:00:00Z",
    location: "Thought Pyramid, Wuse II",
    city: "Abuja",
    organizerId: "nok",
    category: "culture",
    tag: "This weekend",
    tagVariant: "transactional",
    attendeeCount: 143,
    attendeeIds: ["hauwa", "ifeanyi", "kemi"],
  },
  {
    id: "supper-club-ph",
    title: "Supper Club: West African Tasting",
    imageSrc: img("photo-1555939594-58d7cb561ad1"),
    date: "Sun 14 Sep",
    time: "7:00 PM",
    startsAt: "2026-09-14T18:00:00Z",
    location: "Old GRA, Port Harcourt",
    city: "Port Harcourt",
    price: "₦22,000",
    organizerId: "tablenine",
    category: "food",
    attendeeCount: 58,
    attendeeIds: ["bisi", "ada", "jide"],
  },
  {
    id: "ibadan-live-band",
    title: "Live Band Session — Ibadan Sessions",
    imageSrc: img("photo-1524368535928-5b5e00ddc76b"),
    date: "Sat 13 Sep",
    time: "8:00 PM",
    startsAt: "2026-09-13T19:00:00Z",
    location: "Jericho, Ibadan",
    city: "Ibadan",
    price: "₦5,000",
    organizerId: "sessions",
    category: "music",
    attendeeCount: 201,
    attendeeIds: ["seyi", "tolu", "femi"],
  },
  {
    id: "house-party-lekki",
    title: "Detty December Warm-Up House Party",
    imageSrc: img("photo-1470229722913-7c0e2dbbafd3"),
    date: "Fri 12 Sep",
    time: "10:00 PM",
    startsAt: "2026-09-12T21:00:00Z",
    location: "Chevron Drive, Lekki",
    city: "Lagos",
    price: "₦10,000",
    organizerId: "afterdark",
    category: "parties",
    tag: "Tonight",
    tagVariant: "transactional",
    attendeeCount: 337,
    attendeeIds: ["zara", "kemi", "chidi", "bisi"],
    tonight: true,
  },
  {
    id: "amapiano-brunch",
    title: "Amapiano Brunch: Log Drum Edition",
    imageSrc: img("photo-1533174072545-7a4b6ad7a6c3"),
    date: "Sun 14 Sep",
    time: "1:00 PM",
    startsAt: "2026-09-14T12:00:00Z",
    location: "Landmark Beach, VI",
    city: "Lagos",
    price: "₦18,000",
    organizerId: "afterdark",
    category: "parties",
    attendeeCount: 289,
    attendeeIds: ["ada", "seyi", "hauwa", "femi"],
  },
  {
    id: "abuja-comedy-night",
    title: "Abuja Comedy Night: Laugh Republic",
    imageSrc: img("photo-1527224857830-43a7acc85260"),
    date: "Fri 12 Sep",
    time: "8:00 PM",
    startsAt: "2026-09-12T19:00:00Z",
    location: "Transcorp Hilton, Maitama",
    city: "Abuja",
    price: "₦7,500",
    organizerId: "ceremony",
    category: "culture",
    tag: "Tonight",
    tagVariant: "transactional",
    attendeeCount: 176,
    attendeeIds: ["ifeanyi", "amara", "jide"],
    tonight: true,
  },
  {
    id: "enugu-dev-meetup",
    title: "Coal City Devs: Building for Scale",
    imageSrc: img("photo-1540575467063-178a50c2df87"),
    date: "Wed 17 Sep",
    time: "4:00 PM",
    startsAt: "2026-09-17T15:00:00Z",
    location: "Independence Layout, Enugu",
    city: "Enugu",
    organizerId: "enugutech",
    category: "tech",
    tag: "Free entry",
    attendeeCount: 88,
    attendeeIds: ["chidi", "ifeanyi", "tolu"],
  },
  {
    id: "kano-craft-fair",
    title: "Kano Craft Fair & Textile Market",
    imageSrc: img("photo-1528605248644-14dd04022da1"),
    date: "Sat 20 Sep",
    time: "11:00 AM",
    startsAt: "2026-09-20T10:00:00Z",
    location: "Kofar Mata, Kano",
    city: "Kano",
    price: "₦2,000",
    organizerId: "kanoarts",
    category: "culture",
    attendeeCount: 122,
    attendeeIds: ["hauwa", "bisi", "amara"],
  },
  {
    id: "jollof-festival",
    title: "Jollof Wars: Street Food Festival",
    imageSrc: img("photo-1504674900247-0877df9cc836"),
    date: "Sat 20 Sep",
    time: "12:00 PM",
    startsAt: "2026-09-20T11:00:00Z",
    location: "Muri Okunola Park, VI",
    city: "Lagos",
    price: "₦6,000",
    organizerId: "pepperclub",
    category: "food",
    tag: "Trending",
    tagVariant: "accent",
    attendeeCount: 514,
    attendeeIds: ["kemi", "ada", "femi", "zara"],
  },
  {
    id: "lagos-hoops-classic",
    title: "Lagos Hoops Classic — Finals Day",
    imageSrc: img("photo-1546519638-68e109498ffc"),
    date: "Sun 21 Sep",
    time: "3:00 PM",
    startsAt: "2026-09-21T14:00:00Z",
    location: "Teslim Balogun Stadium, Surulere",
    city: "Lagos",
    price: "₦3,500",
    organizerId: "hoopsng",
    category: "sports",
    attendeeCount: 246,
    attendeeIds: ["jide", "seyi", "chidi"],
  },
  {
    id: "startup-pitch-abuja",
    title: "Pitch Night Abuja: Seed Stage",
    imageSrc: img("photo-1475721027785-f74eccf877e2"),
    date: "Thu 18 Sep",
    time: "6:00 PM",
    startsAt: "2026-09-18T17:00:00Z",
    location: "Ventures Park, Wuse",
    city: "Abuja",
    price: "₦5,000",
    organizerId: "growth",
    category: "business",
    attendeeCount: 134,
    attendeeIds: ["amara", "hauwa", "ifeanyi"],
  },
  {
    id: "highlife-revival",
    title: "Highlife Revival: Live Orchestra",
    imageSrc: img("photo-1459749411175-04bf5292ceea"),
    date: "Sat 27 Sep",
    time: "7:30 PM",
    startsAt: "2026-09-27T18:30:00Z",
    location: "Alliance Française, Port Harcourt",
    city: "Port Harcourt",
    price: "₦9,000",
    organizerId: "sessions",
    category: "music",
    attendeeCount: 163,
    attendeeIds: ["tolu", "bisi", "kemi"],
  },
  {
    id: "ibadan-farmers-brunch",
    title: "Farm-to-Table Brunch, Ibadan",
    imageSrc: img("photo-1467003909585-2f8a72700288"),
    date: "Sun 28 Sep",
    time: "11:30 AM",
    startsAt: "2026-09-28T10:30:00Z",
    location: "Bodija, Ibadan",
    city: "Ibadan",
    price: "₦11,000",
    organizerId: "tablenine",
    category: "food",
    attendeeCount: 47,
    attendeeIds: ["ada", "amara", "seyi"],
  },
  {
    id: "product-design-jam",
    title: "Product Design Jam: Portfolio Clinic",
    imageSrc: img("photo-1531403009284-440f080d1e12"),
    date: "Sat 27 Sep",
    time: "10:00 AM",
    startsAt: "2026-09-27T09:00:00Z",
    location: "Yaba, Lagos",
    city: "Lagos",
    organizerId: "builders",
    category: "tech",
    tag: "Free entry",
    attendeeCount: 118,
    attendeeIds: ["chidi", "zara", "femi"],
  },
  {
    id: "owambe-culture-night",
    title: "Owambe: Aso-Ebi Culture Night",
    imageSrc: img("photo-1519671482749-fd09be7ccebf"),
    date: "Sat 4 Oct",
    time: "6:00 PM",
    startsAt: "2026-10-04T17:00:00Z",
    location: "Eko Hotel Convention Centre",
    city: "Lagos",
    price: "₦25,000",
    organizerId: "ceremony",
    category: "culture",
    attendeeCount: 620,
    attendeeIds: ["kemi", "hauwa", "jide", "bisi"],
  },
  {
    id: "beach-volleyball-ph",
    title: "Sunset Beach Volleyball League",
    imageSrc: img("photo-1592656094267-764a45160876"),
    date: "Sun 5 Oct",
    time: "4:00 PM",
    startsAt: "2026-10-05T15:00:00Z",
    location: "Isaac Boro Park, Port Harcourt",
    city: "Port Harcourt",
    organizerId: "hoopsng",
    category: "sports",
    tag: "Free entry",
    attendeeCount: 65,
    attendeeIds: ["seyi", "ifeanyi", "tolu"],
  },
  {
    id: "afrobeats-arena",
    title: "Afrobeats Arena: Detty Season Opener",
    imageSrc: img("photo-1470225620780-dba8ba36b745"),
    date: "Fri 10 Oct",
    time: "9:00 PM",
    startsAt: "2026-10-10T20:00:00Z",
    location: "Eko Atlantic City",
    city: "Lagos",
    price: "₦35,000",
    organizerId: "soundhouse",
    category: "music",
    tag: "Trending",
    tagVariant: "accent",
    attendeeCount: 1240,
    attendeeIds: ["ada", "femi", "zara", "chidi"],
  },
];

const EVENT_DETAILS: Record<string, { summary: string; description: string; venue: EventVenue; ticketTiers?: TicketTier[] }> = {
  "lagos-night-market": { summary: "An after-dark celebration of Lagos food, music, and community.", description: "Move through an open-air night market filled with independent kitchens, live percussion, DJ sets, and local makers. Come hungry, bring friends, and settle into a warm evening at one of Lagos Island’s most loved cultural spaces.", venue: { name: "Freedom Park", address: "1 Hospital Road, Lagos Island", city: "Lagos", latitude: 6.4499, longitude: 3.3958 }, ticketTiers: [{ id: "regular", name: "Regular", price: 12000, description: "General admission" }, { id: "vip", name: "VIP", price: 25000, description: "Priority entry and reserved lounge" }] },
  "build-week-ai": { summary: "A practical day for teams shipping useful AI products.", description: "Join product leaders, engineers, and founders for focused talks, live product critiques, and hands-on sessions about taking AI ideas from prototype to production.", venue: { name: "Ikeja Tech Hub", address: "12 Isaac John Street, GRA Ikeja", city: "Lagos", latitude: 6.5833, longitude: 3.35 } },
  "sunrise-run-club": { summary: "An easy-paced community run through Lekki at sunrise.", description: "Start the morning with a welcoming five-kilometre loop, warm-up drills, hydration, and post-run conversation. Every pace is welcome.", venue: { name: "Lekki Phase 1 Gate", address: "Admiralty Way, Lekki Phase 1", city: "Lagos", latitude: 6.4474, longitude: 3.4723 } },
  "rnb-and-vibes": { summary: "A close-up live R&B session above the Lagos skyline.", description: "Settle in for intimate performances from rising vocalists, a live house band, and a late-night DJ set in a relaxed rooftop setting.", venue: { name: "The Grand Rooftop", address: "Ozumba Mbadiwe Avenue, Victoria Island", city: "Lagos", latitude: 6.4281, longitude: 3.4219 }, ticketTiers: [{ id: "regular", name: "Regular", price: 8500 }, { id: "vip", name: "VIP", price: 18000, description: "Reserved seating and welcome drink" }] },
};

const CITY_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  Lagos: { latitude: 6.5244, longitude: 3.3792 }, Abuja: { latitude: 9.0765, longitude: 7.3986 },
  "Port Harcourt": { latitude: 4.8156, longitude: 7.0498 }, Ibadan: { latitude: 7.3775, longitude: 3.947 },
  Enugu: { latitude: 6.4584, longitude: 7.5464 }, Kano: { latitude: 12.0022, longitude: 8.592 },
};

export interface EventDetails extends OutrazoEvent {
  summary: string;
  description: string;
  venue: EventVenue;
  ticketTiers: TicketTier[];
  organizer: Organizer;
  attendees: Attendee[];
}

export function getEvent(id: string): EventDetails | undefined {
  const event = EVENTS.find((item) => item.id === id);
  if (!event) return undefined;
  const details = EVENT_DETAILS[id];
  const coordinates = CITY_COORDINATES[event.city] ?? CITY_COORDINATES.Lagos;
  const venue = details?.venue ?? {
    name: event.location.split(",")[0] ?? event.location,
    address: event.location,
    city: event.city,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };
  const basePrice = event.price ? Number(event.price.replace(/[^0-9]/g, "")) : 0;
  return {
    ...event,
    summary: details?.summary ?? `A memorable ${event.category} experience bringing people together in ${event.city}.`,
    description: details?.description ?? `Discover ${event.title}, hosted by ${getOrganizer(event.organizerId).name}. Expect a welcoming crowd, thoughtful programming, and a memorable experience in ${event.city}.`,
    venue,
    ticketTiers: details?.ticketTiers ?? (basePrice ? [{ id: "regular", name: "Regular", price: basePrice, description: "General admission" }, { id: "vip", name: "VIP", price: Math.round(basePrice * 2), description: "Priority access" }] : []),
    organizer: event.organizerDetails ?? getOrganizer(event.organizerId),
    attendees: getAttendees(event.attendeeIds),
    status: event.status ?? "upcoming",
  };
}

export const getOrganizerEvents = (organizerId: string) => EVENTS.filter((event) => event.organizerId === organizerId);

export function getRelatedEvents(event: OutrazoEvent, limit = 4, source: OutrazoEvent[] = EVENTS) {
  return source.filter((item) => item.id !== event.id)
    .sort((a, b) => Number(b.category === event.category) + Number(b.city === event.city) - Number(a.category === event.category) - Number(a.city === event.city))
    .slice(0, limit);
}

/** Demo count of people attending tonight's events. */
export const TONIGHT_ATTENDING = EVENTS.filter((e) => e.tonight).reduce(
  (total, event) => total + event.attendeeCount,
  0,
);

export const TONIGHT_EVENTS = EVENTS.filter((e) => e.tonight);

const cityMeta: Record<string, { distance: string; src: string }> = {
  Lagos: { distance: "Nearby", src: img("photo-1618828665011-0abd973f7bb4", 700) },
  Abuja: { distance: "525 km", src: img("photo-1590846406792-0adc7f938f1d", 700) },
  "Port Harcourt": { distance: "436 km", src: img("photo-1449824913935-59a10b8d2000", 700) },
  Ibadan: { distance: "128 km", src: img("photo-1477959858617-67f85cf4f1df", 700) },
};

/** Cities derived from the demo events so counts always match the dataset. */
export const CITIES = Object.entries(cityMeta).map(([name, meta]) => {
  const count = EVENTS.filter((event) => event.city === name).length;
  return {
    name,
    count: `${count} ${count === 1 ? "event" : "events"}`,
    distance: meta.distance,
    src: meta.src,
  };
});

/** Maps a demo event record onto EventCard props. Swap the source, keep the UI. */
export function toEventCardProps(event: OutrazoEvent) {
  const organizer = event.organizerDetails ?? getOrganizer(event.organizerId);
  return {
    eventId: event.id,
    id: event.id,
    title: event.title,
    imageSrc: event.imageSrc,
    date: event.date,
    time: event.time,
    location: event.location,
    price: event.price,
    host: { name: organizer.name },
    community: organizer.community,
    attendees: getAttendees(event.attendeeIds),
    attendeeCount: event.attendeeCount,
    tag: event.tag,
    tagVariant: event.tagVariant,
  };
}
