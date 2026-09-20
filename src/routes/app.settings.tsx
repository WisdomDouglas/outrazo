import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [
    { title: "Settings — Outrazo" }, { name: "description", content: "Your Outrazo app settings." },
    { property: "og:title", content: "Settings — Outrazo" }, { property: "og:description", content: "Manage your Outrazo app settings." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: SettingsPage,
});

function SettingsPage() { return <div className="mx-auto w-full max-w-[760px] px-md py-xl lg:px-xl lg:py-2xl"><h1 className="type-h1">Settings</h1><p className="type-body-lg mt-sm text-muted-text">Your app settings will live here.</p><div className="mt-xl flex min-h-[240px] flex-col items-center justify-center gap-md rounded-lg border border-line bg-card p-xl text-center"><span className="grid size-12 place-items-center rounded-full bg-accent/12 text-accent"><Settings aria-hidden className="size-5" /></span><Badge variant="outline">Coming next</Badge></div></div>; }