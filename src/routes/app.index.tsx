import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppEventGrid } from "@/showcase/app-shell/AppEventGrid";
import { loadOnboardingRecord, type OnboardingRecord } from "@/showcase/onboarding-storage";
import { EVENTS, type OutrazoEvent } from "@/showcase/sample-data";

const INTEREST_TO_CATEGORY: Record<string, OutrazoEvent["category"]> = {
  music: "music", parties: "parties", tech: "tech", business: "business", sports: "sports", arts: "culture", food: "food", networking: "business", workshops: "tech", community: "culture",
};

function scoreEvent(event: OutrazoEvent, record: OnboardingRecord | null) {
  if (!record) return 0;
  const interestMatch = record.interests.some((interest) => INTEREST_TO_CATEGORY[interest] === event.category);
  return Number(event.city === record.location) * 3 + Number(interestMatch) * 2 + Number(record.preferences.includes("popular")) * event.attendeeCount / 1000;
}

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [
    { title: "Home — Outrazo" },
    { name: "description", content: "Your personalized Outrazo event discovery home." },
    { property: "og:title", content: "Home — Outrazo" },
    { property: "og:description", content: "Discover recommended events and experiences near you." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AppHome,
});

function Section({ title, events, to }: { title: string; events: OutrazoEvent[]; to?: "/app/explore" }) {
  return <section><div className="mb-lg flex items-center justify-between gap-md"><h2 className="type-h2">{title}</h2>{to ? <Link to={to} className="focus-ring type-body inline-flex min-h-11 items-center gap-xs rounded-full text-accent">View all<ArrowRight aria-hidden className="size-4" /></Link> : null}</div><AppEventGrid events={events} /></section>;
}

function AppHome() {
  const [record, setRecord] = useState<OnboardingRecord | null>(null);
  useEffect(() => setRecord(loadOnboardingRecord()), []);
  const recommended = useMemo(() => [...EVENTS].sort((a, b) => scoreEvent(b, record) - scoreEvent(a, record)).slice(0, 3), [record]);
  const soon = useMemo(() => [...EVENTS].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 3), []);
  const popular = useMemo(() => EVENTS.filter((event) => !record || event.city === record.location).sort((a, b) => b.attendeeCount - a.attendeeCount).slice(0, 3), [record]);

  return <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-section px-md py-xl lg:px-xl lg:py-2xl">
    <section><p className="type-body mb-xs text-accent">Good evening, Demo User</p><h1 className="type-h1">Discover what&apos;s happening</h1><p className="type-body-lg mt-md flex items-center gap-xs text-muted-text"><MapPin aria-hidden className="size-5 text-accent" />{record?.location ?? "Lagos"}</p></section>
    <Section title="Recommended for you" events={recommended} to="/app/explore" />
    <Section title="Happening soon" events={soon} />
    <Section title="Popular near you" events={popular.length ? popular : EVENTS.slice(0, 3)} />
  </div>;
}