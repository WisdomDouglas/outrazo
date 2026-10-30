import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bookmark, CalendarPlus, LayoutDashboard, Settings, UserRound } from "lucide-react";

import { Avatar } from "@/design-system/components/Avatar";
import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { useAuth } from "@/showcase/auth/auth-context";

export const Route = createFileRoute("/app/profile")({
  head: () => ({ meta: [
    { title: "Profile — Outrazo" }, { name: "description", content: "Your Outrazo profile and preferences." },
    { property: "og:title", content: "Profile — Outrazo" }, { property: "og:description", content: "Manage your Outrazo profile and preferences." },
    { property: "og:type", content: "profile" }, { name: "twitter:card", content: "summary" },
  ] }), component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, displayName, signOut } = useAuth();

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

      <div className="mt-xl flex min-h-[200px] flex-col items-center justify-center gap-md rounded-lg border border-line bg-card p-xl text-center">
        <span className="grid size-12 place-items-center rounded-full bg-accent/12 text-accent"><UserRound aria-hidden className="size-5" /></span>
        <Badge variant="outline">Coming next</Badge>
        <p className="type-body text-muted-text">Profile editing and saved preferences arrive with the next release.</p>
        <Button variant="outline" onClick={async () => { await signOut(); await navigate({ to: "/", replace: true }); }}>Sign out</Button>
      </div>
    </div>
  );
}
