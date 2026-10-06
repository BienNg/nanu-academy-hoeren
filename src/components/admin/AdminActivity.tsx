"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  ComposedChart,
  Line,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadActivityWindow, type ActivityWindow } from "@/app/admin/range-data";
import { AdminPageHeader, MaterialIcon, useAdminWindow } from "@/components/admin/AdminShell";
import { StudentDetail } from "@/components/admin/StudentDrawer";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import {
  CARD,
  ChartTooltip,
  Badge,
  CountPill,
  LegendChips,
  Pager,
  ScopeChips,
  SectionHeading,
  TablePanel,
  TH,
  THEAD,
  TR,
  formatCount,
  formatPercent,
  paginate,
  type MicroMetric,
  HeaderChip,
  ChartPanel,
  IconTile,
  Segmented,
  ShareBar,
} from "@/components/admin/AdminUi";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
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

const AXIS = ADMIN_COLORS.axis;
const GRID = ADMIN_COLORS.grid;
const PRIMARY = ADMIN_COLORS.ember;
const STUDY = ADMIN_COLORS.emerald;
const PRACTICE = ADMIN_COLORS.violet;
const VIDEOS = ADMIN_COLORS.violetSoft;

/** Unique students who finished a card, for the hourly/daily people chart. */
const PEOPLE_SERIES = { key: "activeUsers", name: "Active people", label: "Active people" } as const;

/** Students per page in the "Most time in the app" table. */
const LEADER_PAGE_SIZE = 10;

/** Asia/Ho_Chi_Minh is UTC+7 all year. */
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Last visit within this window reads as "Active now". */
const ACTIVE_NOW_MS = 5 * 60 * 1000;

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

/** A short duration: seconds under a minute, minutes and seconds under ten, then minutes. */
function formatShortDuration(seconds: number): string {
  const safe = Math.round(Math.max(0, seconds));
  if (safe < 60) return `${safe} s`;
  if (safe >= 600) return formatMinutes(safe);
  const rest = safe % 60;
  return rest === 0 ? `${safe / 60} min` : `${Math.floor(safe / 60)} min ${rest} s`;
}

function formatStudents(count: number): string {
  return `${formatCount(count)} ${count === 1 ? "student" : "students"}`;
}

