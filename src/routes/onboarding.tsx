import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Gamepad2,
  Handshake,
  MapPin,
  Music2,
  Palette,
  PartyPopper,
  Sparkles,
  Trophy,
  Users,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { BrandLogo } from "@/design-system/components/BrandLogo";
import { CategoryChip } from "@/design-system/components/CategoryChip";
import { Skeleton } from "@/design-system/components/Skeleton";
import {
  completeOnboarding,
  loadOnboardingDraft,
  saveOnboardingDraft,
  type OnboardingDraft,
} from "@/showcase/onboarding-storage";
import { EVENTS } from "@/showcase/sample-data";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Make Outrazo yours — Outrazo" },
      {
        name: "description",
        content: "Choose the events, places and experiences you want to discover on Outrazo.",
      },
      { property: "og:title", content: "Make Outrazo yours — Outrazo" },
      {
        property: "og:description",
        content: "Set your interests and start discovering events made for you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingPage,
});

interface SelectableOption {
  id: string;
  label: string;
  icon: LucideIcon;
}

const INTERESTS: SelectableOption[] = [
  { id: "music", label: "Music", icon: Music2 },
  { id: "parties", label: "Parties", icon: PartyPopper },
  { id: "tech", label: "Tech", icon: Wrench },
  { id: "business", label: "Business", icon: BriefcaseBusiness },
  { id: "sports", label: "Sports", icon: Trophy },
  { id: "arts", label: "Arts", icon: Palette },
  { id: "food", label: "Food", icon: UtensilsCrossed },
  { id: "gaming", label: "Gaming", icon: Gamepad2 },
  { id: "networking", label: "Networking", icon: Handshake },
  { id: "workshops", label: "Workshops", icon: Wrench },
  { id: "community", label: "Community", icon: Users },
];

const LOCATIONS = ["Lagos", "Port Harcourt", "Abuja", "Ibadan"];

const PREFERENCES: SelectableOption[] = [
  { id: "free", label: "Free events", icon: Sparkles },
  { id: "near", label: "Near me", icon: MapPin },
  { id: "weekend", label: "This weekend", icon: PartyPopper },
  { id: "popular", label: "Popular events", icon: Users },
  { id: "networking", label: "Networking", icon: Handshake },
  { id: "new", label: "New experiences", icon: Sparkles },
];

const STEP_COPY = [
  {
    title: "What are you into?",
    subtitle: "Pick a few things you want to discover on Outrazo.",
  },
  {
    title: "Where do you want to discover events?",
    subtitle: "Choose the city you want to explore first. You can change this later.",
  },
  {
    title: "What sounds good?",
    subtitle: "Choose the moments and experiences you want to see more often.",
  },
] as const;

function toggleItem(items: string[], id: string) {
  return items.includes(id) ? items.filter((item) => item !== id) : [...items, id];
}

