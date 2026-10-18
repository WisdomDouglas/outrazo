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
import { supabase } from "@/integrations/supabase/external-client";
import { useAuth } from "@/showcase/auth/auth-context";
import explorer from "@/assets/auth-explorer.webp";
import onboardingInterests from "@/assets/onboarding-interests.webp";
import onboardingLocation from "@/assets/onboarding-location.webp";
import onboardingPreferences from "@/assets/onboarding-preferences.webp";

const STEP_ART: Record<number, { src: string; label: string }> = {
  1: { src: onboardingInterests, label: "Character tapping a floating music note, with a game controller and artist palette nearby" },
  2: { src: onboardingLocation, label: "Character holding a city map and pointing at a map pin" },
  3: { src: onboardingPreferences, label: "Character placing an event ticket onto a weekend calendar" },
};

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
  const { session, profile, loading: authLoading, refreshProfile } = useAuth();
  const [draft, setDraft] = useState<OnboardingDraft>({
    interests: [],
    location: "Lagos",
    preferences: [],
    step: 1,
  });
  const [ready, setReady] = useState(false);
  const [validation, setValidation] = useState("");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && session && profile?.onboarding_completed) void navigate({ to: "/app", replace: true });
  }, [authLoading, navigate, profile?.onboarding_completed, session]);

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

  const continueFlow = async () => {
    if (draft.step === 1 && draft.interests.length === 0) {
      setValidation("Choose at least one interest.");
      return;
    }

    if (draft.step < 3) {
      updateDraft({ step: draft.step + 1 });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const selections = {
      interests: draft.interests,
      location: draft.location,
      preferences: draft.preferences,
    };
    setSaving(true);
    try {
      if (session?.user) {
        // `preferences` stays local for now; the profiles table has no column for it yet.
        const { error } = await supabase.from("profiles").upsert({
          id: session.user.id,
          name: profile?.name ?? (session.user.user_metadata["name"] as string | undefined) ?? null,
          email: session.user.email ?? null,
          location: selections.location,
          onboarding_completed: true,
        });
        if (error) throw error;
      }
      // Save the choices before routing so the home feed has them on first render.
      completeOnboarding(selections);
      if (session?.user) await refreshProfile();
      await navigate({ to: "/app" });
    } catch (caught) {
      setValidation(caught instanceof Error ? caught.message : "We could not save your preferences. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <OnboardingSkeleton />;

  return (
    <main className="onboarding-page min-h-dvh overflow-x-hidden bg-canvas text-primary-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1280px] flex-col px-md sm:px-lg lg:px-xl">
        <header className="onboarding-header flex min-h-16 items-center justify-between gap-md py-sm sm:min-h-20">
          <Link to="/" className="focus-ring rounded-full" aria-label="Outrazo home">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-md">
            <span className="hidden type-caption text-muted-text sm:inline" aria-label={`Step ${progressLabel}`}>
              {progressLabel}
            </span>
            {[1, 2, 3].map((step) => (
              <span key={step} className={`onboarding-progress-dot ${step <= draft.step ? "bg-accent" : "bg-primary-text/15"}`} />
            ))}
          </div>
        </header>

        <div className="onboarding-layout grid flex-1 items-center gap-lg pb-md lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)] lg:gap-2xl lg:pb-xl">
          <section className="flex min-w-0 flex-col justify-center py-md sm:py-lg lg:py-xl">
            <div className="mb-lg flex gap-xs sm:mb-xl sm:gap-sm" aria-hidden>
              {[1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={`onboarding-progress-bar h-1 flex-1 rounded-full transition-colors ${
                    step <= draft.step ? "bg-accent" : "bg-primary-text/10"
                  }`}
                />
              ))}
            </div>

            <div key={draft.step} className="onboarding-step max-w-[720px]">
              <div className="flex items-center gap-sm">
                <span className="onboarding-step-number">0{draft.step}</span>
                <p className="type-caption text-accent">YOUR OUTRAZO VIBE</p>
              </div>
              <h1 className="type-h1 mt-sm max-w-[650px] text-balance">{stepCopy.title}</h1>
              <p className="type-body-lg mt-sm max-w-[560px] text-muted-text sm:mt-md">{stepCopy.subtitle}</p>

              <div className="onboarding-options mt-lg sm:mt-xl">
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

              <div aria-live="polite" className="mt-sm min-h-5">
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
                  onClick={() => void continueFlow()}
                  disabled={saving || (draft.step === 1 && draft.interests.length === 0)}
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

      <div className="onboarding-mobile-actions border-t border-line bg-canvas/95 px-md py-sm backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-[720px] items-center gap-sm">
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
            onClick={() => void continueFlow()}
            disabled={saving || (draft.step === 1 && draft.interests.length === 0)}
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
            className="onboarding-chip"
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
            className="onboarding-chip w-full justify-start"
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
    <aside className="onboarding-visual relative flex min-h-[190px] flex-col justify-between overflow-hidden rounded-lg border border-line bg-card p-lg lg:min-h-[520px] lg:p-xl" aria-label="Event inspiration">
      <div className="relative z-10 flex items-center justify-between gap-md">
        <p className="type-caption font-semibold text-accent">DISCOVER WHAT MOVES YOU</p>
        <span className="type-caption text-muted-text">{draftLabel(step)}</span>
      </div>
      <div className="onboarding-art-stage relative min-h-0 flex-1" aria-hidden="true">
        <div className="onboarding-art-ring" />
        <img
          key={step}
          src={STEP_ART[step]?.src ?? explorer}
          alt=""
          width={1024}
          height={1024}
          className="onboarding-art-character"
        />
        <img src={featured[0].imageSrc} alt="" className="onboarding-art-event onboarding-art-event--first" />
        <img src={featured[1].imageSrc} alt="" className="onboarding-art-event onboarding-art-event--second" />
      </div>
      <div className="relative z-10 border-t border-line pt-md lg:pt-lg">
        <p key={caption} className="onboarding-step type-h2 text-balance">{caption}</p>
        <p className="type-caption mt-sm text-muted-text">A city full of moments, made yours.</p>
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

function draftLabel(step: number) {
  return step === 1 ? "INTERESTS" : step === 2 ? "YOUR CITY" : "YOUR MOOD";
}