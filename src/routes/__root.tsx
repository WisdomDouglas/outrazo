import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/design-system/components/Button";

import { useTheme } from "@/design-system/lib/use-theme";
import { AuthProvider } from "@/showcase/auth/auth-context";
import { SavedEventsSync } from "@/showcase/saved/SavedEventsSync";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Outrazo Design System" },
      {
        name: "description",
        content:
          "Forest Tech tokens, typography and components powering Outrazo event discovery.",
      },
      { property: "og:title", content: "Outrazo Design System" },
      {
        property: "og:description",
        content:
          "Forest Tech tokens, typography and components powering Outrazo event discovery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: RootNotFound,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Keep this root providers-only: canvas preview routes (/__mockup,
// /__component) render inside it, so any chrome leaks into every frame.
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Applies the dark-default / light theme class to <html> on every route.
  useTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <SavedEventsSync />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-md text-center text-primary-text">
      <div>
        <p className="type-caption text-accent">404</p>
        <h1 className="type-h1 mt-sm">Page not found.</h1>
        <p className="type-body-lg mt-md text-muted-text">The page you’re looking for is unavailable.</p>
        <Link to="/" className="focus-ring mt-lg inline-flex rounded-full"><Button>Back home</Button></Link>
      </div>
    </main>
  );
}
