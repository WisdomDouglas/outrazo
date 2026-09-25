import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/showcase/auth/AuthPage";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [
    { title: "Log in — Outrazo" },
    { name: "description", content: "Log in to Outrazo and pick up where you left off." },
    { property: "og:title", content: "Log in — Outrazo" },
    { property: "og:description", content: "Log in to Outrazo and pick up where you left off." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AuthPage initialMode="signin" />,
});