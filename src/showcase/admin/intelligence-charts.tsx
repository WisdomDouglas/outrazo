// Admin Intelligence charts (Phase 1). Small, honest Recharts visuals over
// server-computed series: daily trend lines and top-N distribution bars.
// Every chart handles three states explicitly — unavailable (no permission),
// empty (no activity in range), and data — and never animates under
// prefers-reduced-motion. Rendered only after mount so server HTML stays
// deterministic.
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/design-system/components/Skeleton";
import type { DayPoint } from "@/showcase/admin/intelligence-aggregates.server";

export const TREND_COLORS = {
  events: "#34d399",
  rsvps: "#10b981",
  users: "#6ee7b7",
  organizers: "#2dd4bf",
  saves: "#5eead4",
  tickets: "#a7f3d0",
  reports: "#f59e0b",
} as const;

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const TOOLTIP_STYLE = {
  backgroundColor: "#0e2219",
  border: "1px solid rgba(190,219,202,.25)",
  borderRadius: 8,
  color: "#e2ece9",
  fontSize: 12,
};

function ChartShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-lg shadow-card">
      <p className="type-body font-semibold">{title}</p>
      <div className="text-muted-text">{children}</div>
    </div>
  );
}

function ChartNote({ children }: { children: React.ReactNode }) {
  return <p className="type-body mt-md text-muted-text">{children}</p>;
}

/** One daily line chart. `points` null means the role may not see it. */
export function TrendMini({
  title,
  points,
  color,
}: {
  title: string;
  points: DayPoint[] | null;
  color: string;
}) {
  const mounted = useMounted();
  const reducedMotion = useReducedMotion();
  return (
    <ChartShell title={title}>
      {points === null ? (
        <ChartNote>Unavailable for your role.</ChartNote>
      ) : points.every((point) => point.count === 0) ? (
        <ChartNote>No activity in this window yet.</ChartNote>
      ) : !mounted ? (
        <Skeleton className="mt-md h-44 w-full rounded-lg" />
      ) : (
        <div className="mt-md h-44" role="img" aria-label={`${title} daily trend`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid stroke="currentColor" strokeOpacity={0.15} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "currentColor", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: string) => value.slice(5)}
                minTickGap={28}
              />
              <YAxis
                tick={{ fill: "currentColor", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={30}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "#e2ece9" }} />
              <Line
                type="monotone"
                dataKey="count"
                name={title}
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={!reducedMotion}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartShell>
  );
}

export interface DistributionRow {
  label: string;
  count: number;
}

/** Horizontal top-N bars with an explicit long-tail bucket. */
export function DistributionBars({
  title,
  rows,
  other,
  truncated,
  visible,
}: {
  title: string;
  rows: DistributionRow[] | null;
  other: number;
  truncated: boolean;
  visible: boolean;
}) {
  const mounted = useMounted();
  const reducedMotion = useReducedMotion();
  const data =
    rows === null
      ? null
      : [
          ...rows,
          ...(other > 0 ? [{ label: `Other (${other} more)`, count: other }] : []),
        ];
  return (
    <ChartShell title={title}>
      {!visible || data === null ? (
        <ChartNote>Unavailable for your role.</ChartNote>
      ) : data.length === 0 ? (
        <ChartNote>Nothing to show yet.</ChartNote>
      ) : !mounted ? (
        <Skeleton className="mt-md h-48 w-full rounded-lg" />
      ) : (
        <>
          <div className="mt-md h-48" role="img" aria-label={title}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="currentColor" strokeOpacity={0.15} horizontal={false} />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: "currentColor", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={118}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "#e2ece9" }}
                  cursor={{ fill: "currentColor", opacity: 0.08 }}
                />
                <Bar dataKey="count" fill="#34d399" radius={[0, 4, 4, 0]} isAnimationActive={!reducedMotion} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {truncated ? (
            <ChartNote>Read capped on a large dataset — counts are a floor, not exact.</ChartNote>
          ) : null}
        </>
      )}
    </ChartShell>
  );
}
