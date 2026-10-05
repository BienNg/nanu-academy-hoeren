"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartPanel, ChartTooltip, LegendChips, Segmented } from "@/components/admin/AdminUi";
import {
  ColumnHeader,
  MetricBand,
  VisitRangeSwitch,
  compactDuration,
} from "@/components/admin/student-detail/shared";
import type {
  AdminVisitChartPoint,
  AdminVisitRange,
  projectStudentVisits,
} from "@/lib/admin-detail";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import { formatActiveDuration } from "@/lib/progress";

type VisitSummary = ReturnType<typeof projectStudentVisits>["summary"];

const AXIS = ADMIN_COLORS.axis;
const GRID = ADMIN_COLORS.grid;

type ChartTab = "time" | "parts" | "sessions" | "mistakes";
type SeriesKey = Exclude<keyof AdminVisitChartPoint, "label">;

/** Each tab holds series that share a unit, so one axis reads true. */
const CHART_TABS: Record<
  ChartTab,
  {
    label: string;
    icon: string;
    color: string;
    unit: string;
    empty: string;
    series: readonly { key: SeriesKey; name: string; color: string }[];
  }
> = {
  time: {
    label: "Time",
    icon: "schedule",
    color: ADMIN_COLORS.ember,
    unit: "Minutes",
    empty: "No time spent in this window.",
    series: [
      { key: "activeMinutes", name: "Active min", color: ADMIN_COLORS.ember },
      { key: "videoMinutes", name: "Video min", color: ADMIN_COLORS.violet },
    ],
  },
  parts: {
    label: "Parts",
    icon: "layers",
    color: ADMIN_COLORS.emerald,
    unit: "Parts",
    empty: "No study or practice parts finished in this window.",
    series: [
      { key: "studyParts", name: "Study parts", color: ADMIN_COLORS.emerald },
      { key: "practiceParts", name: "Practice parts", color: ADMIN_COLORS.violet },
    ],
  },
  sessions: {
    label: "Sessions",
    icon: "event_repeat",
    color: ADMIN_COLORS.cobalt,
    unit: "Count",
    empty: "No visits in this window.",
    series: [
      { key: "visits", name: "Visits", color: ADMIN_COLORS.cobalt },
      { key: "practiceRuns", name: "Practice runs", color: ADMIN_COLORS.violet },
      { key: "videosWatched", name: "Videos watched", color: ADMIN_COLORS.violetSoft },
      { key: "leftUnfinished", name: "Left unfinished", color: ADMIN_COLORS.crimson },
    ],
  },
  mistakes: {
    label: "Mistakes",
    icon: "error",
    color: ADMIN_COLORS.crimson,
    unit: "Wrong answers",
    empty: "No wrong answers recorded in this window.",
    series: [{ key: "wrongAttempts", name: "Wrong answers", color: ADMIN_COLORS.crimson }],
  },
};

const CHART_TAB_OPTIONS = (Object.keys(CHART_TABS) as ChartTab[]).map((key) => ({
  key,
  label: CHART_TABS[key].label,
}));

const SLOT: Record<AdminVisitRange, string> = {
  today: "hour",
  "7d": "day",
  all: "day (or week, for long histories)",
};

function tickInterval(count: number): number {
  if (count <= 8) return 0;
  if (count <= 24) return 2;
  return Math.ceil(count / 8) - 1;
}

function VisitChart({ data, tab }: { data: readonly AdminVisitChartPoint[]; tab: ChartTab }) {
  const { series, empty } = CHART_TABS[tab];
  if (!data.some((point) => series.some((entry) => point[entry.key] > 0))) {
    return (
      <p className="flex h-full items-center justify-center px-space-16 text-admin-body-sm text-admin-ink-muted">
        {empty}
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={tickInterval(data.length)}
        />
        <YAxis
          allowDecimals={tab === "time"}
          width={40}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: ADMIN_COLORS.subtle }} />
        {series.map((entry) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.name}
            fill={entry.color}
            radius={[2, 2, 0, 0]}
            maxBarSize={20}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function VisitCharts({
  data,
  range,
}: {
  data: readonly AdminVisitChartPoint[];
  range: AdminVisitRange;
}) {
  const [tab, setTab] = useState<ChartTab>("time");
  const active = CHART_TABS[tab];
  return (
    <ChartPanel
      icon={active.icon}
      color={active.color}
      title={`What they did · ${active.label}`}
      hint={`${active.unit} per ${SLOT[range]}, grouped by when each visit started.`}
      trailing={
        <div className="flex flex-col items-end gap-space-8">
          <Segmented
            ariaLabel="Visit chart"
            value={tab}
            options={CHART_TAB_OPTIONS}
            onSelect={setTab}
          />
          <LegendChips items={active.series} />
        </div>
      }
    >
      <VisitChart data={data} tab={tab} />
    </ChartPanel>
  );
}

export function OverviewTab({
  range,
  onRange,
  summary,
  chart,
}: {
  range: AdminVisitRange;
  onRange: (range: AdminVisitRange) => void;
  summary: VisitSummary;
  chart: readonly AdminVisitChartPoint[];
}) {
  return (
    <section aria-label="Activity" className="flex flex-col gap-space-12">
      <ColumnHeader title="Activity" action={<VisitRangeSwitch range={range} onChange={onRange} />} />
      <MetricBand
        items={[
          {
            label: "Active time",
            value: compactDuration(formatActiveDuration(summary.activeSeconds)),
            detail: `${summary.visitCount} ${summary.visitCount === 1 ? "visit" : "visits"}`,
          },
          { label: "Clips studied", value: String(summary.clipCount) },
          {
            label: "Practice clips",
            value: String(summary.exercisesCompleted),
            detail: `${summary.listeningRuns} practice ${summary.listeningRuns === 1 ? "run" : "runs"}`,
          },
          {
            label: "Video",
            value: compactDuration(formatActiveDuration(summary.videoSeconds)),
            detail: `${summary.videosWatched} marked watched`,
          },
        ]}
      />
      <VisitCharts data={chart} range={range} />
    </section>
  );
}
