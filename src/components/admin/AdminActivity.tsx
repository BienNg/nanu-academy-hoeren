"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import {
  adminRangeLabel,
  buildAdminActivityBoard,
  buildAdminActivityStats,
  classKey,
  listAdminClasses,
  type AdminActivityGrain,
  type AdminActivityLeader,
  type AdminActivityPoint,
  type AdminRange,
  type AdminUserRow,
} from "@/lib/admin-overview";

// Activity uses its own indigo / azure / slate palette, matching the analytics reference.
const AXIS = "#777586";
const GRID = "#c7c4d7";
const PRIMARY = "#4338ca";
const STUDY = "#006398";
const PRACTICE = "#0284c7";
const VIDEOS = "#283044";

/** Frosted card surface shared by every panel on this page. */
const GLASS =
  "rounded-2xl border border-[#e2e8f0]/80 bg-white/85 shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_1px_2px_-1px_rgba(15,23,42,0.03)] backdrop-blur-xl";

/** Last visit within this window reads as "Active now". */
const ACTIVE_NOW_MS = 5 * 60 * 1000;

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function formatMinutes(seconds: number): string {
  const safe = Math.max(0, seconds);
  if (safe < 30) return "0 min";
  const minutes = Math.round(safe / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function formatPerActive(total: number, active: number): string {
  if (active <= 0) return "—";
  const value = total / active;
  return value.toLocaleString("en-GB", { maximumFractionDigits: value < 10 ? 1 : 0 });
}

function formatPercent(share: number): string {
  return `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
}

const RELATIVE_UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
];

function formatRelativeTime(iso: string, nowMs: number): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const delta = then - nowMs;
  const abs = Math.abs(delta);
  if (abs < 45_000) return "just now";
  const format = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (abs >= ms) return format.format(Math.round(delta / ms), unit);
  }
  return format.format(Math.round(delta / 60_000), "minute");
}

function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

type PointKey = "activeUsers" | "activeSeconds" | "videosWatched" | "studyRuns" | "practiceRuns" | "clips";

/** The busiest point for one series, or null when the series is all zero. */
function peakPoint(
  data: readonly AdminActivityPoint[],
  key: PointKey,
): AdminActivityPoint | null {
  let best: AdminActivityPoint | null = null;
  for (const point of data) {
    if (point[key] > 0 && (!best || point[key] > best[key])) best = point;
  }
  return best;
}

function SectionHeading({
  icon,
  title,
  meta,
  id,
}: {
  icon: string;
  title: string;
  meta?: ReactNode;
  id: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-space-8">
      <h2
        id={id}
        className="flex items-center gap-space-8 font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface-variant"
      >
        <MaterialIcon name={icon} className="text-[20px] text-[#4338ca]" />
        {title}
      </h2>
      {meta ? (
        <div className="font-label-sm text-label-sm text-outline">{meta}</div>
      ) : null}
    </div>
  );
}

function Sparkline({
  data,
  dataKey,
  color,
}: {
  data: readonly AdminActivityPoint[];
  dataKey: PointKey;
  color: string;
}) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`;
  return (
    <div className="h-12 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={[...data]} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, (max: number) => Math.max(1, max)]} />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type MicroMetric = { icon: string; label: string; value: string };

/** One activity category: headline number, a share bar, two micro metrics, and its trend. */
function CategoryCard({
  icon,
  title,
  hint,
  color,
  value,
  unit,
  badge,
  progress,
  progressLabel,
  metrics,
  trend,
}: {
  icon: string;
  title: string;
  hint: string;
  color: string;
  value: string;
  unit: string;
  badge: string;
  /** 0–1 share drawn as a bar under the headline number. */
  progress: number;
  progressLabel: string;
  metrics: readonly [MicroMetric, MicroMetric];
  trend: { data: readonly AdminActivityPoint[]; key: PointKey; label: string };
}) {
  const peak = peakPoint(trend.data, trend.key);
  return (
    <article
      className={`${GLASS} group flex flex-col justify-between overflow-hidden p-space-16 transition-shadow 2xl:p-space-20 duration-300 hover:shadow-[0_10px_25px_-5px_rgba(67,56,202,0.08),0_8px_10px_-6px_rgba(15,23,42,0.04)]`}
    >
      <div className="flex flex-col gap-space-12">
        <header className="flex items-start justify-between gap-space-8">
          <div className="flex min-w-0 items-center gap-space-8">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${color}14`, color }}
            >
              <MaterialIcon name={icon} className="text-[22px]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                {title}
              </h3>
              <p className="font-body-sm text-[12px] leading-[18px] text-on-surface-variant">
                {hint}
              </p>
            </div>
          </div>
          <span
            className="shrink-0 whitespace-nowrap rounded-full px-space-8 py-0.5 font-label-sm text-[11px] leading-4 font-bold tabular-nums"
            style={{ backgroundColor: `${color}14`, color }}
          >
            {badge}
          </span>
        </header>

        <p className="flex items-baseline gap-space-4 pt-space-4">
          <span className="font-headline-lg text-[1.875rem] font-extrabold leading-9 tracking-[-0.03em] tabular-nums text-on-surface">
            {value}
          </span>
          <span className="font-body-md text-[14px] leading-[22px] text-on-surface-variant">{unit}</span>
        </p>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[#eaedff]"
          role="progressbar"
          aria-label={progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(1, progress) * 100)}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: formatPercent(progress), backgroundColor: color }}
          />
        </div>

        <dl className="grid grid-cols-2 gap-space-8 rounded-xl bg-[#f2f3ff] p-space-8">
          {metrics.map((metric, index) => (
            <div key={metric.label} className="flex min-w-0 flex-col">
              <dt className="flex items-center gap-space-4 font-label-sm text-[11px] leading-4 text-on-surface-variant">
                <MaterialIcon
                  name={metric.icon}
                  className={`text-[14px] ${index === 0 ? "" : "text-outline"}`}
                />
                <span className="truncate">{metric.label}</span>
              </dt>
              <dd
                className="truncate font-label-md text-label-md font-bold tabular-nums"
                style={{ color: index === 0 ? color : undefined }}
              >
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="pt-space-12">
        <div className="flex items-center justify-between gap-space-8 pb-1 font-label-sm text-[11px] leading-4 text-outline">
          <span className="truncate">{trend.label}</span>
          <span className="shrink-0 font-bold" style={{ color: peak ? color : undefined }}>
            {peak ? `Peak ${peak.label}` : "No activity yet"}
          </span>
        </div>
        <Sparkline data={trend.data} dataKey={trend.key} color={color} />
      </div>
    </article>
  );
}

function IconTile({ icon, color = PRIMARY }: { icon: string; color?: string }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: `${color}14`, color }}
    >
      <MaterialIcon name={icon} className="text-[18px]" />
    </div>
  );
}

function PanelHeader({
  icon,
  title,
  hint,
  trailing,
}: {
  icon: string;
  title: string;
  hint: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-space-8">
        <div className="flex min-w-0 items-center gap-space-8">
          <IconTile icon={icon} />
          <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">{title}</h3>
        </div>
        {trailing}
      </div>
      <p className="font-body-sm text-[12px] leading-[18px] text-on-surface-variant sm:pl-10">{hint}</p>
    </div>
  );
}

function LegendChips({ items }: { items: readonly { name: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-space-12 font-label-sm text-[11px] leading-4 text-on-surface-variant">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-space-4">
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

function ChartCard({
  icon,
  title,
  hint,
  trailing,
  children,
}: {
  icon: string;
  title: string;
  hint: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`${GLASS} flex flex-col p-space-20`}>
      <PanelHeader icon={icon} title={title} hint={hint} trailing={trailing} />
      <div className="mt-space-16 h-64 w-full sm:h-72">{children}</div>
    </section>
  );
}

type TooltipRow = {
  name?: string;
  value?: number | string;
  color?: string;
};

function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: readonly TooltipRow[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-[#283044] px-space-12 py-space-8 shadow-xl">
      <p className="font-label-sm text-label-sm font-bold text-[#c3c0ff]">{label}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {payload.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between gap-space-16 font-body-sm text-body-sm text-[#eef0ff]"
          >
            <span className="flex items-center gap-space-8">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden="true"
              />
              {row.name}
            </span>
            <span className="font-semibold tabular-nums">
              {typeof row.value === "number" ? formatCount(row.value) : row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function tickInterval(count: number, grain: AdminActivityGrain): number | "preserveStartEnd" {
  if (grain === "hour") return 3;
  if (count <= 8) return 0;
  if (count <= 31) return 3;
  return 6;
}

function PeopleChart({
  data,
  grain,
}: {
  data: readonly AdminActivityPoint[];
  grain: AdminActivityGrain;
}) {
  const gradientId = `people-${useId().replace(/:/g, "")}`;
  const peak = peakPoint(data, "activeUsers");
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={[...data]} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.28} />
            <stop offset="90%" stopColor={PRIMARY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeOpacity={0.6} strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={tickInterval(data.length, grain)}
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID, strokeDasharray: "3 3" }} />
        <Area
          type="monotone"
          dataKey="activeUsers"
          name="Active people"
          stroke={PRIMARY}
          fill={`url(#${gradientId})`}
          strokeWidth={3}
          strokeLinecap="round"
          activeDot={{ r: 5, stroke: PRIMARY, strokeWidth: 3, fill: "#ffffff" }}
        />
        {peak ? (
          <ReferenceDot
            x={peak.label}
            y={peak.activeUsers}
            r={5}
            fill="#ffffff"
            stroke={PRIMARY}
            strokeWidth={3}
          />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function workBars(grain: AdminActivityGrain) {
  return grain === "hour"
    ? [
        { key: "clips", name: "Clips studied", color: STUDY },
        { key: "practiceRuns", name: "Practice runs", color: PRACTICE },
        { key: "videosWatched", name: "Videos watched", color: VIDEOS },
      ]
    : [
        { key: "studyRuns", name: "Study runs", color: STUDY },
        { key: "practiceRuns", name: "Practice runs", color: PRACTICE },
        { key: "videosWatched", name: "Videos watched", color: VIDEOS },
      ];
}

function WorkChart({
  data,
  grain,
}: {
  data: readonly AdminActivityPoint[];
  grain: AdminActivityGrain;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...data]} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeOpacity={0.6} strokeDasharray="3 6" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={tickInterval(data.length, grain)}
        />
        <YAxis
          allowDecimals={false}
          width={32}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#eaedff", opacity: 0.6 }} />
        {workBars(grain).map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            radius={[3, 3, 0, 0]}
            maxBarSize={grain === "hour" ? 12 : 18}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function formatDayWithWeekday(day: string): string | null {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

const TH = "px-space-16 py-space-12 font-label-sm text-[11px] leading-4 font-semibold uppercase tracking-wider";

function CountPill({ value, peak }: { value: number; peak: boolean }) {
  if (value <= 0) return <span className="text-outline">0</span>;
  return (
    <span
      className={`inline-flex min-w-7 justify-center rounded-md px-space-8 py-0.5 font-semibold tabular-nums ${
        peak ? "bg-[#4338ca] text-white shadow-sm" : "bg-[#eaedff] text-on-surface"
      }`}
    >
      {formatCount(value)}
    </span>
  );
}

function TotalsTable({
  points,
  grain,
}: {
  points: readonly AdminActivityPoint[];
  grain: AdminActivityGrain;
}) {
  const rows = grain === "day" ? [...points].reverse() : points;
  const workKey: PointKey = grain === "hour" ? "clips" : "studyRuns";
  const peaks = {
    people: peakPoint(points, "activeUsers")?.key,
    time: peakPoint(points, "activeSeconds")?.key,
    work: peakPoint(points, workKey)?.key,
    practice: peakPoint(points, "practiceRuns")?.key,
    videos: peakPoint(points, "videosWatched")?.key,
  };
  return (
    <div className={`${GLASS} flex flex-col overflow-hidden`}>
      <div className="bg-[#f2f3ff]/40 p-space-20">
        <PanelHeader
          icon="table_rows"
          title={grain === "hour" ? "Hour by hour" : "Day by day"}
          hint="The same numbers as the charts, for scanning and for screen readers. Each column's peak is highlighted."
        />
      </div>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#f2f3ff] text-on-surface-variant">
            <tr>
              <th className={TH}>{grain === "hour" ? "Vietnam hour" : "Vietnam day"}</th>
              <th className={`${TH} text-center`}>People</th>
              <th className={`${TH} text-center`}>Time</th>
              <th className={`${TH} text-center`}>{grain === "hour" ? "Clips" : "Study runs"}</th>
              <th className={`${TH} text-center`}>Practice runs</th>
              <th className={`${TH} text-center`}>Videos</th>
            </tr>
          </thead>
          <tbody className="font-body-md text-body-md text-on-surface">
            {rows.map((point) => {
              const busy = point.activeUsers > 0 || point.activeSeconds > 0;
              const isPeakTime = peaks.time === point.key;
              return (
                <tr
                  key={point.key}
                  className={`border-t border-[#e2e8f0]/70 transition-colors hover:bg-[#f2f3ff]/60 ${
                    isPeakTime ? "bg-[#eaedff]/60" : ""
                  }`}
                >
                  <td
                    className={`px-space-16 py-space-8 font-label-md text-label-md font-bold ${
                      busy ? "text-[#4338ca]" : "text-on-surface-variant"
                    }`}
                  >
                    {grain === "day" ? (formatDayWithWeekday(point.key) ?? point.label) : point.label}
                  </td>
                  <td
                    className={`px-space-16 py-space-8 text-center tabular-nums ${
                      point.activeUsers > 0 ? "font-bold" : "text-outline"
                    }`}
                  >
                    {formatCount(point.activeUsers)}
                  </td>
                  <td
                    className={`px-space-16 py-space-8 text-center tabular-nums ${
                      isPeakTime
                        ? "font-bold text-[#4338ca]"
                        : point.activeSeconds >= 30
                          ? ""
                          : "text-outline"
                    }`}
                  >
                    {formatMinutes(point.activeSeconds)}
                  </td>
                  <td className="px-space-16 py-space-8 text-center">
                    <CountPill value={point[workKey]} peak={peaks.work === point.key} />
                  </td>
                  <td className="px-space-16 py-space-8 text-center">
                    <CountPill value={point.practiceRuns} peak={peaks.practice === point.key} />
                  </td>
                  <td className="px-space-16 py-space-8 text-center">
                    <CountPill value={point.videosWatched} peak={peaks.videos === point.key} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const RANK_STYLES = [
  "bg-[#4338ca] text-white shadow-sm",
  "bg-[#006398] text-white",
  "bg-[#dae2fd] text-[#131b2e]",
];

const AVATAR_STYLES = [
  "bg-[#e3dfff] text-[#2a14b4]",
  "bg-[#cce5ff] text-[#006398]",
  "bg-[#dae2fd] text-on-surface",
];

function initialOf(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toLocaleUpperCase() : "?";
}

function WorkCount({ value }: { value: number }) {
  if (value <= 0) {
    return <span className="font-label-sm text-label-sm font-semibold text-outline">0</span>;
  }
  return (
    <span className="inline-flex min-w-7 justify-center rounded-full bg-[#eaedff] px-2.5 py-0.5 font-label-sm text-label-sm font-semibold tabular-nums text-on-surface">
      {formatCount(value)}
    </span>
  );
}

function LastSeen({ iso, ms, now }: { iso: string | null; ms: number; now: number | null }) {
  if (!iso || now == null) {
    return <span className="text-outline">—</span>;
  }
  if (now - ms <= ACTIVE_NOW_MS) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6ffbbe]/30 px-space-8 py-0.5 font-label-sm text-label-sm font-bold text-[#00442d]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#10b981]" aria-hidden="true" />
        Active now
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-[#eaedff] px-space-8 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
      {formatRelativeTime(iso, now) ?? "—"}
    </span>
  );
}

function LeadersTable({
  leaders,
  rowsById,
  totalSeconds,
}: {
  leaders: readonly AdminActivityLeader[];
  rowsById: ReadonlyMap<string, AdminUserRow>;
  totalSeconds: number;
}) {
  const now = useNow();
  const topSeconds = leaders[0]?.activeSeconds ?? 0;
  const withActivity = leaders.filter(
    (row) =>
      row.activeSeconds >= 30 || row.videosWatched + row.studyRuns + row.practiceRuns > 0,
  ).length;

  return (
    <div className={`${GLASS} flex flex-col overflow-hidden`}>
      <div className="bg-[#f2f3ff]/40 p-space-20">
        <PanelHeader
          icon="leaderboard"
          title="Most time in the app"
          hint="Every student in this view, ranked by active minutes, then by videos and runs."
        />
      </div>
      {leaders.length === 0 ? (
        <p className="flex items-center gap-space-8 px-space-20 py-space-24 font-body-md text-body-md text-on-surface-variant">
          <MaterialIcon name="person_off" className="text-[20px] text-outline" />
          No students in this view.
        </p>
      ) : (
        <>
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#f2f3ff] text-on-surface-variant">
                <tr>
                  <th className={`${TH} w-16 text-center`}>Rank</th>
                  <th className={`${TH} min-w-[15rem]`}>Student</th>
                  <th className={TH}>Class</th>
                  <th className={`${TH} min-w-[12rem]`}>Active time</th>
                  <th className={`${TH} text-center`}>Videos</th>
                  <th className={`${TH} text-center`}>Study</th>
                  <th className={`${TH} text-center`}>Practice</th>
                  <th className={`${TH} text-center`}>Last seen</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {leaders.map((leader, index) => {
                  const row = rowsById.get(leader.userId);
                  const hasTime = leader.activeSeconds >= 30;
                  const barShare = topSeconds > 0 ? leader.activeSeconds / topSeconds : 0;
                  const timeShare = totalSeconds > 0 ? leader.activeSeconds / totalSeconds : 0;
                  const podium = index < 3 && hasTime;
                  return (
                    <tr
                      key={leader.userId}
                      className="group border-t border-[#e2e8f0]/70 transition-colors hover:bg-[#f2f3ff]/60"
                    >
                      <td className="px-space-16 py-space-12 text-center">
                        {podium ? (
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-label-sm text-label-sm font-bold tabular-nums ${RANK_STYLES[index]}`}
                          >
                            {index + 1}
                          </span>
                        ) : (
                          <span className="font-label-sm text-label-sm font-semibold tabular-nums text-outline">
                            {index + 1}
                          </span>
                        )}
                      </td>
                      <td className="px-space-16 py-space-12">
                        <div className="flex items-center gap-space-12">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-headline-sm text-headline-sm font-bold ${
                              podium
                                ? AVATAR_STYLES[index]
                                : "bg-[#e2e7ff] text-on-surface-variant"
                            }`}
                            aria-hidden="true"
                          >
                            {initialOf(leader.displayName)}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-bold text-on-surface transition-colors group-hover:text-[#4338ca]">
                              {leader.displayName}
                            </span>
                            {row?.email ? (
                              <span className="truncate font-body-sm text-body-sm text-outline">
                                {row.email}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-space-16 py-space-12">
                        <span
                          className={`whitespace-nowrap rounded-md px-space-8 py-1 font-label-sm text-label-sm font-bold ${
                            leader.className
                              ? "bg-[#c3c0ff]/40 text-[#100069]"
                              : "bg-[#eaedff] text-on-surface-variant"
                          }`}
                        >
                          {leader.className ?? "Unassigned"}
                        </span>
                      </td>
                      <td className="px-space-16 py-space-12">
                        <div className="flex w-full max-w-[10rem] flex-col gap-1">
                          <div className="flex items-center justify-between font-label-sm text-label-sm font-semibold">
                            <span
                              className={`tabular-nums ${
                                index === 0 && hasTime
                                  ? "font-bold text-[#4338ca]"
                                  : hasTime
                                    ? "font-bold text-on-surface"
                                    : "text-outline"
                              }`}
                            >
                              {formatMinutes(leader.activeSeconds)}
                            </span>
                            <span className="tabular-nums text-outline">
                              {formatPercent(timeShare)}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-[#eaedff]">
                            <div
                              className={`h-full rounded-full ${
                                index === 0 ? "bg-[#4338ca]" : index < 3 ? "bg-[#006398]" : "bg-[#c7c4d7]"
                              }`}
                              style={{ width: formatPercent(barShare) }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <WorkCount value={leader.videosWatched} />
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <WorkCount value={leader.studyRuns} />
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <WorkCount value={leader.practiceRuns} />
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <LastSeen
                          iso={row?.lastLoginAt ?? null}
                          ms={row?.lastLoginMs ?? 0}
                          now={now}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#e2e8f0]/70 bg-[#f2f3ff]/40 px-space-20 py-space-12 font-body-sm text-body-sm text-on-surface-variant">
            {formatCount(withActivity)} of {formatCount(leaders.length)} students did something
            in this window. The share is each student&apos;s part of all time in the app.
          </div>
        </>
      )}
    </div>
  );
}

function ClassFilter({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: readonly { key: string; label: string; count: number }[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="-mx-space-16 flex items-center gap-space-8 overflow-x-auto px-space-16 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <span className="flex shrink-0 items-center gap-space-4 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-outline">
        <MaterialIcon name="filter_list" className="text-[16px]" />
        Class scope
      </span>
      <div role="tablist" aria-label="Class" className="flex shrink-0 gap-space-8 sm:flex-wrap">
        {options.map((option) => {
          const on = option.key === value;
          return (
            <button
              key={option.key || "unassigned"}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(option.key)}
              className={`inline-flex h-8 shrink-0 items-center gap-space-8 rounded-full pl-space-12 pr-space-4 font-label-sm text-label-sm font-semibold transition-all ${
                on
                  ? "bg-[#4338ca] text-white shadow-[0_2px_8px_rgba(67,56,202,0.3)]"
                  : "border border-outline-variant/40 bg-[#f2f3ff]est text-on-surface-variant hover:-translate-y-px hover:border-[#cbd5e1] hover:text-on-surface"
              }`}
            >
              {option.label}
              <span
                className={`rounded-full px-1.5 py-0.5 tabular-nums ${
                  on ? "bg-white/20 text-white" : "bg-[#eaedff] text-on-surface-variant"
                }`}
              >
                {option.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function learnersWith(
  leaders: readonly AdminActivityLeader[],
  pick: (leader: AdminActivityLeader) => number,
): number {
  return leaders.filter((leader) => pick(leader) > 0).length;
}

export function AdminActivity({
  rows,
  range,
  storeConfigured,
  studyPartsByUser,
  practicePartsByUser,
}: {
  rows: readonly AdminUserRow[];
  range: AdminRange;
  storeConfigured: boolean;
  studyPartsByUser: Readonly<Record<string, number>>;
  practicePartsByUser: Readonly<Record<string, number>>;
}) {
  const [classFilter, setClassFilter] = useState("all");
  const learners = useMemo(
    () => rows.filter((row) => !row.isAdmin && !row.staff),
    [rows],
  );
  const rowsById = useMemo(
    () => new Map(learners.map((row) => [row.userId, row])),
    [learners],
  );
  const classOptions = useMemo(() => listAdminClasses(learners), [learners]);
  const unassignedCount = useMemo(
    () => learners.filter((row) => !classKey(row.className)).length,
    [learners],
  );
  const filteredRows = useMemo(() => {
    if (classFilter === "all") return rows;
    return rows.filter((row) => classKey(row.className) === classFilter);
  }, [rows, classFilter]);
  const activity = useMemo(
    () => buildAdminActivityStats(filteredRows, range),
    [filteredRows, range],
  );
  const partTotals = useMemo(() => {
    let studyParts = 0;
    let practiceParts = 0;
    for (const row of filteredRows) {
      if (row.isAdmin || row.staff) continue;
      studyParts += studyPartsByUser[row.userId] ?? 0;
      practiceParts += practicePartsByUser[row.userId] ?? 0;
    }
    return { studyParts, practiceParts };
  }, [filteredRows, studyPartsByUser, practicePartsByUser]);
  const board = useMemo(
    () => buildAdminActivityBoard(filteredRows, range),
    [filteredRows, range],
  );
  const filterOptions = useMemo(
    () => [
      { key: "all", label: "All classes", count: learners.length },
      ...classOptions.map((option) => ({
        key: option.key,
        label: option.label,
        count: option.count,
      })),
      ...(unassignedCount > 0
        ? [{ key: "", label: "Unassigned", count: unassignedCount }]
        : []),
    ],
    [classOptions, learners.length, unassignedCount],
  );
  const selectedClass =
    classFilter === "all"
      ? null
      : (filterOptions.find((option) => option.key === classFilter)?.label ?? null);
  const window =
    range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;
  const hourly = board.grain === "hour";
  const timeInApp = board.points.reduce((sum, point) => sum + point.activeSeconds, 0);
  const activeShare = activity.users > 0 ? activity.activeUsers / activity.users : 0;
  const timePerActive = activity.activeUsers > 0 ? timeInApp / activity.activeUsers : 0;
  const watchers = learnersWith(board.leaders, (leader) => leader.videosWatched);
  const studiers = learnersWith(board.leaders, (leader) => leader.studyRuns);
  const practicers = learnersWith(board.leaders, (leader) => leader.practiceRuns);
  const shareOfActive = (count: number) =>
    activity.activeUsers > 0 ? count / activity.activeUsers : 0;
  const classScope = selectedClass ? ` in ${selectedClass}` : "";
  const classHint = selectedClass ? ` · ${selectedClass}` : "";
  const byGrain = hourly ? "by hour" : "by day";

  return (
    <main className="flex w-full flex-1 flex-col gap-space-24 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="Engagement"
        title="Activity"
        subtitle={
          hourly
            ? `Who opened the app today${classScope}, by Vietnam hour.`
            : `Who opened the app ${window}${classScope}. Each point is a Vietnam day.`
        }
        trailing={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e2e7ff] px-space-12 py-1 font-label-sm text-label-sm font-semibold text-on-surface-variant">
            <MaterialIcon name="public" className="text-[16px] text-[#4338ca]" />
            Vietnam time · GMT+7
          </span>
        }
      />

      {classOptions.length > 0 || unassignedCount > 0 ? (
        <ClassFilter
          value={classFilter}
          options={filterOptions}
          onSelect={setClassFilter}
        />
      ) : null}

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. This page only counts learners who have
          synced progress to Supabase.
        </div>
      ) : null}

      <section aria-labelledby="activity-glance" className="flex flex-col gap-space-12">
        <SectionHeading
          id="activity-glance"
          icon="grid_view"
          title="At a glance"
          meta={`${adminRangeLabel(range)}${classHint}`}
        />
        <div className="grid grid-cols-1 gap-space-16 sm:grid-cols-2 lg:grid-cols-4 2xl:gap-space-20">
          <CategoryCard
            icon="groups"
            title="People"
            hint={`Seen or practiced ${window}`}
            color={PRIMARY}
            value={formatCount(activity.activeUsers)}
            unit={`of ${formatCount(activity.users)} students`}
            badge={`${formatPercent(activeShare)} active`}
            progress={activeShare}
            progressLabel="Share of students active"
            metrics={[
              { icon: "schedule", label: "Time in app", value: formatMinutes(timeInApp) },
              { icon: "timer", label: "Per active", value: formatMinutes(timePerActive) },
            ]}
            trend={{ data: board.points, key: "activeUsers", label: `Active people ${byGrain}` }}
          />
          <CategoryCard
            icon="play_circle"
            title="Videos"
            hint={`Marked watched ${window}`}
            color={VIDEOS}
            value={formatCount(activity.videosWatched)}
            unit="watched"
            badge={`${formatCount(watchers)} watched`}
            progress={shareOfActive(watchers)}
            progressLabel="Share of active students who watched a video"
            metrics={[
              {
                icon: "slow_motion_video",
                label: "Play time",
                value: formatMinutes(activity.videoSeconds),
              },
              {
                icon: "person",
                label: "Per active",
                value: formatPerActive(activity.videosWatched, activity.activeUsers),
              },
            ]}
            trend={{ data: board.points, key: "videosWatched", label: `Videos ${byGrain}` }}
          />
          <CategoryCard
            icon="menu_book"
            title="Study"
            hint={`Runs finished ${window}`}
            color={STUDY}
            value={formatCount(activity.studyRuns)}
            unit="full runs"
            badge={`${formatCount(studiers)} studied`}
            progress={shareOfActive(studiers)}
            progressLabel="Share of active students who finished a study run"
            metrics={[
              { icon: "auto_stories", label: "Parts", value: formatCount(partTotals.studyParts) },
              {
                icon: "person",
                label: "Per active",
                value: formatPerActive(activity.studyRuns, activity.activeUsers),
              },
            ]}
            trend={{
              data: board.points,
              key: hourly ? "clips" : "studyRuns",
              label: hourly ? "Clips studied by hour" : "Study runs by day",
            }}
          />
          <CategoryCard
            icon="headphones"
            title="Practice"
            hint={`Runs finished ${window}`}
            color={PRACTICE}
            value={formatCount(activity.practiceRuns)}
            unit="runs"
            badge={`${formatCount(practicers)} practiced`}
            progress={shareOfActive(practicers)}
            progressLabel="Share of active students who finished a practice run"
            metrics={[
              { icon: "task_alt", label: "Parts", value: formatCount(partTotals.practiceParts) },
              {
                icon: "person",
                label: "Per active",
                value: formatPerActive(activity.practiceRuns, activity.activeUsers),
              },
            ]}
            trend={{ data: board.points, key: "practiceRuns", label: `Practice runs ${byGrain}` }}
          />
        </div>
      </section>

      <section aria-labelledby="activity-trends" className="flex flex-col gap-space-12">
        <SectionHeading
          id="activity-trends"
          icon="monitoring"
          title={hourly ? "Hourly trends" : "Daily trends"}
        />
        <div className="grid grid-cols-1 gap-space-16 lg:grid-cols-2 2xl:gap-space-20">
          <ChartCard
            icon="groups"
            title={hourly ? "People in the app by hour" : "Daily active people"}
            hint={
              hourly
                ? "Unique students whose visit or last-seen time fell in that Vietnam hour."
                : "Unique students seen or practicing on each Vietnam day."
            }
            trailing={<LegendChips items={[{ name: "Active people", color: PRIMARY }]} />}
          >
            <PeopleChart data={board.points} grain={board.grain} />
          </ChartCard>
          <ChartCard
            icon="stacked_bar_chart"
            title={hourly ? "Work during those hours" : "Study, practice, and videos"}
            hint={
              hourly
                ? "Study clips and practice runs come from visits. Videos use the watched timestamp."
                : "Finished study runs, practice runs, and videos marked watched."
            }
            trailing={<LegendChips items={workBars(board.grain)} />}
          >
            <WorkChart data={board.points} grain={board.grain} />
          </ChartCard>
        </div>
      </section>

      <section aria-labelledby="activity-students" className="flex flex-col gap-space-12">
        <SectionHeading
          id="activity-students"
          icon="leaderboard"
          title="Students"
          meta="Sorted by active minutes"
        />
        <LeadersTable leaders={board.leaders} rowsById={rowsById} totalSeconds={timeInApp} />
      </section>

      <section aria-labelledby="activity-breakdown" className="flex flex-col gap-space-12">
        <SectionHeading
          id="activity-breakdown"
          icon="schedule"
          title={hourly ? "Hourly breakdown" : "Daily breakdown"}
        />
        <TotalsTable points={board.points} grain={board.grain} />
      </section>
    </main>
  );
}