function OnboardingPage() {
  const navigate = useNavigate({ from: "/onboarding" });
  const [draft, setDraft] = useState<OnboardingDraft>({
    interests: [],
    location: "Lagos",
    preferences: [],
    step: 1,
  });
  const [ready, setReady] = useState(false);
  const [validation, setValidation] = useState("");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  useEffect(() => {
    setDraft(loadOnboardingDraft());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveOnboardingDraft(draft);
  }, [draft, ready]);

  const stepCopy = STEP_COPY[draft.step - 1];
  const progressLabel = `${draft.step} / 3`;
  const selectedInterestLabels = useMemo(
    () => INTERESTS.filter((item) => draft.interests.includes(item.id)).map((item) => item.label),
    [draft.interests],
  );

  const updateDraft = (next: Partial<OnboardingDraft>) => {
    setValidation("");
    setDraft((current) => ({ ...current, ...next }));
  };

  const continueFlow = () => {
    if (draft.step === 1 && draft.interests.length === 0) {
      setValidation("Choose at least one interest.");
      return;
    }

    if (draft.step < 3) {
      updateDraft({ step: draft.step + 1 });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    completeOnboarding({
      interests: draft.interests,
      location: draft.location,
      preferences: draft.preferences,
    });
    navigate({ to: "/app" });
  };

  if (!ready) return <OnboardingSkeleton />;

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas text-primary-text">
      <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col px-md lg:px-xl">
        <header className="flex h-20 items-center justify-between gap-md">
          <Link to="/" className="focus-ring rounded-full" aria-label="Outrazo home">
            <BrandLogo />
          </Link>
          <span className="type-caption text-muted-text" aria-label={`Step ${progressLabel}`}>
            {progressLabel}
          </span>
        </header>

        <div className="grid flex-1 items-stretch gap-2xl pb-[112px] lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:pb-xl">
          <section className="flex min-w-0 flex-col justify-start py-xl lg:justify-center lg:py-3xl">
            <div className="mb-2xl flex gap-sm" aria-hidden>
              {[1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    step <= draft.step ? "bg-accent" : "bg-primary-text/10"
                  }`}
                />
              ))}
            </div>

            <div key={draft.step} className="max-w-[680px]">
              <p className="type-caption mb-sm text-accent">STEP {draft.step}</p>
              <h1 className="type-h1">{stepCopy.title}</h1>
              <p className="type-body-lg mt-md max-w-[560px] text-muted-text">{stepCopy.subtitle}</p>

              <div className="mt-xl lg:mt-2xl">
                {draft.step === 1 ? (
                  <InterestStep
                    selected={draft.interests}
                    onToggle={(id) => updateDraft({ interests: toggleItem(draft.interests, id) })}
                  />
                ) : null}

                {draft.step === 2 ? (
                  <LocationStep
                    location={draft.location}
                    open={locationPickerOpen}
                    onOpen={() => setLocationPickerOpen(true)}
                    onSelect={(location) => {
                      updateDraft({ location });
                      setLocationPickerOpen(false);
                    }}
                  />
                ) : null}

                {draft.step === 3 ? (
                  <PreferenceStep
                    selected={draft.preferences}
                    onToggle={(id) => updateDraft({ preferences: toggleItem(draft.preferences, id) })}
                  />
                ) : null}
              </div>

              <div aria-live="polite" className="mt-md min-h-5">
                {validation || (draft.step === 1 && draft.interests.length === 0) ? (
                  <p className="type-caption text-transactional">
                    {validation || "Choose at least one interest."}
                  </p>
                ) : null}
              </div>

              <div className="mt-lg hidden items-center gap-md lg:flex">
                {draft.step > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    leadingIcon={<ArrowLeft aria-hidden className="size-4" />}
                    onClick={() => updateDraft({ step: draft.step - 1 })}
                  >
                    Back
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  disabled={draft.step === 1 && draft.interests.length === 0}
                  onClick={continueFlow}
                >
                  {draft.step === 3 ? "Start exploring" : "Continue"}
                  <ArrowRight aria-hidden className="size-4" />
                </Button>
              </div>
            </div>
          </section>

          <OnboardingVisual
            step={draft.step}
            location={draft.location}
            interestLabels={selectedInterestLabels}
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 px-md py-md backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-[680px] items-center gap-sm">
          {draft.step > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="shrink-0 px-md"
              aria-label="Go back"
              onClick={() => updateDraft({ step: draft.step - 1 })}
            >
              <ArrowLeft aria-hidden className="size-5" />
            </Button>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={draft.step === 1 && draft.interests.length === 0}
            onClick={continueFlow}
          >
            {draft.step === 3 ? "Start exploring" : "Continue"}
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}

function InterestStep({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  return (
    <fieldset>
      <legend className="sr-only">Choose your interests</legend>
      <div className="flex flex-wrap gap-sm">
        {INTERESTS.map(({ id, label, icon: Icon }) => (
          <CategoryChip
            key={id}
            active={selected.includes(id)}
            icon={<Icon aria-hidden className="size-4" />}
            onClick={() => onToggle(id)}
          >
            {label}
          </CategoryChip>
        ))}
      </div>
    </fieldset>
  );
}

function LocationStep({
  location,
  open,
  onOpen,
  onSelect,
}: {
  location: string;
  open: boolean;
  onOpen: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Choose a location</legend>
      <div className="mb-lg flex flex-wrap items-center justify-between gap-md rounded-md border border-line bg-card p-md">
        <span className="inline-flex items-center gap-sm text-accent">
          <MapPin aria-hidden className="size-5" />
          <span className="type-h3 text-primary-text">{location}</span>
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
          Change location
        </Button>
      </div>
      {open ? (
        <div className="grid gap-sm sm:grid-cols-2">
          {LOCATIONS.map((city) => {
            const active = city === location;
            return (
              <Button
                key={city}
                type="button"
                variant={active ? "primary" : "outline"}
                className="w-full justify-between"
                aria-pressed={active}
                onClick={() => onSelect(city)}
              >
                <span className="inline-flex items-center gap-sm">
                  <MapPin aria-hidden className="size-4" />
                  {city}
                </span>
                {active ? <Check aria-hidden className="size-4" /> : null}
              </Button>
            );
          })}
        </div>
      ) : null}
      <p className="type-caption mt-md text-muted-text">Mock locations for now. No location access is requested.</p>
    </fieldset>
  );
}

function PreferenceStep({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  return (
    <fieldset>
      <legend className="sr-only">Choose your event preferences</legend>
      <div className="grid gap-sm sm:grid-cols-2">
        {PREFERENCES.map(({ id, label, icon: Icon }) => (
          <CategoryChip
            key={id}
            active={selected.includes(id)}
            icon={<Icon aria-hidden className="size-4" />}
            className="w-full justify-start"
            onClick={() => onToggle(id)}
          >
            {label}
          </CategoryChip>
        ))}
      </div>
    </fieldset>
  );
}

function OnboardingVisual({
  step,
  location,
  interestLabels,
}: {
  step: number;
  location: string;
  interestLabels: string[];
}) {
  const featured = EVENTS.slice(0, 3);
  const caption = step === 1
    ? interestLabels.length > 0 ? interestLabels.slice(0, 3).join(" · ") : "Your kind of events"
    : step === 2 ? `Discover ${location}` : "Made for your mood";

  return (
    <aside className="relative hidden min-h-[640px] overflow-hidden rounded-lg border border-line bg-card lg:block" aria-label="Event inspiration">
      <img
        src={featured[0].imageSrc}
        alt="Crowd enjoying an Outrazo event"
        className="absolute inset-0 size-full object-cover opacity-70"
      />
      <div className="absolute inset-0 bg-canvas/35" />
      <div className="absolute inset-x-0 bottom-0 bg-canvas/85 p-xl backdrop-blur-sm">
        <p className="type-caption text-accent">DISCOVER WHAT MOVES YOU</p>
        <p className="type-h2 mt-sm">{caption}</p>
        <div className="mt-lg flex gap-sm">
          {featured.slice(1).map((event) => (
            <img
              key={event.id}
              src={event.imageSrc}
              alt=""
              className="aspect-square min-w-0 flex-1 rounded-md border border-line object-cover"
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function OnboardingSkeleton() {
  return (
    <main className="min-h-screen bg-canvas px-md text-primary-text lg:px-xl" aria-busy="true" aria-label="Loading onboarding">
      <div className="mx-auto max-w-[1200px] py-xl">
        <div className="flex justify-between">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-10" />
        </div>
        <div className="mt-section max-w-[680px]">
          <Skeleton className="h-1 w-full" />
          <Skeleton className="mt-2xl h-12 w-4/5" />
          <Skeleton className="mt-md h-6 w-3/4" />
          <div className="mt-xl flex flex-wrap gap-sm">
            {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-11 w-28 rounded-full" />)}
          </div>
        </div>
      </div>
    </main>
  );
}