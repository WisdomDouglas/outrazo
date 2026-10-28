import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { ComingSoon } from "@/showcase/organizer/ComingSoon";

export const Route = createFileRoute("/app/organizer/settings")({
  head: () => ({ meta: [
    { title: "Settings — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Organizer settings, coming soon." },
  ] }),
  component: OrganizerSettingsPage,
});

function OrganizerSettingsPage() {
  return (
    <ComingSoon
      icon={<Settings aria-hidden className="size-5" />}
      title="Organizer settings live here soon."
      description="Organizer profile settings arrive in a future release. Account settings stay under Profile for now."
    />
  );
}
