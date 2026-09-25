import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/showcase/auth/AuthPage";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [
    { title: "Join Outrazo — Create an account" },
    { name: "description", content: "Create your Outrazo account and find events, people and experiences made for you." },
    { property: "og:title", content: "Join Outrazo — Create an account" },
    { property: "og:description", content: "Create your Outrazo account and discover events made for you." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <AuthPage initialMode="signup" />,
});