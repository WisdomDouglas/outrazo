import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bookmark, CalendarPlus, Coins, LayoutDashboard, Settings } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Avatar } from "@/design-system/components/Avatar";
import { Button } from "@/design-system/components/Button";
import { Input } from "@/design-system/components/Input";
import { useAuth } from "@/showcase/auth/auth-context";
import { updateMyProfile } from "@/showcase/account/account";
import { validateProfileUpdate } from "@/showcase/account/profile-update";
import { NIGERIAN_STATES } from "@/showcase/discovery/locations";
import { formatKoboToNaira } from "@/showcase/promotions/promotion-windows";
import { minPointsForNaira, pointsToKobo } from "@/showcase/rewards/reward-points";
import { useMyWallet } from "@/showcase/rewards/use-rewards";

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
    <div className="profile-page">
      <header className="profile-hero">
        <div className="profile-identity">
          <Avatar name={displayName} src={profile?.avatar_url ?? undefined} size="lg" />
          <div className="profile-identity-copy">
            <p className="profile-eyebrow">Your account</p>
            <h1 className="profile-name">{displayName}</h1>
            <p className="profile-email">{user?.email ?? "Your profile and preferences"}</p>
          </div>
        </div>
        {profile?.onboarding_completed ? (
          <span className="profile-complete-badge">
            <span aria-hidden className={profile?.onboarding_completed ? "profile-complete-dot" : "profile-status-dot"} />
            Profile complete
          </span>
        ) : null}
      </header>

      <nav className="profile-shortcuts" aria-label="Profile shortcuts">
        <Link to="/app/create-event" className="profile-shortcut profile-shortcut-primary focus-ring">
          <span className="profile-shortcut-icon"><CalendarPlus aria-hidden className="size-5" /></span>
          <span className="profile-shortcut-copy">
            <span className="profile-shortcut-title">Post an event</span>
            <span className="profile-shortcut-description">Share something with the community</span>
          </span>
          <ArrowRight aria-hidden className="profile-shortcut-arrow size-4" />
        </Link>
        <Link to="/app/saved" className="profile-shortcut focus-ring">
          <span className="profile-shortcut-icon"><Bookmark aria-hidden className="size-5" /></span>
          <span className="profile-shortcut-copy">
            <span className="profile-shortcut-title">Saved events</span>
            <span className="profile-shortcut-description">Your bookmarked plans</span>
          </span>
          <ArrowRight aria-hidden className="profile-shortcut-arrow size-4" />
        </Link>
        <Link to="/app/organizer" className="profile-shortcut focus-ring">
          <span className="profile-shortcut-icon"><LayoutDashboard aria-hidden className="size-5" /></span>
          <span className="profile-shortcut-copy">
            <span className="profile-shortcut-title">Organizer dashboard</span>
            <span className="profile-shortcut-description">Manage your events</span>
          </span>
          <ArrowRight aria-hidden className="profile-shortcut-arrow size-4" />
        </Link>
        <Link to="/app/settings" className="profile-shortcut focus-ring">
          <span className="profile-shortcut-icon"><Settings aria-hidden className="size-5" /></span>
          <span className="profile-shortcut-copy">
            <span className="profile-shortcut-title">Settings</span>
            <span className="profile-shortcut-description">Account and app preferences</span>
          </span>
          <ArrowRight aria-hidden className="profile-shortcut-arrow size-4" />
        </Link>
      </nav>

      <div className="profile-content-grid">
        <aside className="profile-overview-column">
          <section className="profile-panel profile-details-panel" aria-labelledby="profile-details-title">
            <div className="profile-panel-heading">
              <div>
                <p className="profile-eyebrow">Account overview</p>
                <h2 id="profile-details-title" className="type-h3 mt-xs">Your details</h2>
              </div>
              <span className="profile-panel-heading-icon"><LayoutDashboard aria-hidden className="size-4" /></span>
            </div>
            <dl className="profile-details-list">
              <div className="profile-detail-item">
                <dt>Name</dt>
                <dd>{profile?.name ?? displayName}</dd>
              </div>
              <div className="profile-detail-item">
                <dt>Email address</dt>
                <dd>{user?.email ?? "Not signed in"}</dd>
              </div>
              <div className="profile-detail-item">
                <dt>Location</dt>
                <dd>{profile?.location ?? "Lagos"}</dd>
              </div>
              <div className="profile-detail-item">
                <dt>Profile setup</dt>
                <dd>
                  <span className={profile?.onboarding_completed ? "profile-status profile-status-complete" : "profile-status"}>
                    <span aria-hidden className="profile-complete-dot" />
                    {profile?.onboarding_completed ? "Completed" : "Not completed"}
                  </span>
                </dd>
              </div>
            </dl>
          </section>
          <RewardsCard />
        </aside>

        <form onSubmit={save} className="profile-panel profile-edit-panel">
          <div className="profile-panel-heading">
            <div>
              <p className="profile-eyebrow">Personal information</p>
              <h2 className="type-h3 mt-xs">Edit your profile</h2>
              <p className="type-body mt-xs text-muted-text">Keep your details up to date.</p>
            </div>
            <span className="profile-panel-heading-icon"><Settings aria-hidden className="size-4" /></span>
          </div>
          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            maxLength={60}
            autoComplete="name"
          />
          <div className="profile-state-field flex w-full flex-col gap-sm">
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
          <div className="profile-form-actions">
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
    </div>
  );
}

function RewardsCard() {
  const wallet = useMyWallet();
  if (wallet.loading) {
    return (
      <div className="profile-panel profile-rewards-loading mt-xl animate-pulse" aria-label="Loading rewards">
        <div className="h-5 w-32 rounded bg-line" />
        <div className="mt-sm h-8 w-48 rounded bg-line" />
      </div>
    );
  }
  // Fail quiet: the wallet section hides when the rewards tables are absent
  // (migration pending) instead of alarming the user.
  if (wallet.error || !wallet.settings) return null;
  const minPoints = minPointsForNaira(wallet.settings.minWithdrawalNaira, wallet.settings.nairaPerPoint);
  const eligible = wallet.balancePoints >= minPoints;
  return (
    <Link
      to="/app/rewards"
      className="profile-panel profile-rewards-card focus-ring mt-xl transition-colors hover:border-accent"
    >
      <span className="profile-rewards-main">
        <span className="profile-rewards-icon">
          <Coins aria-hidden className="size-5" />
        </span>
        <span className="profile-rewards-copy">
          <span className="profile-eyebrow">Your balance</span>
          <span className="type-h3 mt-xs block">Rewards</span>
          <span className="profile-rewards-balance">
            {wallet.balancePoints.toLocaleString()} pts · ≈{" "}
            {formatKoboToNaira(pointsToKobo(wallet.balancePoints, wallet.settings.nairaPerPoint))}
          </span>
        </span>
      </span>
      <span className="profile-rewards-action">
        <span>{eligible ? "Ready to withdraw" : `${minPoints.toLocaleString()} pts to withdraw`}</span>
        <ArrowRight aria-hidden className="size-4" />
      </span>
    </Link>
  );
}
