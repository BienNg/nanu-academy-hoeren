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
import {
  ChartPanel,
  ChartTooltip,
  LegendChips,
  Segmented,
  formatCount,
} from "@/components/admin/AdminUi";
import {
  ColumnHeader,
  MetricBand,
  VisitRangeSwitch,
  compactDuration,
  shortDuration,
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

type ChartTab = "time" | "parts" | "sessions" | "mistakes" | "xp";
export type XpLoadState = "loading" | "ready" | "error";
type SeriesKey = Exclude<keyof AdminVisitChartPoint, "label">;

/** Each tab holds series that share a unit, so one axis reads true. */
const CHART_TABS: Record<
  ChartTab,
  {
    label: string;
    icon: string;
    color: string;
    unit: string;
    /** What each slot is keyed on, for the hint under the title. */
    groupedBy?: string;
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
  xp: {
    label: "XP",
    icon: "bolt",
    color: ADMIN_COLORS.amber,
    unit: "XP",
    groupedBy: "when it was awarded",
    empty: "No XP earned in this window.",
    series: [{ key: "xp", name: "XP gained", color: ADMIN_COLORS.amber }],
  },
};

const XP_STATE_MESSAGE: Record<Exclude<XpLoadState, "ready">, string> = {
  loading: "Loading XP…",
  error: "Could not load XP for this student.",
};

const CHART_TAB_OPTIONS = (Object.keys(CHART_TABS) as ChartTab[]).map((key) => ({
  key,
  label: CHART_TABS[key].label,
}));

const SLOT: Record<AdminVisitRange, string> = {
  today: "hour",
  "7d": "day",
  "30d": "day",
  "90d": "day",
  all: "day (or week, for long histories)",
};

function tickInterval(count: number): number {
  if (count <= 8) return 0;
  if (count <= 24) return 2;
  return Math.ceil(count / 8) - 1;
}

function VisitChart({
  data,
  tab,
  xpState,
}: {
  data: readonly AdminVisitChartPoint[];
  tab: ChartTab;
  xpState: XpLoadState;
}) {
  const { series, empty } = CHART_TABS[tab];
  const blocked = tab === "xp" && xpState !== "ready" ? XP_STATE_MESSAGE[xpState] : null;
  if (blocked || !data.some((point) => series.some((entry) => point[entry.key] > 0))) {
    return (
      <p className="flex h-full items-center justify-center px-space-16 text-admin-body-sm text-admin-ink-muted">
        {blocked ?? empty}
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

const MINUTE_KEYS: ReadonlySet<SeriesKey> = new Set(["activeMinutes", "videoMinutes"]);

function formatTotal(key: SeriesKey, total: number): string {
  return MINUTE_KEYS.has(key) ? shortDuration(Math.round(total * 60)) : formatCount(total);
}

/** Window totals for every series on every tab; a card opens its tab. */
function VisitStatCards({
  data,
  tab,
  xpState,
  onSelect,
}: {
  data: readonly AdminVisitChartPoint[];
  tab: ChartTab;
  xpState: XpLoadState;
  onSelect: (tab: ChartTab) => void;
}) {
  const cards = (Object.keys(CHART_TABS) as ChartTab[]).flatMap((key) =>
    CHART_TABS[key].series.map((entry) => ({ tab: key, ...entry })),
  );
  return (
    <ul
      aria-label="Totals in this window"
      className="mt-space-16 grid grid-cols-2 gap-px overflow-hidden rounded-admin-control border border-admin-hairline bg-admin-hairline sm:grid-cols-5"
    >
      {cards.map((card) => {
        const selected = card.tab === tab;
        const pendingXp = card.tab === "xp" && xpState !== "ready";
        const total = data.reduce((sum, point) => sum + point[card.key], 0);
        return (
          <li key={card.key} className="min-w-0">
            <button
              type="button"
              aria-pressed={selected}
              title={`Show ${CHART_TABS[card.tab].label} chart`}
              onClick={() => onSelect(card.tab)}
              className={`flex h-full w-full flex-col items-start px-space-12 py-space-12 text-left outline-none transition-colors focus-visible:shadow-admin-focus ${
                selected ? "bg-admin-subtle" : "bg-admin-card hover:bg-admin-canvas"
              }`}
            >
              <span className="flex min-w-0 items-center gap-space-4 text-admin-label-sm uppercase text-admin-ink-subtle">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: card.color }}
                  aria-hidden="true"
                />
                <span className="truncate">{card.name}</span>
              </span>
              <span className="mt-space-4 font-admin-display text-admin-headline-md tabular-nums text-admin-ink">
                {pendingXp ? (xpState === "loading" ? "…" : "–") : formatTotal(card.key, total)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function VisitCharts({
  data,
  range,
  xpState,
}: {
  data: readonly AdminVisitChartPoint[];
  range: AdminVisitRange;
  xpState: XpLoadState;
}) {
  const [tab, setTab] = useState<ChartTab>("time");
  const active = CHART_TABS[tab];
  return (
    <ChartPanel
      icon={active.icon}
      color={active.color}
      title={`What they did · ${active.label}`}
      hint={`${active.unit} per ${SLOT[range]}, grouped by ${active.groupedBy ?? "when each visit started"}.`}
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
      footer={<VisitStatCards data={data} tab={tab} xpState={xpState} onSelect={setTab} />}
    >
      <VisitChart data={data} tab={tab} xpState={xpState} />
    </ChartPanel>
  );
}

export function OverviewTab({
  range,
  onRange,
  summary,
  chart,
  xpState,
}: {
  range: AdminVisitRange;
  onRange: (range: AdminVisitRange) => void;
  summary: VisitSummary;
  chart: readonly AdminVisitChartPoint[];
  xpState: XpLoadState;
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
      <VisitCharts data={chart} range={range} xpState={xpState} />
    </section>
  );
}
