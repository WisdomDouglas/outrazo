import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

import { useTheme } from "@/design-system/lib/use-theme";
import { cn } from "@/design-system/lib/utils";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/colors", label: "Colors" },
  { to: "/typography", label: "Typography" },
  { to: "/iconography", label: "Iconography" },
  { to: "/components", label: "Components" },
] as const;

export function Shell({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-canvas text-primary-text">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-md px-md py-md lg:px-xl">
          <Link to="/" className="focus-ring type-h3 rounded-sm">
            Outrazo<span className="text-accent">.</span>
          </Link>
          <nav aria-label="Design system sections" className="flex flex-wrap items-center gap-xs">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="focus-ring type-body rounded-full px-md py-sm text-muted-text hover:text-primary-text"
                activeProps={{ className: "bg-accent/15 text-accent" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={toggleTheme}
            className="focus-ring ml-auto inline-flex h-11 items-center gap-sm rounded-full border border-line px-lg type-body text-muted-text hover:text-primary-text"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? (
              <Sun aria-hidden className="size-4" />
            ) : (
              <Moon aria-hidden className="size-4" />
            )}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-md py-2xl lg:px-xl">
        <div className="mb-2xl flex flex-col gap-md">
          <h1 className="type-h1">{title}</h1>
          <p className="type-body-lg max-w-[60ch] text-muted-text">{lede}</p>
        </div>
        {children}
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-[1200px] px-md py-xl type-caption text-subtle-text lg:px-xl">
          Outrazo Forest Tech — preview only. Not shipped to consuming projects.
        </p>
      </footer>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-3xl flex flex-col gap-lg", className)}>
      <div className="flex flex-col gap-xs">
        <h2 className="type-h2">{title}</h2>
        {description ? (
          <p className="type-body max-w-[70ch] text-muted-text">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Specimen({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-sm", className)}>
      <div className="flex flex-wrap items-center gap-md rounded-lg border border-line p-lg">
        {children}
      </div>
      <p className="type-caption text-subtle-text">{label}</p>
    </div>
  );
}

export function Snippet({ code }: { code: string }) {
  return (
    <details className="rounded-md border border-line">
      <summary className="focus-ring type-caption cursor-pointer rounded-md px-md py-sm text-subtle-text">
        Usage
      </summary>
      <pre className="overflow-x-auto px-md pb-md type-caption text-muted-text">
        <code>{code}</code>
      </pre>
    </details>
  );
}