function formatPerActive(total: number, active: number): string {
  if (active <= 0) return "—";
  const value = total / active;
  return value.toLocaleString("en-GB", { maximumFractionDigits: value < 10 ? 1 : 0 });
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

type PointKey =
  | "activeUsers"
  | "activeSeconds"
  | "videosWatched"
  | "videoSeconds"
  | "studyRuns"
  | "studyParts"
  | "practiceRuns"
  | "practiceParts"
  | "clips";

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

/** One plotted field of the activity points and how it reads. */
type Series = {
  key: PointKey;
  /** Tooltip and legend name, e.g. "Time in app". */
  name: string;
  /** Chart caption, e.g. "Time in app by hour". */
  label: string;
  /** Seconds, charted and printed as minutes. */
  minutes?: boolean;
  /** Extra tooltip rows worked out from the same point, e.g. "Per active". */
  extras?: (point: AdminActivityPoint) => TooltipExtra[];
  /** A line drawn over the series in the enlarged chart, which then shows the series as fill. */
  overlay?: { name: string; value: (point: AdminActivityPoint) => number };
};

type TooltipExtra = { name: string; value: string };

type SeriesPoint = {
  key: string;
  label: string;
  value: number;
  overlay?: number;
  extras?: TooltipExtra[];
};

function seriesPoints(
  points: readonly AdminActivityPoint[],
  series: Series,
): SeriesPoint[] {
  const unit = (value: number) => (series.minutes ? Math.round(value / 6) / 10 : value);
  return points.map((point) => ({
    key: point.key,
    label: point.label,
    value: unit(point[series.key]),
    overlay: series.overlay ? unit(series.overlay.value(point)) : undefined,
    extras: series.extras?.(point),
  }));
}

/** The shared chart tooltip, with the series' extra rows under its own value. */
function SeriesTooltip({
  active,
  label,
  payload,
  series,
  color,
}: {
  active?: boolean;
  label?: string | number;
  payload?: readonly {
    name?: string;
    value?: number | string;
    color?: string;
    dataKey?: unknown;
    payload?: unknown;
  }[];
  series: Series;
  /** The series colour, for the swatch: a fill-only area reports no stroke colour. */
  color: string;
}) {
  // The overlay line's value is already one of the extras, so only the main row is kept.
  const main = payload?.find((row) => row.dataKey === "value") ?? payload?.[0];
  const point = main?.payload as SeriesPoint | undefined;
  const rows = main ? [{ ...main, color }, ...(point?.extras ?? [])] : payload;
  return (
    <ChartTooltip
      active={active}
      label={label}
      payload={rows}
      formatValue={seriesFormatter(series)}
    />
  );
}

function seriesFormatter(series: Series): (value: number) => string {
  return series.minutes ? (value) => formatMinutes(value * 60) : formatCount;
}

/** The busiest point of a plotted series, or null when it is all zero. */
function seriesPeak(data: readonly SeriesPoint[]): SeriesPoint | null {
  let best: SeriesPoint | null = null;
  for (const point of data) {
    if (point.value > 0 && (!best || point.value > best.value)) best = point;
  }
  return best;
}

function Sparkline({
  data,
  series,
  color,
  compact = false,
}: {
  data: readonly SeriesPoint[];
  series: Series;
  color: string;
  /** Shorter, and no tooltip: a compact card is one click target. */
  compact?: boolean;
}) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`;
  return (
    <div className={`${compact ? "h-8" : "h-12"} w-full`} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={[...data]} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={[0, (max: number) => Math.max(1, max)]} />
          {/* The card clips overflow, so the tooltip floats above the line instead of below. */}
          {compact ? null : (
            <Tooltip
              content={<SeriesTooltip series={series} color={color} />}
              cursor={{ stroke: GRID, strokeDasharray: "3 3" }}
              // Clear the line by the tooltip's height: a label plus one row per value.
              position={{ y: -(44 + 20 * (1 + (data[0]?.extras?.length ?? 0))) }}
              allowEscapeViewBox={{ x: false, y: true }}
              wrapperStyle={{ zIndex: 10, pointerEvents: "none" }}
              isAnimationActive={false}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            name={series.name}
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            fill={`url(#${gradientId})`}
            activeDot={
              compact ? false : { r: 3, stroke: color, strokeWidth: 2, fill: ADMIN_COLORS.card }
            }
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type GlanceId = "people" | "videos" | "study" | "practice";

/** All four cards equal, the one enlarged card, or a compact tile beside it. */
type GlanceMode = "grid" | "hero" | "compact";

type GlanceCardData = {
  id: GlanceId;
  icon: string;
  title: string;
  hint: string;
  color: string;
  value: string;
  unit: string;
  /** 0–1 share drawn as a bar under the headline number. */
  progress: number;
  progressLabel: string;
  /** What the bar is a share of, printed beside it: "all" or "active". */
  progressBase: string;
  /** What the counted students did, after "4 students": "watched", "studied", … */
  progressVerb: string;
  /** The bar's raw numbers, e.g. 4 of 8. */
  progressCount: readonly [number, number];
  metrics: readonly [MicroMetric, MicroMetric];
  points: readonly AdminActivityPoint[];
  /** The chart's default series, then the one the enlarged card's tab switches to. */
  series: readonly [Series, Series];
};

/** Soft spring for the card shuffle: about 450ms with a slight settle. */
const GLANCE_SPRING = { type: "spring", duration: 0.45, bounce: 0.15 } as const;

/** Parts that are about to change fade out this long before the cards move. */
const GLANCE_FADE_OUT_MS = 120;

function glanceMode(id: GlanceId, focus: GlanceId | null): GlanceMode {
  if (!focus) return "grid";
  return id === focus ? "hero" : "compact";
}

/**
 * Content tied to a card's mode. It fades out before the cards move and back in
 * once they settle, so it is never seen stretched mid-animation.
 */
function ModePart({
  leaving,
  animateIn,
  className,
  children,
}: {
  leaving: boolean;
  /** False on first paint, so the page loads without a fade. */
  animateIn: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={className}
      initial={animateIn ? { opacity: 0 } : false}
      animate={
        leaving
          ? { opacity: 0, transition: { duration: GLANCE_FADE_OUT_MS / 1000 } }
          : { opacity: 1, transition: { delay: 0.3, duration: 0.2 } }
      }
    >
      {children}
    </motion.div>
  );
}

/** One activity category. Clicking it enlarges its graph; the others shrink beside it. */
function GlanceCard({
  card,
  mode,
  leaving,
  animateIn,
  grain,
  seriesIndex,
  averageOver,
  onSeries,
  onSelect,
}: {
  card: GlanceCardData;
  mode: GlanceMode;
  leaving: boolean;
  animateIn: boolean;
  grain: AdminActivityGrain;
  /** Which of the card's two series the enlarged chart shows. */
  seriesIndex: 0 | 1;
  /** Leading points the enlarged chart's average covers. */
  averageOver?: number;
  onSeries: (index: 0 | 1) => void;
  onSelect: () => void;
}) {
  const hero = mode === "hero";
  const compact = mode === "compact";
  // Only the enlarged card offers the second series; the small charts keep the default.
  const series = card.series[hero ? seriesIndex : 0];
  const data = seriesPoints(card.points, series);
  const peak = seriesPeak(data);
  const part = { leaving, animateIn };
  return (
    <motion.article
      layout
      transition={GLANCE_SPRING}
      // The enlarged card holds tabs, so it is a plain region that still closes on click.
      role={hero ? "region" : "button"}
      aria-label={hero ? card.title : undefined}
      aria-expanded={hero ? undefined : false}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      className={`${CARD} flex cursor-pointer flex-col overflow-hidden outline-offset-2 transition-colors duration-200 hover:border-admin-border focus-visible:outline-2 ${
        hero ? "lg:row-span-3" : ""
      } ${compact ? "justify-between p-space-12 2xl:p-space-16" : "justify-between p-space-16 2xl:p-space-20"}`}
      style={{ borderRadius: 8, outlineColor: card.color }}
    >
      <span className="sr-only">
        {hero ? "Click or press Enter to show all cards again." : "Click to enlarge this graph."}
      </span>
      <div className={`flex flex-col ${compact ? "h-full justify-between gap-space-8" : "gap-space-12"}`}>
        <header className="flex items-start justify-between gap-space-8">
          <motion.div
            layout="position"
            transition={GLANCE_SPRING}
            className="flex min-w-0 items-center gap-space-8"
          >
            <IconTile icon={card.icon} color={card.color} size="lg" />
            <div className="min-w-0">
              <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">
                {card.title}
              </h3>
              {compact ? null : (
                <ModePart {...part}>
                  <p className="text-admin-body-sm text-admin-ink-subtle">{card.hint}</p>
                </ModePart>
              )}
            </div>
          </motion.div>
          {compact ? (
            // The compact tile keeps the stat its graph plots: time in app, play time, or parts.
            <ModePart {...part} className="min-w-0 text-right">
              <p className="truncate text-admin-label-md text-admin-ink-subtle">
                {card.metrics[0].label}
              </p>
              <p
                className="truncate text-admin-body-md font-semibold tabular-nums"
                style={{ color: card.color }}
              >
                {card.metrics[0].value}
              </p>
            </ModePart>
          ) : null}
        </header>

        <div className={compact ? "flex items-end justify-between gap-space-12" : ""}>
          <motion.p
            layout="position"
            transition={GLANCE_SPRING}
            className={`flex shrink-0 items-baseline gap-space-4 ${compact ? "" : "pt-space-4"}`}
          >
            <span className="font-admin-display text-admin-metric tabular-nums text-admin-ink">
              {card.value}
            </span>
            <span className="text-admin-body-md text-admin-ink-subtle">{card.unit}</span>
          </motion.p>
          {compact ? (
            <ModePart {...part} className="w-24 min-w-0 pb-1">
              <Sparkline data={data} series={series} color={card.color} compact />
            </ModePart>
          ) : null}
        </div>

        {compact ? null : (
          <ModePart {...part} className="flex flex-col gap-space-12">
            <div className="flex flex-col gap-1">
              {/* Who the bar counts, then what share that is and of whom. */}
              <div className="flex items-baseline justify-between gap-space-8 text-admin-label-md text-admin-ink-subtle">
                <span className="min-w-0 truncate">
                  <span className="font-semibold tabular-nums" style={{ color: card.color }}>
                    {formatStudents(card.progressCount[0])}
                  </span>{" "}
                  {card.progressVerb}
                </span>
                <span className="shrink-0">
                  <span className="font-semibold tabular-nums" style={{ color: card.color }}>
                    {formatPercent(card.progress)}
                  </span>{" "}
                  of {card.progressBase}
                </span>
              </div>
              <ShareBar share={card.progress} color={card.color} label={card.progressLabel} />
            </div>
            <dl className="grid grid-cols-2 divide-x divide-admin-hairline rounded-admin-control border border-admin-hairline bg-admin-canvas py-space-8">
              {card.metrics.map((metric, index) => (
                <div key={metric.label} className="flex min-w-0 flex-col px-space-12">
                  <dt className="flex items-center gap-space-4 text-admin-label-md text-admin-ink-subtle">
                    <MaterialIcon name={metric.icon} className="text-[14px]" />
                    <span className="truncate">{metric.label}</span>
                  </dt>
                  <dd
                    className="truncate text-admin-body-md font-semibold tabular-nums text-admin-ink"
                    style={{ color: index === 0 ? card.color : undefined }}
                  >
                    {metric.value}
                  </dd>
                </div>
              ))}
            </dl>
          </ModePart>
        )}
      </div>

      {compact ? null : (
        <ModePart {...part} className={`flex flex-col pt-space-12 ${hero ? "flex-1" : ""}`}>
          <div className="flex items-center justify-between gap-space-8 pb-1 text-admin-label-md text-admin-ink-subtle">
            {hero ? (
              // Tabs sit inside the clickable card: keep their clicks from closing it.
              <div onClick={(event) => event.stopPropagation()}>
                <Segmented
                  ariaLabel={`${card.title} chart`}
                  value={String(seriesIndex)}
                  options={card.series.map((option, index) => ({
                    key: String(index),
                    label: option.name,
                  }))}
                  onSelect={(key) => onSeries(key === "1" ? 1 : 0)}
                />
              </div>
            ) : (
              <span className="truncate">{series.label}</span>
            )}
            <span className="flex shrink-0 items-center gap-space-12">
              {hero && series.overlay ? (
                <>
                  <span className="flex items-center gap-space-4">
                    <span
                      className="h-2.5 w-2.5 rounded-[2px]"
                      style={{ backgroundColor: `${card.color}4d` }}
                      aria-hidden="true"
                    />
                    Total
                  </span>
                  <span className="flex items-center gap-space-4">
                    <span
                      className="h-0.5 w-4 rounded-full"
                      style={{ backgroundColor: card.color }}
                      aria-hidden="true"
                    />
                    {series.overlay.name}
                  </span>
                  {seriesAverage(data, averageOver) > 0 ? (
                    <span className="text-admin-ink-subtle">
                      {formatSeriesAverage(seriesAverage(data, averageOver), series, grain)}
                    </span>
                  ) : null}
                </>
              ) : null}
              <span className="font-semibold" style={{ color: peak ? card.color : undefined }}>
                {peak ? `Peak ${peak.label}` : "No activity yet"}
              </span>
            </span>
          </div>
          {hero ? (
            <div className="relative min-h-[200px] flex-1">
              <div className="absolute inset-0">
                <TrendChart
                  data={data}
                  grain={grain}
                  series={series}
                  color={card.color}
                  average={{ over: averageOver }}
                />
              </div>
            </div>
          ) : (
            <Sparkline data={data} series={series} color={card.color} />
          )}
        </ModePart>
      )}
    </motion.article>
  );
}

/**
 * The four glance cards. Clicking one moves it to the left and enlarges it to a full
 * chart, and the rest stack beside it as compact tiles. Clicking it again restores the row.
 */
function GlanceBoard({
  cards,
  grain,
}: {
  cards: readonly GlanceCardData[];
  grain: AdminActivityGrain;
}) {
  const reduceMotion = useReducedMotion();
  const now = useNow(60_000);
  // Today's average covers the Vietnam hours so far, not the empty hours still to come.
  const averageOver =
    grain === "hour" && now != null
      ? new Date(now + VIETNAM_OFFSET_MS).getUTCHours() + 1
      : undefined;
  /** The card laid out as the hero. */
  const [focus, setFocus] = useState<GlanceId | null>(null);
  /** The card about to be the hero, while the changing parts fade out. */
  const [target, setTarget] = useState<GlanceId | null>(null);
  const [touched, setTouched] = useState(false);
  /** The enlarged card's tab. Every new focus starts on the default series. */
  const [seriesIndex, setSeriesIndex] = useState<0 | 1>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function select(id: GlanceId) {
    const next = target === id ? null : id;
    setTarget(next);
    setTouched(true);
    setSeriesIndex(0);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFocus(next), reduceMotion ? 0 : GLANCE_FADE_OUT_MS);
  }

  const hero = focus ? cards.find((card) => card.id === focus) : undefined;
  const ordered = hero ? [hero, ...cards.filter((card) => card !== hero)] : cards;
  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`grid grid-cols-1 gap-space-16 2xl:gap-space-20 ${
          hero ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]" : "sm:grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {ordered.map((card) => (
          <GlanceCard
            key={card.id}
            card={card}
            mode={glanceMode(card.id, focus)}
            leaving={glanceMode(card.id, focus) !== glanceMode(card.id, target)}
            animateIn={touched}
            grain={grain}
            seriesIndex={seriesIndex}
            averageOver={averageOver}
            onSeries={setSeriesIndex}
            onSelect={() => select(card.id)}
          />
        ))}
      </div>
    </MotionConfig>
  );
}

function tickInterval(count: number, grain: AdminActivityGrain): number | "preserveStartEnd" {
  if (grain === "hour") return 3;
  if (count <= 8) return 0;
  if (count <= 31) return 3;
  return 6;
}

/** The first `count` points' mean: the hours so far today, or every day in the range. */
function seriesAverage(data: readonly SeriesPoint[], count = data.length): number {
  const elapsed = data.slice(0, Math.max(1, count));
  return elapsed.reduce((sum, point) => sum + point.value, 0) / elapsed.length;
}

/** "Avg 21 min per hour", "Avg 2.2 per day". */
function formatSeriesAverage(mean: number, series: Series, grain: AdminActivityGrain): string {
  const value = series.minutes ? formatShortDuration(mean * 60) : formatPerActive(mean, 1);
  return `Avg ${value} per ${grain}`;
}

/** A full area chart for one series: axes, grid, tooltip, and the peak marked. */
function TrendChart({
  data,
  grain,
  series,
  color,
  average,
}: {
  data: readonly SeriesPoint[];
  grain: AdminActivityGrain;
  series: Series;
  color: string;
  /** Draw a flat average line over this many leading points (all when not given). */
  average?: { over?: number };
}) {
  const gradientId = `trend-${useId().replace(/:/g, "")}`;
  const peak = seriesPeak(data);
  const mean = average ? seriesAverage(data, average.over) : 0;
  // With an overlay, the total becomes a plain filled area and the overlay is the one line;
  // the card prints the average beside the legend instead of drawing a second line.
  const filled = Boolean(series.overlay);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={[...data]} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={filled ? 0.4 : 0.18} />
            <stop offset="90%" stopColor={color} stopOpacity={filled ? 0.14 : 0} />
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
          width={series.minutes ? 40 : 32}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={series.minutes ? (value: number) => `${value}m` : undefined}
        />
        <Tooltip
          content={<SeriesTooltip series={series} color={color} />}
          cursor={{ stroke: GRID, strokeDasharray: "3 3" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          name={series.name}
          stroke={filled ? "none" : color}
          fill={`url(#${gradientId})`}
          strokeWidth={2}
          strokeLinecap="round"
          activeDot={{ r: 4, stroke: color, strokeWidth: 2, fill: ADMIN_COLORS.card }}
        />
        {series.overlay ? (
          <Line
            type="monotone"
            dataKey="overlay"
            name={series.overlay.name}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 3, stroke: color, strokeWidth: 2, fill: ADMIN_COLORS.card }}
          />
        ) : null}
        {mean > 0 && !filled ? (
          <ReferenceLine
            y={mean}
            stroke={AXIS}
            strokeDasharray="4 4"
            label={{
              value: formatSeriesAverage(mean, series, grain),
              position: "insideTopRight",
              fill: AXIS,
              fontSize: 11,
            }}
          />
        ) : null}
        {peak ? (
          <ReferenceDot
            x={peak.label}
            y={peak.value}
            r={4}
            fill={ADMIN_COLORS.card}
            stroke={color}
            strokeWidth={2}
          />
        ) : null}
      </ComposedChart>
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
        <Tooltip content={<ChartTooltip />} cursor={{ fill: ADMIN_COLORS.subtle }} />
        {workBars(grain).map((bar) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.name}
            fill={bar.color}
            radius={[2, 2, 0, 0]}
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
    <TablePanel
      icon="table_rows"
      title={grain === "hour" ? "Hour by hour" : "Day by day"}
      hint="The same numbers as the charts, for scanning and for screen readers. Each column's peak is highlighted."
      color={PRIMARY}
    >
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead className={THEAD}>
            <tr>
              <th className={TH}>{grain === "hour" ? "Vietnam hour" : "Vietnam day"}</th>
              <th className={`${TH} text-center`}>People</th>
              <th className={`${TH} text-center`}>Time</th>
              <th className={`${TH} text-center`}>{grain === "hour" ? "Clips" : "Study runs"}</th>
              <th className={`${TH} text-center`}>Practice runs</th>
              <th className={`${TH} text-center`}>Videos</th>
            </tr>
          </thead>
          <tbody className="text-admin-body-md text-admin-ink">
            {rows.map((point) => {
              const busy = point.activeUsers > 0 || point.activeSeconds > 0;
              const isPeakTime = peaks.time === point.key;
              return (
                <tr
                  key={point.key}
                  className={`border-t border-admin-hairline transition-colors hover:bg-admin-canvas ${
                    isPeakTime ? "bg-admin-ember-wash" : ""
                  }`}
                >
                  <td
                    className={`px-space-16 py-space-8 text-admin-body-md font-semibold ${
                      busy ? "text-admin-ink" : "text-admin-ink-subtle"
                    }`}
                  >
                    {grain === "day" ? (formatDayWithWeekday(point.key) ?? point.label) : point.label}
                  </td>
                  <td
                    className={`px-space-16 py-space-8 text-center tabular-nums ${
                      point.activeUsers > 0 ? "font-semibold" : "text-admin-ink-subtle"
                    }`}
                  >
                    {formatCount(point.activeUsers)}
                  </td>
                  <td
                    className={`px-space-16 py-space-8 text-center tabular-nums ${
                      isPeakTime
                        ? "font-semibold text-admin-ember-ink"
                        : point.activeSeconds >= 30
                          ? ""
                          : "text-admin-ink-subtle"
                    }`}
                  >
                    {formatMinutes(point.activeSeconds)}
                  </td>
                  <td className="px-space-16 py-space-8 text-center">
                    <CountPill value={point[workKey]} tone={peaks.work === point.key ? "peak" : "neutral"} />
                  </td>
                  <td className="px-space-16 py-space-8 text-center">
                    <CountPill value={point.practiceRuns} tone={peaks.practice === point.key ? "peak" : "neutral"} />
                  </td>
                  <td className="px-space-16 py-space-8 text-center">
                    <CountPill value={point.videosWatched} tone={peaks.videos === point.key ? "peak" : "neutral"} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </TablePanel>
  );
}

const RANK_STYLES = [
  "bg-admin-ember text-white",
  "bg-admin-ember-wash text-admin-ember-ink ring-1 ring-inset ring-admin-ember/20",
  "bg-admin-ember-wash text-admin-ember-ink ring-1 ring-inset ring-admin-ember/20",
];

/** Podium avatars share the ember wash; the rest stay neutral. */
const PODIUM_AVATAR = "bg-admin-ember-wash text-admin-ember-ink";

function initialOf(name: string): string {
  const letter = name.trim().charAt(0);
  return letter ? letter.toLocaleUpperCase() : "?";
}

function LastSeen({ iso, ms, now }: { iso: string | null; ms: number; now: number | null }) {
  if (!iso || now == null) {
    return <span className="text-admin-ink-subtle">—</span>;
  }
  if (now - ms <= ACTIVE_NOW_MS) {
    return (
      <Badge tone="emerald">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-admin-emerald" aria-hidden="true" />
        Active now
      </Badge>
    );
  }
  return (
    <span className="text-admin-body-sm text-admin-ink-muted">
      {formatRelativeTime(iso, now) ?? "—"}
    </span>
  );
}

function LeadersTable({
  leaders,
  rowsById,
  totalSeconds,
  onSelect,
}: {
  leaders: readonly AdminActivityLeader[];
  rowsById: ReadonlyMap<string, AdminUserRow>;
  totalSeconds: number;
  onSelect: (userId: string) => void;
}) {
  const now = useNow();
  const [page, setPage] = useState(1);
  const paged = paginate(leaders, page, LEADER_PAGE_SIZE);
  const topSeconds = leaders[0]?.activeSeconds ?? 0;
  const withActivity = leaders.filter(
    (row) =>
      row.activeSeconds >= 30 || row.videosWatched + row.studyRuns + row.practiceRuns > 0,
  ).length;

  return (
    <TablePanel
      icon="leaderboard"
      title="Most time in the app"
      hint="Every student in this view, ranked by active minutes, then by videos and runs. Click a student for their detail."
      color={PRIMARY}
    >
      {leaders.length === 0 ? (
        <p className="flex items-center gap-space-8 px-space-20 py-space-24 text-admin-body-md text-admin-ink-muted">
          <MaterialIcon name="person_off" className="text-[20px] text-admin-ink-subtle" />
          No students in this view.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] border-collapse text-left">
              <thead className={THEAD}>
                <tr>
                  <th className={`${TH} w-16 text-center`}>Rank</th>
                  <th className={`${TH} min-w-[15rem]`}>Student</th>
                  <th className={TH}>Class</th>
                  <th className={`${TH} min-w-[12rem]`}>Active time</th>
                  <th className={`${TH} text-center`}>Videos</th>
                  <th className={`${TH} text-center`}>Study</th>
                  <th className={`${TH} text-center`}>Practice</th>
                  <th className={`${TH} text-center`}>Last seen</th>
                  <th className={`${TH} w-12`}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-admin-body-md text-admin-ink">
                {paged.pageItems.map((leader, offset) => {
                  // Rank stays global across pages.
                  const index = paged.start - 1 + offset;
                  const row = rowsById.get(leader.userId);
                  const hasTime = leader.activeSeconds >= 30;
                  const barShare = topSeconds > 0 ? leader.activeSeconds / topSeconds : 0;
                  const timeShare = totalSeconds > 0 ? leader.activeSeconds / totalSeconds : 0;
                  const podium = index < 3 && hasTime;
                  return (
                    <tr
                      key={leader.userId}
                      onClick={() => onSelect(leader.userId)}
                      className={`${TR} cursor-pointer`}
                    >
                      <td className="px-space-16 py-space-12 text-center">
                        {podium ? (
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-admin-badge text-admin-label-md font-semibold tabular-nums ${RANK_STYLES[index]}`}
                          >
                            {index + 1}
                          </span>
                        ) : (
                          <span className="text-admin-label-md font-semibold tabular-nums text-admin-ink-subtle">
                            {index + 1}
                          </span>
                        )}
                      </td>
                      <td className="px-space-16 py-space-12">
                        <div className="flex items-center gap-space-12">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-admin-label-md font-semibold ${
                              podium ? PODIUM_AVATAR : "bg-admin-subtle text-admin-ink-muted"
                            }`}
                            aria-hidden="true"
                          >
                            {initialOf(leader.displayName)}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelect(leader.userId);
                              }}
                              className="truncate rounded text-left font-semibold text-admin-ink transition-colors group-hover:text-admin-cobalt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-cobalt"
                            >
                              {leader.displayName}
                            </button>
                            {row?.email ? (
                              <span className="truncate text-admin-body-sm text-admin-ink-subtle">
                                {row.email}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-space-16 py-space-12">
                        <Badge tone={leader.className ? "cobalt" : "neutral"}>
                          {leader.className ?? "Unassigned"}
                        </Badge>
                      </td>
                      <td className="px-space-16 py-space-12">
                        <div className="flex w-full max-w-[10rem] flex-col gap-1">
                          <div className="flex items-center justify-between text-admin-label-md font-semibold">
                            <span
                              className={`tabular-nums ${
                                index === 0 && hasTime
                                  ? "font-semibold text-admin-ember-ink"
                                  : hasTime
                                    ? "font-semibold text-admin-ink"
                                    : "text-admin-ink-subtle"
                              }`}
                            >
                              {formatMinutes(leader.activeSeconds)}
                            </span>
                            <span className="tabular-nums text-admin-ink-subtle">
                              {formatPercent(timeShare)}
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-admin-subtle">
                            <div
                              className={`h-full rounded-full ${
                                index === 0 ? "bg-admin-ember" : index < 3 ? "bg-admin-ember/60" : "bg-admin-border"
                              }`}
                              style={{ width: formatPercent(barShare) }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <CountPill value={leader.videosWatched} />
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <CountPill value={leader.studyRuns} />
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <CountPill value={leader.practiceRuns} />
                      </td>
                      <td className="px-space-16 py-space-12 text-center">
                        <LastSeen
                          iso={row?.lastLoginAt ?? null}
                          ms={row?.lastLoginMs ?? 0}
                          now={now}
                        />
                      </td>
                      <td className="px-space-12 py-space-12 text-right">
                        <MaterialIcon
                          name="chevron_right"
                          className="text-[20px] text-admin-ink-subtle transition-colors group-hover:text-admin-cobalt"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-space-8 border-t border-admin-hairline bg-admin-canvas px-space-20 py-space-12">
            <Pager
              page={paged.page}
              pageCount={paged.pageCount}
              start={paged.start}
              end={paged.end}
              total={leaders.length}
              noun="students"
              onPage={setPage}
            />
            <p className="text-admin-body-sm text-admin-ink-subtle">
              {formatCount(withActivity)} of {formatCount(leaders.length)} did something in this
              window. The share is each student&apos;s part of all time in the app.
            </p>
          </div>
        </>
      )}
    </TablePanel>
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
  catalog,
  range: serverRange,
  storeConfigured,
  parts: serverParts,
}: {
  rows: readonly AdminUserRow[];
  catalog: readonly AdminCatalogCourse[];
  range: AdminRange;
  storeConfigured: boolean;
  /** Finished study and practice parts, totalled and by chart bucket. */
  parts: ActivityWindow;
}) {
  const loaded = useAdminWindow(serverRange, serverParts, loadActivityWindow);
  const range = loaded.range;
  const { studyPartsByUser, practicePartsByUser, studyPartBuckets, practicePartBuckets } =
    loaded.value;
  const [classFilter, setClassFilter] = useState("all");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const detailRow = detailUserId
    ? (rows.find((row) => row.userId === detailUserId) ?? null)
    : null;
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
  const cardUsers = useMemo(() => {
    const ids = new Set<string>();
    for (const [userId, count] of Object.entries(studyPartsByUser)) {
      if (count > 0) ids.add(userId);
    }
    for (const [userId, count] of Object.entries(practicePartsByUser)) {
      if (count > 0) ids.add(userId);
    }
    return ids;
  }, [studyPartsByUser, practicePartsByUser]);
  const activity = useMemo(
    () => buildAdminActivityStats(filteredRows, range, new Date(), cardUsers),
    [filteredRows, range, cardUsers],
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
    () =>
      buildAdminActivityBoard(filteredRows, range, new Date(), {
        study: studyPartBuckets,
        practice: practicePartBuckets,
      }),
    [filteredRows, range, studyPartBuckets, practicePartBuckets],
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
    <main className="flex w-full flex-1 flex-col gap-space-24 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="Engagement"
        title="Activity"
        subtitle={
          hourly
            ? `Who opened the app today${classScope}, by Vietnam hour.`
            : `Who opened the app ${window}${classScope}. Each point is a Vietnam day.`
        }
        trailing={
          <HeaderChip icon="public">Vietnam time · GMT+7</HeaderChip>
        }
      />

      {classOptions.length > 0 || unassignedCount > 0 ? (
        <ScopeChips
          label="Class scope"
          ariaLabel="Class"
          value={classFilter}
          options={filterOptions}
          onSelect={setClassFilter}
          tone="ember"
        />
      ) : null}

      {!storeConfigured ? (
        <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
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
        <GlanceBoard
          grain={board.grain}
          cards={[
          {
            id: "people",
            icon: "groups",
            title: "People",
            hint: `Finished a card ${window}`,
            color: PRIMARY,
            value: formatCount(activity.activeUsers),
            unit: `of ${formatCount(activity.users)} students`,
            progress: activeShare,
            progressLabel: "Share of students active",
            progressBase: "all",
            progressVerb: "active",
            progressCount: [activity.activeUsers, activity.users],
            metrics: [
              { icon: "schedule", label: "Time in app", value: formatMinutes(timeInApp) },
              { icon: "timer", label: "Per active", value: formatMinutes(timePerActive) },
            ],
            points: board.points,
            series: [
              {
                key: "activeSeconds",
                name: "Time in app",
                label: `Time in app ${byGrain}`,
                minutes: true,
                overlay: {
                  name: "Per active",
                  value: (point) =>
                    point.activeUsers > 0 ? point.activeSeconds / point.activeUsers : 0,
                },
                extras: (point) => [
                  { name: "Active students", value: formatCount(point.activeUsers) },
                  {
                    name: "Per active",
                    value:
                      point.activeUsers > 0
                        ? formatShortDuration(point.activeSeconds / point.activeUsers)
                        : "—",
                  },
                ],
              },
              { key: "activeUsers", name: "Active students", label: `Active students ${byGrain}` },
            ],
          },
          {
            id: "videos",
            icon: "play_circle",
            title: "Videos",
            hint: `Marked watched ${window}`,
            color: VIDEOS,
            value: formatCount(activity.videosWatched),
            unit: "watched",
            progress: shareOfActive(watchers),
            progressLabel: "Share of active students who watched a video",
            progressBase: "active",
            progressVerb: "watched",
            progressCount: [watchers, activity.activeUsers],
            metrics: [
              {
                icon: "slow_motion_video",
                label: "Play time",
                value: formatMinutes(activity.videoSeconds),
              },
              {
                icon: "timer",
                label: "Per video",
                value:
                  activity.videosStarted > 0
                    ? formatShortDuration(activity.startedVideoSeconds / activity.videosStarted)
                    : "—",
              },
            ],
            points: board.points,
            series: [
              {
                key: "videoSeconds",
                name: "Play time",
                label: `Play time ${byGrain}`,
                minutes: true,
                extras: (point) => [
                  {
                    name: "Per video",
                    value:
                      point.videosStarted > 0
                        ? formatShortDuration(point.startedVideoSeconds / point.videosStarted)
                        : "—",
                  },
                  { name: "Videos started", value: formatCount(point.videosStarted) },
                ],
              },
              { key: "videosWatched", name: "Videos watched", label: `Videos watched ${byGrain}` },
            ],
          },
          {
            id: "study",
            icon: "menu_book",
            title: "Study",
            hint: `Runs finished ${window}`,
            color: STUDY,
            value: formatCount(activity.studyRuns),
            unit: "full runs",
            progress: shareOfActive(studiers),
            progressLabel: "Share of active students who finished a study run",
            progressBase: "active",
            progressVerb: "studied",
            progressCount: [studiers, activity.activeUsers],
            metrics: [
              { icon: "auto_stories", label: "Parts", value: formatCount(partTotals.studyParts) },
              {
                icon: "person",
                label: "Per active",
                value: formatPerActive(partTotals.studyParts, activity.activeUsers),
              },
            ],
            points: board.points,
            series: [
              {
                key: "studyParts",
                name: "Parts",
                label: `Study parts ${byGrain}`,
                extras: (point) => [
                  { name: "Per active", value: formatPerActive(point.studyParts, point.activeUsers) },
                ],
              },
              hourly
                ? { key: "clips", name: "Clips studied", label: "Clips studied by hour" }
                : { key: "studyRuns", name: "Study runs", label: "Study runs by day" },
            ],
          },
          {
            id: "practice",
            icon: "headphones",
            title: "Practice",
            hint: `Runs finished ${window}`,
            color: PRACTICE,
            value: formatCount(activity.practiceRuns),
            unit: "runs",
            progress: shareOfActive(practicers),
            progressLabel: "Share of active students who finished a practice run",
            progressBase: "active",
            progressVerb: "practiced",
            progressCount: [practicers, activity.activeUsers],
            metrics: [
              { icon: "task_alt", label: "Parts", value: formatCount(partTotals.practiceParts) },
              {
                icon: "person",
                label: "Per active",
                value: formatPerActive(partTotals.practiceParts, activity.activeUsers),
              },
            ],
            points: board.points,
            series: [
              {
                key: "practiceParts",
                name: "Parts",
                label: `Practice parts ${byGrain}`,
                extras: (point) => [
                  {
                    name: "Per active",
                    value: formatPerActive(point.practiceParts, point.activeUsers),
                  },
                ],
              },
              { key: "practiceRuns", name: "Practice runs", label: `Practice runs ${byGrain}` },
            ],
          },
        ]}
        />
      </section>

      <section aria-labelledby="activity-trends" className="flex flex-col gap-space-12">
        <SectionHeading
          id="activity-trends"
          icon="monitoring"
          title={hourly ? "Hourly trends" : "Daily trends"}
        />
        <div className="grid grid-cols-1 gap-space-16 lg:grid-cols-2 2xl:gap-space-20">
          <ChartPanel
            icon="groups"
            title={hourly ? "People in the app by hour" : "Daily active people"}
            hint={
              hourly
                ? "Unique students whose visit or last-seen time fell in that Vietnam hour."
                : "Unique students seen or practicing on each Vietnam day."
            }
            trailing={<LegendChips items={[{ name: "Active people", color: PRIMARY }]} />}
          >
            <TrendChart
              data={seriesPoints(board.points, PEOPLE_SERIES)}
              grain={board.grain}
              series={PEOPLE_SERIES}
              color={PRIMARY}
            />
          </ChartPanel>
          <ChartPanel
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
          </ChartPanel>
        </div>
      </section>

      <section aria-labelledby="activity-students" className="flex flex-col gap-space-12">
        <SectionHeading
          id="activity-students"
          icon="leaderboard"
          title="Students"
          meta="Sorted by active minutes"
        />
        <LeadersTable
          key={`${classFilter}:${range}`}
          leaders={board.leaders}
          rowsById={rowsById}
          totalSeconds={timeInApp}
          onSelect={setDetailUserId}
        />
      </section>

      <section aria-labelledby="activity-breakdown" className="flex flex-col gap-space-12">
        <SectionHeading
          id="activity-breakdown"
          icon="schedule"
          title={hourly ? "Hourly breakdown" : "Daily breakdown"}
        />
        <TotalsTable points={board.points} grain={board.grain} />
      </section>
      {detailRow ? (
        <StudentDetail
          row={detailRow}
          catalog={catalog}
          onClose={() => setDetailUserId(null)}
        />
      ) : null}
    </main>
  );
}
