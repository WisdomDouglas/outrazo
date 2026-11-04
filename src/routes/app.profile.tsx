import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bookmark, CalendarPlus, LayoutDashboard, Settings } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Avatar } from "@/design-system/components/Avatar";
import { Button } from "@/design-system/components/Button";
import { Input } from "@/design-system/components/Input";
import { useAuth } from "@/showcase/auth/auth-context";
import { updateMyProfile } from "@/showcase/account/account";
import { validateProfileUpdate } from "@/showcase/account/profile-update";
import { NIGERIAN_STATES } from "@/showcase/discovery/locations";

export const Route = createFileRoute("/app/profile")({
  head: () => ({ meta: [
    { title: "Profile — Outrazo" }, { name: "description", content: "Your Outrazo profile and preferences." },
    { property: "og:title", content: "Profile — Outrazo" }, { property: "og:description", content: "Manage your Outrazo profile and preferences." },
    { property: "og:type", content: "profile" }, { name: "twitter:card", content: "summary" },
  ] }), component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, displayName, session, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile?.name ?? "");
    setLocation(profile?.location ?? "");
  }, [profile?.name, profile?.location]);

  const locationKnown = location === "" || NIGERIAN_STATES.some((state) => state.name === location);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    const validated = validateProfileUpdate({ name, location });
    if (!validated.ok) {
      setFieldError(validated.error);
      return;
    }
    const token = session?.access_token ?? null;
    if (!token) {
      setFieldError("Sign in is required.");
      return;
    }
    setFieldError(null);
    setSaving(true);
    try {
      const result = await updateMyProfile({
        data: { name: validated.value.name, location: validated.value.location },
        headers: { Authorization: `Bearer ${token}` },
      });
      setName(result.name);
      setLocation(result.location);
      await refreshProfile();
      setNotice("Profile saved.");
    } catch (caught) {
      setFieldError(caught instanceof Error ? caught.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[760px] px-md py-xl lg:px-xl lg:py-2xl">
      <div className="flex items-center gap-lg">
        <Avatar name={displayName} src={profile?.avatar_url ?? undefined} size="lg" />
        <div>
          <h1 className="type-h1">{displayName}</h1>
          <p className="type-body-lg mt-xs text-muted-text">
            {user?.email ?? "Your profile and preferences"}
          </p>
        </div>
      </div>

      <div className="mt-lg flex flex-wrap gap-sm">
        <Link to="/app/create-event" className="focus-ring rounded-full">
          <Button variant="primary" leadingIcon={<CalendarPlus aria-hidden className="size-4" />}>Post an event</Button>
        </Link>
        <Link to="/app/saved" className="focus-ring rounded-full">
          <Button variant="outline" leadingIcon={<Bookmark aria-hidden className="size-4" />}>Saved events</Button>
        </Link>
        <Link to="/app/organizer" className="focus-ring rounded-full">
          <Button variant="outline" leadingIcon={<LayoutDashboard aria-hidden className="size-4" />}>Organizer dashboard</Button>
        </Link>
        <Link to="/app/settings" className="focus-ring rounded-full">
          <Button variant="ghost" leadingIcon={<Settings aria-hidden className="size-4" />}>Settings</Button>
        </Link>
      </div>

      <dl className="mt-xl grid gap-md rounded-lg border border-line bg-card p-lg sm:grid-cols-2">
        <div><dt className="type-caption text-muted-text">Name</dt><dd className="type-body mt-xs">{profile?.name ?? displayName}</dd></div>
        <div><dt className="type-caption text-muted-text">Email</dt><dd className="type-body mt-xs">{user?.email ?? "Not signed in"}</dd></div>
        <div><dt className="type-caption text-muted-text">Location</dt><dd className="type-body mt-xs">{profile?.location ?? "Lagos"}</dd></div>
        <div><dt className="type-caption text-muted-text">Onboarding</dt><dd className="type-body mt-xs">{profile?.onboarding_completed ? "Completed" : "Not completed"}</dd></div>
      </dl>

      <form onSubmit={save} className="mt-xl flex flex-col gap-md rounded-lg border border-line bg-card p-lg">
        <h2 className="type-h2">Edit profile</h2>
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
          maxLength={60}
          autoComplete="name"
        />
        <div className="flex w-full flex-col gap-sm">
          <label htmlFor="profile-location" className="type-caption text-muted-text">
            State
          </label>
          <div className="flex h-12 items-center rounded-md border border-line bg-card px-md transition-colors focus-within:border-accent">
            <select
              id="profile-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="type-body w-full bg-transparent text-primary-text outline-none"
            >
              <option value="">Choose your state</option>
              {locationKnown ? null : <option value={location}>Keep “{location}”</option>}
              {NIGERIAN_STATES.map((state) => (
                <option key={state.name} value={state.name}>
                  {state.name}
                </option>
              ))}
            </select>
          </div>
          {locationKnown ? null : (
            <p className="type-caption text-subtle-text">
              Your saved location “{location}” is not in the state list — pick a state to update it.
            </p>
          )}
        </div>
        {fieldError ? (
          <p className="type-body text-transactional" role="alert">
            {fieldError}
          </p>
        ) : null}
        {notice ? (
          <p className="type-body text-accent" role="status">
            {notice}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-sm">
          <Button type="submit" loading={saving} disabled={saving}>
            Save changes
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await signOut();
              await navigate({ to: "/", replace: true });
            }}
          >
            Sign out
          </Button>
        </div>
      </form>
    </div>
  );
}
