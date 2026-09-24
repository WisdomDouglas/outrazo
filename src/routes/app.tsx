import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "@/showcase/app-shell/AppShell";
import { useAuth } from "@/showcase/auth/auth-context";

export const Route = createFileRoute("/app")({ component: ProtectedApp });

function ProtectedApp() {
	const navigate = useNavigate({ from: "/app" });
	const { loading, session, profile } = useAuth();

	useEffect(() => {
		if (loading) return;
		if (!session) void navigate({ to: "/login", replace: true });
		else if (!profile || !profile.onboarding_completed) void navigate({ to: "/onboarding", replace: true });
	}, [loading, navigate, profile, session]);

	if (loading || !session || !profile?.onboarding_completed) {
		return <main className="grid min-h-dvh place-items-center bg-canvas text-muted-text" aria-busy="true">Loading your Outrazo...</main>;
	}
	return <AppShell />;
}