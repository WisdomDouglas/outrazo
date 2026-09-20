import { createFileRoute } from "@tanstack/react-router";
import { UserRound } from "lucide-react";

import { Avatar } from "@/design-system/components/Avatar";
import { Badge } from "@/design-system/components/Badge";

export const Route = createFileRoute("/app/profile")({
  head: () => ({ meta: [
    { title: "Profile — Outrazo" }, { name: "description", content: "Your Outrazo profile and preferences." },
    { property: "og:title", content: "Profile — Outrazo" }, { property: "og:description", content: "Manage your Outrazo profile and preferences." },
    { property: "og:type", content: "profile" }, { name: "twitter:card", content: "summary" },
  ] }), component: ProfilePage,
});

function ProfilePage() { return <div className="mx-auto w-full max-w-[760px] px-md py-xl lg:px-xl lg:py-2xl"><div className="flex items-center gap-lg"><Avatar name="Demo User" size="lg" /><div><h1 className="type-h1">Profile</h1><p className="type-body-lg mt-xs text-muted-text">Your profile and preferences</p></div></div><div className="mt-xl flex min-h-[240px] flex-col items-center justify-center gap-md rounded-lg border border-line bg-card p-xl text-center"><span className="grid size-12 place-items-center rounded-full bg-accent/12 text-accent"><UserRound aria-hidden className="size-5" /></span><Badge variant="outline">Coming next</Badge></div></div>; }