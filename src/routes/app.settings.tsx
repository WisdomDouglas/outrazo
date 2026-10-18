import { createFileRoute } from "@tanstack/react-router";
import { Moon, Settings, Sun } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import { useTheme } from "@/design-system/lib/use-theme";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [
    { title: "Settings — Outrazo" }, { name: "description", content: "Manage your Outrazo app appearance." },
    { property: "og:title", content: "Settings — Outrazo" }, { property: "og:description", content: "Manage your Outrazo app appearance." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto w-full max-w-[760px] px-md py-xl lg:px-xl lg:py-2xl">
      <h1 className="type-h1">Settings</h1>
      <p className="type-body-lg mt-sm text-muted-text">Make Outrazo feel right for you.</p>

      <section className="mt-xl rounded-2xl border border-line bg-card p-lg sm:p-xl" aria-labelledby="appearance-title">
        <div className="flex items-start gap-md">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent/12 text-accent">
            <Settings aria-hidden className="size-5" />
          </span>
          <div>
            <h2 id="appearance-title" className="type-h3">Appearance</h2>
            <p className="type-body mt-xs text-muted-text">Choose the theme used across the app.</p>
          </div>
        </div>

        <div className="mt-lg grid grid-cols-2 gap-sm" role="group" aria-label="Appearance mode">
          <Button
            type="button"
            variant={theme === "light" ? "primary" : "outline"}
            className="w-full"
            leadingIcon={<Sun aria-hidden className="size-4" />}
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
          >
            Light mode
          </Button>
          <Button
            type="button"
            variant={theme === "dark" ? "primary" : "outline"}
            className="w-full"
            leadingIcon={<Moon aria-hidden className="size-4" />}
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
          >
            Dark mode
          </Button>
        </div>
        <p className="type-caption mt-md text-muted-text">Your choice is saved on this device.</p>
      </section>
    </div>
  );
}
