import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/showcase/app-shell/AppShell";
import { useAuth } from "@/showcase/auth/auth-context";
import { loadOnboardingRecord } from "@/showcase/onboarding-storage";

export const Route = createFileRoute("/app")({ component: ProtectedApp });

function ProtectedApp() {
	const navigate = useNavigate({ from: "/app" });
	const { loading, session, profile } = useAuth();
	const [completedDemo, setCompletedDemo] = useState<boolean | null>(null);

	useEffect(() => {
		setCompletedDemo(Boolean(loadOnboardingRecord()));
	}, []);

	useEffect(() => {
		if (loading || completedDemo === null) return;
		if (!session && !completedDemo) void navigate({ to: "/login", replace: true });
		else if (session && !profile?.onboarding_completed) void navigate({ to: "/onboarding", replace: true });
	}, [completedDemo, loading, navigate, profile, session]);

	if (loading || completedDemo === null || (!session && !completedDemo) || (session && !profile?.onboarding_completed)) {
		return <main className="grid min-h-dvh place-items-center bg-canvas text-muted-text" aria-busy="true">Loading your Outrazo...</main>;
	}
	return <AppShell />;
}