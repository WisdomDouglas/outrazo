import type { ReactNode } from "react";

import { EmptyState } from "@/design-system/components/EmptyState";

interface ComingSoonProps {
  icon: ReactNode;
  title: string;
  description: string;
}

/** Honest placeholder for dashboard sections whose backend does not exist yet. */
export function ComingSoon({ icon, title, description }: ComingSoonProps) {
  return <EmptyState icon={icon} title={title} description={description} />;
}
