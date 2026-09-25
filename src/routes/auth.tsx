import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/showcase/auth/AuthPage";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Sign in — Outrazo" },
    { name: "description", content: "Sign in or join Outrazo to find your people and discover events worth showing up for." },
    { property: "og:title", content: "Sign in — Outrazo" },
    { property: "og:description", content: "Sign in or join Outrazo to discover events worth showing up for." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AuthPage initialMode="signin" />,
});