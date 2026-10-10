"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, animate, motion, useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MaterialIcon } from "@/components/admin/AdminShell";
import {
  Badge,
  CARD,
  ChartPanel,
  ChartTooltip,
  IconTile,
  LegendChips,
  Pager,
  SectionHeading,
  Segmented,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
  paginate,
} from "@/components/admin/AdminUi";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import {
  ACTIVATION_HOURS,
  ACTIVE_DAYS,
  CATCH_UP_DAYS,
  CONTINUE_DAYS,
  DROP_OFF_MIN_STARTERS,
  ON_PACE_DAYS,
  PACE_PARTS_PER_DAY,
  RETENTION_WEEKS,
  buildLearningBoard,
  buildLearningCourseMap,
  learningLearner,
  type ActivationBoard,
  type CatchUpBoard,
  type ContinuationBoard,
  type DropOffRow,
  type LearningBucket,
  type LearningWindow,
  type PaceBoard,
  type PaceRatioBucket,
  type PaceStudent,
  type PaceTrendPoint,
  type RetentionBoard,
  type RetentionCell,
  type WeeklyPoint,
} from "@/lib/admin-learning";
import {
  adminRangeDays,
  adminRangeLabel,
  classKey,
  type AdminRange,
  type AdminUserRow,
} from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";

const AXIS = ADMIN_COLORS.axis;
const GRID = ADMIN_COLORS.grid;
/** Course progress and pace. */
const PACE = ADMIN_COLORS.emerald;
/** Signups, habits, and coming back. */
const ENGAGE = ADMIN_COLORS.ember;
const ALERT = ADMIN_COLORS.crimson;
/** Outside the target, but not a failure: later than 48 hours, later than 7 days. */
const LATE = ADMIN_COLORS.border;
const NEUTRAL = ADMIN_COLORS.inkFaint;

/** Status ramp for the pace ratio, from far behind to in sync. */
const TONE_COLORS: Record<PaceRatioBucket["tone"], string> = {
  critical: ADMIN_COLORS.crimson,
  serious: ADMIN_COLORS.ember,
  warning: ADMIN_COLORS.amber,
  fair: "#34d399",
  good: ADMIN_COLORS.emerald,
};

const TABLE_PAGE_SIZE = 10;
const DROP_OFF_PREVIEW = 10;

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

function pct(share: number | null | undefined, digits = 0): string {
  if (share == null || Number.isNaN(share)) return "—";
  return `${(share * 100).toLocaleString("en-GB", { maximumFractionDigits: digits })}%`;
}

function formatWait(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toLocaleString("en-GB", { maximumFractionDigits: hours < 10 ? 1 : 0 })} h`;
  const days = hours / 24;
  return `${days.toLocaleString("en-GB", { maximumFractionDigits: 1 })} days`;
}

function formatDays(days: number | null): string {
  if (days == null) return "—";
  const value = days.toLocaleString("en-GB", { maximumFractionDigits: 1 });
  return `${value} ${days === 1 ? "day" : "days"}`;
}

function formatRatio(ratio: number | null): string {
  if (ratio == null) return "—";
  return `${ratio.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function formatIsoDay(day: string): string {
  if (!day) return "—";
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? day : SHORT_DAY.format(date);
}

function formatAgo(ms: number | null, now: number): string {
  if (ms == null) return "Never";
  const minutes = Math.max(0, (now - ms) / 60_000);
  if (minutes < 60) return "Within the hour";
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

function partName(row: Pick<DropOffRow, "kind" | "partNumber">): string {
  return `${row.kind === "study" ? "Study" : "Practice"} part ${row.partNumber}`;
}

/* ------------------------------------------------------------------ */
/* Motion helpers                                                      */
/* ------------------------------------------------------------------ */

/** Counts up to `target` when it first shows and whenever it changes. */
function useCountUp(target: number, duration = 0.9): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(from.current, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setValue,
    });
    from.current = target;
    return () => controls.stop();
  }, [target, duration, reduce]);
  return reduce ? target : value;
}

function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  return <>{format(useCountUp(value))}</>;
}

/** Fades and lifts a block in as it scrolls into view. */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

/** A stat tile whose number counts up. `value` null prints a dash. `tip` is how the number is worked out, shown on hover. */
function MetricTile({
  icon,
  label,
  value,
  format,
  caption,
  tip,
  color,
  children,
}: {
  icon: string;
  label: string;
  value: number | null;
  format: (value: number) => string;
  caption: ReactNode;
  tip?: string;
  color: string;
  children?: ReactNode;
}) {
  const tipId = useId();
  return (
    <article className={`${CARD} flex flex-col gap-space-12 p-space-16 transition-colors duration-200 hover:border-admin-border 2xl:p-space-20`}>
      <div className="flex items-center gap-space-8">
        <IconTile icon={icon} color={color} />
        <h3 className="text-admin-label-sm uppercase text-admin-ink-subtle">{label}</h3>
      </div>
      <p className="font-admin-display text-admin-metric text-admin-ink">
        {value == null ? "—" : <CountUp value={value} format={format} />}
      </p>
      {children}
      <p className="relative text-admin-body-sm text-admin-ink-subtle">
        {caption}
        {tip ? (
          <span className="group/tip">
            <button
              type="button"
              aria-label="How this is calculated"
              aria-describedby={tipId}
              className="relative -top-px ml-0.5 inline-flex size-[13px] items-center justify-center align-middle p-0 leading-none text-admin-ink-faint transition-colors hover:text-admin-ink-muted focus-visible:text-admin-ink focus-visible:outline-none focus-visible:shadow-admin-focus"
            >
              <MaterialIcon name="info" className="text-[13px]! leading-none" />
            </button>
            <span
              id={tipId}
              role="tooltip"
              className="pointer-events-none absolute bottom-[calc(100%+8px)] left-0 z-30 hidden w-max max-w-[280px] rounded-admin-control bg-admin-ink px-space-12 py-space-8 text-left text-[12px] font-medium normal-case leading-[1.35] tracking-normal text-white shadow-admin-pop group-hover/tip:block group-focus-within/tip:block"
            >
              {tip}
            </span>
          </span>
        ) : null}
      </p>
    </article>
  );
}

/** A horizontal part-to-whole bar with 2px gaps between segments. */
function SegmentBar({
  segments,
  label,
}: {
  segments: readonly { key: string; value: number; color: string }[];
  label: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div role="img" aria-label={label} className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-admin-subtle">
      {total > 0
        ? segments
            .filter((segment) => segment.value > 0)
            .map((segment, index) => (
              <motion.span
                key={segment.key}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ backgroundColor: segment.color }}
                initial={{ width: 0 }}
                animate={{ width: `${(segment.value / total) * 100}%` }}
                transition={{ duration: 0.7, delay: 0.1 + index * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            ))
        : null}
    </div>
  );
}

function LegendRows({
  items,
  stacked = false,
}: {
  items: readonly { key: string; label: string; value: number; color: string }[];
  /** One item per line, for narrow spots beside a chart. */
  stacked?: boolean;
}) {
  return (
    <ul
      className={`grid grid-cols-1 gap-x-space-16 gap-y-1 text-admin-body-sm text-admin-ink-muted ${
        stacked ? "" : "sm:grid-cols-2"
      }`}
    >
      {items.map((item) => (
        <li key={item.key} className="flex items-center justify-between gap-space-8">
          <span className="flex min-w-0 items-center gap-space-8">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </span>
          <span className="font-semibold tabular-nums text-admin-ink">{formatCount(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <p className="flex h-full items-center justify-center px-space-16 text-center text-admin-body-sm text-admin-ink-subtle">
      {children}
    </p>
  );
}

function axisProps() {
  return {
    tick: { fill: AXIS, fontSize: 11 },
    tickLine: false,
  } as const;
}

/** Axis labels short enough for eight bars on a phone. Tooltips keep the long form. */
const SHORT_BUCKET: Record<string, string> = {
  "< 15 min": "<15m",
  "15–60 min": "15–60m",
  "1–6 h": "1–6h",
  "6–24 h": "6–24h",
  "1–2 days": "1–2d",
  "2–7 days": "2–7d",
  "7+ days": "7d+",
  "< 1 h": "<1h",
  "1–24 h": "1–24h",
  "1–3 days": "1–3d",
  "3–7 days": "3–7d",
  "None yet": "None",
  "Not since": "None",
};

/** A count histogram whose bars are coloured by whether they hit the target. */
function BucketChart({
  buckets,
  goodColor,
  lateColor,
  noneColor,
  noun,
}: {
  buckets: readonly (LearningBucket & { none?: boolean })[];
  goodColor: string;
  lateColor: string;
  noneColor: string;
  noun: string;
}) {
  if (buckets.every((bucket) => bucket.count === 0)) {
    return <EmptyChart>Nothing to show in this window yet.</EmptyChart>;
  }
  const data = buckets.map((bucket) => ({
    ...bucket,
    short: SHORT_BUCKET[bucket.label] ?? bucket.label,
    fill: bucket.none ? noneColor : bucket.good ? goodColor : lateColor,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="short"
          tick={{ fill: AXIS, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          interval={0}
        />
        <YAxis allowDecimals={false} width={32} {...axisProps()} axisLine={false} />
        <Tooltip
          cursor={{ fill: ADMIN_COLORS.subtle }}
          content={({ active, payload }) => (
            <ChartTooltip
              active={active}
              label={(payload?.[0]?.payload as { label?: string } | undefined)?.label}
              payload={payload?.map((row) => ({
                name: noun,
                value: row.value as number,
                color: (row.payload as { fill: string }).fill,
              }))}
            />
          )}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.map((bucket) => (
            <Cell key={bucket.key} fill={bucket.fill} />
          ))}
          <LabelList
            dataKey="count"
            position="top"
            fill={ADMIN_COLORS.inkMuted}
            fontSize={11}
            formatter={(value) => (Number(value) > 0 ? formatCount(Number(value)) : "")}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Course pace                                                         */
/* ------------------------------------------------------------------ */

/** Half-ring meter that sweeps to the share. */
function Gauge({ share, color }: { share: number | null; color: string }) {
  const path = "M 16 104 A 88 88 0 0 1 192 104";
  return (
    <svg viewBox="0 0 208 112" className="w-full max-w-[16rem]" aria-hidden="true">
      <path d={path} fill="none" stroke={ADMIN_COLORS.subtle} strokeWidth={14} strokeLinecap="round" />
      {share != null && share > 0 ? (
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.min(1, share) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      ) : null}
    </svg>
  );
}

function PaceTrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: PaceTrendPoint & { value: number | null } }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <ChartTooltip
      active
      label={point.partial ? `${point.label} (so far)` : point.label}
      payload={[
        { name: "On pace", value: pct(point.rate), color: PACE },
        { name: "Students on pace", value: `${formatCount(point.onPace)} of ${formatCount(point.active)}`, color: PACE },
      ]}
    />
  );
}

function PaceTrend({ trend }: { trend: readonly PaceTrendPoint[] }) {
  const gradientId = `pace-${useId().replace(/:/g, "")}`;
  const data = trend.map((point) => ({ ...point, value: point.rate == null ? null : point.rate * 100 }));
  if (data.every((point) => point.value == null)) {
    return <EmptyChart>No active course students in these days.</EmptyChart>;
  }
  const last = [...data].reverse().find((point) => point.value != null);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PACE} stopOpacity={0.22} />
            <stop offset="100%" stopColor={PACE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="label"
          {...axisProps()}
          axisLine={{ stroke: GRID }}
          interval={data.length <= 14 ? 1 : data.length <= 31 ? 4 : 13}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          width={40}
          {...axisProps()}
          axisLine={false}
          tickFormatter={(value: number) => `${value}%`}
        />
        <Tooltip content={<PaceTrendTooltip />} cursor={{ stroke: GRID }} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={PACE}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          connectNulls
          activeDot={{ r: 4, stroke: ADMIN_COLORS.card, strokeWidth: 2, fill: PACE }}
          animationDuration={900}
        />
        {last ? (
          <ReferenceDot
            x={last.label}
            y={last.value ?? 0}
            r={4}
            fill={PACE}
            stroke={ADMIN_COLORS.card}
            strokeWidth={2}
            label={{ value: pct(last.rate), position: "top", fill: ADMIN_COLORS.ink, fontSize: 12, fontWeight: 600 }}
          />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function NorthStar({ pace, trendDays }: { pace: PaceBoard; trendDays: number }) {
  return (
    <section className={`${CARD} grid grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]`}>
      <div className="flex flex-col items-center gap-space-12 border-b border-admin-hairline bg-admin-emerald-wash/40 p-space-20 text-center lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-space-8 self-start">
          <IconTile icon="star" color={PACE} />
          <div className="text-left">
            <p className="text-admin-label-sm uppercase text-admin-emerald-ink">North Star</p>
            <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">On-pace rate</h3>
          </div>
        </div>
        <div className="relative mt-space-8 flex w-full justify-center">
          <Gauge share={pace.rate} color={PACE} />
          <p className="absolute inset-x-0 bottom-0 font-admin-display text-[44px] font-semibold leading-none text-admin-ink">
            {pace.rate == null ? "—" : <CountUp value={pace.rate * 100} format={(value) => `${Math.round(value)}%`} />}
          </p>
        </div>
        <p className="max-w-xs text-admin-body-sm text-admin-ink-muted">
          {pace.active === 0 ? (
            "No course student finished a part in the last two weeks."
          ) : (
            <>
              <span className="font-semibold text-admin-ink">
                {formatCount(pace.onPace)} of {plural(pace.active, "active student")}
              </span>{" "}
              averaged {PACE_PARTS_PER_DAY}+ new parts a day over the last {ON_PACE_DAYS} days.
            </>
          )}
        </p>
      </div>
      <div className="flex min-w-0 flex-col p-space-16 sm:p-space-20">
        <div className="flex flex-wrap items-start justify-between gap-space-8">
          <div>
            <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">On pace, day by day</h3>
            <p className="text-admin-body-sm text-admin-ink-subtle">
              Each day: active course students whose previous {ON_PACE_DAYS} days averaged {PACE_PARTS_PER_DAY}+ new parts. Last {trendDays} days.
            </p>
          </div>
          <LegendChips items={[{ name: "On-pace rate", color: PACE }]} />
        </div>
        <div className="mt-space-12 h-56 w-full sm:h-64">
          <PaceTrend trend={pace.trend} />
        </div>
      </div>
    </section>
  );
}

function RatioChart({ buckets }: { buckets: readonly PaceRatioBucket[] }) {
  if (buckets.every((bucket) => bucket.count === 0)) {
    return <EmptyChart>No course student has a schedule day behind them yet.</EmptyChart>;
  }
  const data = buckets.map((bucket) => ({ ...bucket, fill: TONE_COLORS[bucket.tone] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="16%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps()} axisLine={{ stroke: GRID }} interval={0} />
        <YAxis allowDecimals={false} width={32} {...axisProps()} axisLine={false} />
        <Tooltip
          cursor={{ fill: ADMIN_COLORS.subtle }}
          content={({ active, payload, label }) => (
            <ChartTooltip
              active={active}
              label={`Pace ratio ${label}`}
              payload={payload?.map((row) => ({
                name: "Students",
                value: row.value as number,
                color: (row.payload as { fill: string }).fill,
              }))}
            />
          )}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((bucket) => (
            <Cell key={bucket.key} fill={bucket.fill} />
          ))}
          <LabelList
            dataKey="count"
            position="top"
            fill={ADMIN_COLORS.inkMuted}
            fontSize={11}
            formatter={(value) => (Number(value) > 0 ? formatCount(Number(value)) : "")}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CatchUpDonut({ catchUp }: { catchUp: CatchUpBoard }) {
  const slices = [
    { key: "caught", name: `Back in sync ≤ ${CATCH_UP_DAYS} days`, value: catchUp.caught, color: PACE },
    { key: "behind", name: "Still behind after a week", value: catchUp.stillBehind, color: ALERT },
    { key: "recent", name: "Too recent to tell", value: catchUp.tooRecent, color: LATE },
  ];
  if (catchUp.episodes === 0) {
    return <EmptyChart>Nobody fell a full day behind in the last {catchUp.lookbackDays} days.</EmptyChart>;
  }
  return (
    <div className="flex h-full flex-col items-center gap-space-12 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0 sm:h-52 sm:w-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices.filter((slice) => slice.value > 0)}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={2}
              stroke={ADMIN_COLORS.card}
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              animationDuration={900}
            >
              {slices
                .filter((slice) => slice.value > 0)
                .map((slice) => (
                  <Cell key={slice.key} fill={slice.color} />
                ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => (
                <ChartTooltip
                  active={active}
                  label="Fall-behinds"
                  payload={payload?.map((row) => ({
                    name: String(row.name),
                    value: row.value as number,
                    color: (row.payload as { color: string }).color,
                  }))}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-admin-display text-[28px] font-semibold leading-none text-admin-ink">
            {catchUp.rate == null ? "—" : <CountUp value={catchUp.rate * 100} format={(value) => `${Math.round(value)}%`} />}
          </span>
          <span className="mt-1 text-admin-label-md text-admin-ink-subtle">caught up</span>
        </div>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-space-12">
        <LegendRows
          stacked
          items={slices.map((slice) => ({ key: slice.key, label: slice.name, value: slice.value, color: slice.color }))}
        />
        <p className="text-admin-body-sm text-admin-ink-subtle">
          {catchUp.medianDays != null
            ? `Those who caught up took ${formatDays(catchUp.medianDays)} (median).`
            : "Nobody has caught up yet."}
        </p>
      </div>
    </div>
  );
}

type SlipView = "day" | "lesson";

function SlipPanel({ pace }: { pace: PaceBoard }) {
  const [view, setView] = useState<SlipView>("day");
  const { unit, bars } = pace.slipByDay;
  const lessons = pace.slipByLesson.slice(0, 8);
  const topLesson = lessons[0]?.count ?? 0;
  const peak = bars.reduce<(typeof bars)[number] | null>(
    (best, bar) => (bar.count > (best?.count ?? 0) ? bar : best),
    null,
  );
  return (
    <ChartPanel
      icon="trending_down"
      color={ALERT}
      title="Slip point"
      hint={
        view === "day"
          ? `When each student first fell a full day (${PACE_PARTS_PER_DAY} parts) behind the schedule. The axis is the ${unit} of the course.`
          : "The Lektion each student was in when they first fell a full day behind. Hard content shows up here."
      }
      trailing={
        <Segmented<SlipView>
          ariaLabel="Slip point view"
          value={view}
          options={[
            { key: "day", label: unit === "week" ? "By week" : "By day" },
            { key: "lesson", label: "By Lektion" },
          ]}
          onSelect={setView}
        />
      }
      footer={
        pace.slipped > 0 ? (
          <p className="mt-space-12 text-admin-body-sm text-admin-ink-subtle">
            {plural(pace.slipped, "student")} fell behind at some point.
            {peak ? ` Most first slipped on ${peak.label.toLowerCase()}.` : ""}
          </p>
        ) : null
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          className="h-full"
          initial={{ opacity: 0, x: view === "day" ? -12 : 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {pace.slipped === 0 ? (
            <EmptyChart>Nobody has fallen a full day behind.</EmptyChart>
          ) : view === "day" ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...bars]} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="key"
                  {...axisProps()}
                  axisLine={{ stroke: GRID }}
                  interval={bars.length <= 14 ? 0 : "preserveStartEnd"}
                  tickFormatter={(key: string) => (unit === "week" ? `W${key}` : key)}
                />
                <YAxis allowDecimals={false} width={32} {...axisProps()} axisLine={false} />
                <Tooltip
                  cursor={{ fill: ADMIN_COLORS.subtle }}
                  content={({ active, payload }) => (
                    <ChartTooltip
                      active={active}
                      label={(payload?.[0]?.payload as { label?: string } | undefined)?.label}
                      payload={payload?.map((row) => ({
                        name: "First fell behind",
                        value: row.value as number,
                        color: ALERT,
                      }))}
                    />
                  )}
                />
                <Bar dataKey="count" name="First fell behind" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {bars.map((bar) => (
                    <Cell key={bar.key} fill={bar.key === peak?.key ? ALERT : ADMIN_COLORS.crimsonBorder} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ol className="flex h-full flex-col justify-center gap-space-8 overflow-y-auto">
              {lessons.map((lesson, index) => (
                <li key={lesson.key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-space-8 text-admin-body-sm">
                    <span className="truncate text-admin-ink">{lesson.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-admin-ink">{formatCount(lesson.count)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-admin-subtle">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: index === 0 ? ALERT : ADMIN_COLORS.crimsonBorder }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(lesson.count / Math.max(1, topLesson)) * 100}%` }}
                      transition={{ duration: 0.6, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </motion.div>
      </AnimatePresence>
    </ChartPanel>
  );
}

type StudentFilter = "behind" | "all" | "inactive";

function statusOf(student: PaceStudent): { label: string; tone: "emerald" | "amber" | "crimson" | "neutral" } {
  if (!student.active) return { label: "Inactive", tone: "neutral" };
  if (student.courseComplete) return { label: "Course done", tone: "emerald" };
  if (student.onPace) return { label: "On pace", tone: "emerald" };
  if (student.daysBehind >= 1) return { label: "Behind", tone: "crimson" };
  return { label: "Slow week", tone: "amber" };
}

function ratioColor(ratio: number | null): string {
  if (ratio == null) return NEUTRAL;
  if (ratio < 0.25) return TONE_COLORS.critical;
  if (ratio < 0.5) return TONE_COLORS.serious;
  if (ratio < 0.75) return TONE_COLORS.warning;
  if (ratio < 1) return TONE_COLORS.fair;
  return TONE_COLORS.good;
}

function PaceTable({
  students,
  now,
  onSelect,
}: {
  students: readonly PaceStudent[];
  now: number;
  onSelect: (userId: string) => void;
}) {
  const [filter, setFilter] = useState<StudentFilter>("behind");
  const [page, setPage] = useState(1);
  const counts = {
    behind: students.filter((student) => student.behind > 0).length,
    all: students.length,
    inactive: students.filter((student) => !student.active).length,
  };
  const rows = useMemo(() => {
    const list =
      filter === "behind"
        ? students.filter((student) => student.behind > 0)
        : filter === "inactive"
          ? students.filter((student) => !student.active)
          : [...students];
    return list.sort(
      (a, b) => b.behind - a.behind || (a.ratio ?? 2) - (b.ratio ?? 2) || a.displayName.localeCompare(b.displayName),
    );
  }, [students, filter]);
  const paged = paginate(rows, page, TABLE_PAGE_SIZE);

  return (
    <TablePanel
      icon="format_list_numbered"
      color={ALERT}
      title="Who is behind"
      hint={`Parts behind = parts the schedule expected by the end of yesterday (${PACE_PARTS_PER_DAY} a day from day 1) minus new course parts finished. Days behind = parts behind ÷ ${PACE_PARTS_PER_DAY}. Click a student for their detail.`}
      trailing={
        <Segmented<StudentFilter>
          ariaLabel="Students shown"
          value={filter}
          options={[
            { key: "behind", label: `Behind · ${counts.behind}` },
            { key: "inactive", label: `Inactive · ${counts.inactive}` },
            { key: "all", label: `All · ${counts.all}` },
          ]}
          onSelect={(key) => {
            setFilter(key);
            setPage(1);
          }}
        />
      }
    >
      {rows.length === 0 ? (
        <p className="flex items-center gap-space-8 px-space-20 py-space-24 text-admin-body-md text-admin-ink-muted">
          <MaterialIcon name="celebration" className="text-[20px] text-admin-emerald" />
          {filter === "behind" ? "Everyone is in sync with the schedule." : "No students here."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] border-collapse text-left">
              <thead className={THEAD}>
                <tr>
                  <th className={`${TH} min-w-[14rem]`}>Student</th>
                  <th className={TH}>Class</th>
                  <th className={`${TH} text-center`}>Course day</th>
                  <th className={`${TH} min-w-[12rem]`}>Done of expected</th>
                  <th className={`${TH} text-right`}>Pace ratio</th>
                  <th className={`${TH} text-right`}>Parts behind</th>
                  <th className={`${TH} text-right`}>Days behind</th>
                  <th className={`${TH} text-right`}>Last 7 days</th>
                  <th className={TH}>Last part</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="text-admin-body-md text-admin-ink">
                <AnimatePresence initial={false} mode="popLayout">
                  {paged.pageItems.map((student, index) => {
                    const status = statusOf(student);
                    const scale = Math.max(student.expected, student.done, 1);
                    return (
                      <motion.tr
                        key={student.userId}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { delay: index * 0.02 } }}
                        exit={{ opacity: 0 }}
                        onClick={() => onSelect(student.userId)}
                        className={`${TR} cursor-pointer`}
                      >
                        <td className="px-space-16 py-space-8">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect(student.userId);
                            }}
                            className="block max-w-[16rem] truncate rounded text-left font-semibold text-admin-ink transition-colors group-hover:text-admin-cobalt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-cobalt"
                          >
                            {student.displayName}
                          </button>
                          {student.email ? (
                            <span className="block max-w-[16rem] truncate text-admin-body-sm text-admin-ink-subtle">{student.email}</span>
                          ) : null}
                        </td>
                        <td className="px-space-16 py-space-8">
                          <Badge tone={student.className ? "cobalt" : "neutral"}>{student.className ?? "Unassigned"}</Badge>
                        </td>
                        <td className="px-space-16 py-space-8 text-center tabular-nums">
                          {formatCount(student.courseDay)}
                          <span className="block text-[12px] leading-4 text-admin-ink-subtle">from {formatIsoDay(student.startDay)}</span>
                        </td>
                        <td className="px-space-16 py-space-8">
                          <div className="flex w-full max-w-[12rem] flex-col gap-1">
                            <span className="text-admin-label-md tabular-nums text-admin-ink-muted">
                              <span className="font-semibold text-admin-ink">{formatCount(student.done)}</span> of{" "}
                              {formatCount(student.expected)}
                            </span>
                            {/* Done fills the track; the tick marks where the schedule is. */}
                            <div className="relative h-1.5 w-full rounded-full bg-admin-subtle">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(student.done / scale) * 100}%`,
                                  backgroundColor: ratioColor(student.ratio),
                                }}
                              />
                              <span
                                className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-admin-ink"
                                style={{ left: `calc(${(student.expected / scale) * 100}% - 1px)` }}
                                aria-hidden="true"
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-space-16 py-space-8 text-right font-semibold tabular-nums" style={{ color: ratioColor(student.ratio) }}>
                          {formatRatio(student.ratio)}
                        </td>
                        <td className="px-space-16 py-space-8 text-right tabular-nums">
                          <span className={student.behind > 0 ? "font-semibold text-admin-crimson-ink" : "text-admin-ink-subtle"}>
                            {formatCount(student.behind)}
                          </span>
                        </td>
                        <td className="px-space-16 py-space-8 text-right tabular-nums">
                          {student.behind > 0 ? formatDays(student.daysBehind) : "—"}
                        </td>
                        <td className="px-space-16 py-space-8 text-right tabular-nums">
                          <span className={student.lastWeekParts >= PACE_PARTS_PER_DAY * ON_PACE_DAYS ? "font-semibold text-admin-emerald-ink" : ""}>
                            {formatCount(student.lastWeekParts)}
                          </span>
                          <span className="text-admin-ink-subtle"> / {PACE_PARTS_PER_DAY * ON_PACE_DAYS}</span>
                        </td>
                        <td className="px-space-16 py-space-8 text-admin-body-sm text-admin-ink-muted">
                          {formatAgo(student.lastPartMs, now)}
                        </td>
                        <td className="px-space-16 py-space-8">
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          <div className="border-t border-admin-hairline bg-admin-canvas px-space-20 py-space-12">
            <Pager
              page={paged.page}
              pageCount={paged.pageCount}
              start={paged.start}
              end={paged.end}
              total={rows.length}
              noun="students"
              onPage={setPage}
            />
          </div>
        </>
      )}
    </TablePanel>
  );
}

function paceRatioSays(ratio: number | null): string {
  if (ratio == null) return "No student has work due on the schedule yet.";
  if (ratio >= 1.005) return "The typical student is ahead of the schedule.";
  if (ratio >= 0.995) return "The typical student is in sync with the schedule.";
  const share = Math.round(ratio * 100);
  if (share === 50) return "The typical student has done about half the work the schedule expected.";
  return `The typical student has done about ${share}% of the work the schedule expected.`;
}

function partsBehindSays(students: number, medianParts: number | null): string {
  if (students <= 0) return "Every course student is caught up with the schedule.";
  const parts = Math.round(medianParts ?? 0);
  const gap = parts === 1 ? "1 part" : `${formatCount(parts)} parts`;
  if (students === 1) return `1 student is behind the schedule, by ${gap}.`;
  return `${formatCount(students)} students are behind the schedule, typically by ${gap}.`;
}

function daysBehindSays(days: number | null): string {
  if (days == null) return "Nobody is behind the schedule.";
  return `A student who's behind is typically about ${formatDays(Math.round(days * 10) / 10)} of work short.`;
}

function catchUpSays(caught: number, stillBehind: number): string {
  const measured = caught + stillBehind;
  if (measured === 0) return "No fall-behind is old enough to tell yet.";
  if (caught === 0) {
    return `None of the ${plural(measured, "time")} a student fell behind ended back on schedule within a week.`;
  }
  if (caught === measured) {
    return measured === 1
      ? "The one time a student fell behind, they were back on schedule within a week."
      : `Every time a student fell behind (${formatCount(measured)}), they were back on schedule within a week.`;
  }
  return `${formatCount(caught)} of the ${formatCount(measured)} times a student fell behind, they were back on schedule within a week.`;
}

function PaceSection({
  pace,
  trendDays,
  now,
  onSelect,
}: {
  pace: PaceBoard;
  trendDays: number;
  now: number;
  onSelect: (userId: string) => void;
}) {
  const schedules = pace.schedules.filter((schedule) => schedule.key);
  return (
    <section aria-labelledby="learning-pace" className="flex flex-col gap-space-12">
      <SectionHeading
        id="learning-pace"
        icon="speed"
        title="Course pace"
        color={PACE}
        meta={`${plural(pace.students.length, "course student")} · schedule ${PACE_PARTS_PER_DAY} parts a day`}
      />
      <Reveal>
        <NorthStar pace={pace} trendDays={trendDays} />
      </Reveal>

      <Reveal delay={0.05} className="grid grid-cols-1 gap-space-16 sm:grid-cols-2 xl:grid-cols-4 2xl:gap-space-20">
        <MetricTile
          icon="speed"
          label="Pace ratio"
          value={pace.medianRatio}
          format={(value) => formatRatio(value)}
          color={ratioColor(pace.medianRatio)}
          caption={paceRatioSays(pace.medianRatio)}
          tip="The middle student's finished course parts, divided by the parts the schedule expected by the end of yesterday. 1.00× is in sync, 0.50× is half the pace. Students with nothing expected yet are left out."
        />
        <MetricTile
          icon="playlist_remove"
          label="Parts behind"
          value={pace.totalBehind}
          format={(value) => formatCount(Math.round(value))}
          color={pace.totalBehind > 0 ? ALERT : PACE}
          caption={partsBehindSays(pace.behindStudents, pace.medianBehind)}
          tip="The number adds up every part students still owe the schedule. The line counts students who owe at least one part, and the middle size of those gaps."
        />
        <MetricTile
          icon="event_busy"
          label="Days behind"
          value={pace.medianDaysBehind}
          format={(value) => formatDays(Math.round(value * 10) / 10)}
          color={ADMIN_COLORS.amber}
          caption={daysBehindSays(pace.medianDaysBehind)}
          tip={`The middle of parts behind ÷ ${PACE_PARTS_PER_DAY}, only among students who are behind. The schedule is ${PACE_PARTS_PER_DAY} parts a day, so this is how many days of work to tell a student.`}
        />
        <MetricTile
          icon="restore"
          label="Catch-up rate"
          value={pace.catchUp.rate == null ? null : pace.catchUp.rate * 100}
          format={(value) => `${Math.round(value)}%`}
          color={PACE}
          caption={catchUpSays(pace.catchUp.caught, pace.catchUp.stillBehind)}
          tip={`Each time a student fell a full day behind in the last ${pace.catchUp.lookbackDays} days: were they back within a day of the schedule within ${CATCH_UP_DAYS} days? Falls still inside those ${CATCH_UP_DAYS} days are left out.`}
        />
      </Reveal>

      <Reveal delay={0.05} className="grid grid-cols-1 gap-space-16 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] 2xl:gap-space-20">
        <ChartPanel
          icon="equalizer"
          color={PACE}
          title="Pace ratio across students"
          hint="Course parts done ÷ parts expected by the live schedule, one bar per band. Students on day 1 have nothing expected yet and are left out."
          legend={[
            { name: "Far behind", color: TONE_COLORS.critical },
            { name: "Behind", color: TONE_COLORS.serious },
            { name: "Slipping", color: TONE_COLORS.warning },
            { name: "Close", color: TONE_COLORS.fair },
            { name: "In sync", color: TONE_COLORS.good },
          ]}
        >
          <RatioChart buckets={pace.ratioBuckets} />
        </ChartPanel>
        <ChartPanel
          icon="restore"
          color={PACE}
          title="Catch-up"
          hint={`Every time a student fell a full day behind in the last ${pace.catchUp.lookbackDays} days: were they back within a day of the schedule ${CATCH_UP_DAYS} days later?`}
        >
          <CatchUpDonut catchUp={pace.catchUp} />
        </ChartPanel>
      </Reveal>

      <Reveal delay={0.05}>
        <SlipPanel pace={pace} />
      </Reveal>

      <Reveal delay={0.05}>
        <PaceTable students={pace.students} now={now} onSelect={onSelect} />
      </Reveal>

      {schedules.length > 0 ? (
        <div className="flex flex-wrap items-center gap-space-8 text-admin-body-sm text-admin-ink-subtle">
          <MaterialIcon name="calendar_month" className="text-[18px]" />
          <span>Day 1 per class (its earliest signup):</span>
          {schedules.map((schedule) => (
            <span
              key={schedule.key}
              className="inline-flex items-center gap-space-4 rounded-admin-badge border border-admin-hairline bg-admin-card px-space-8 py-0.5 text-admin-label-md text-admin-ink-muted"
            >
              <span className="font-semibold text-admin-ink">{schedule.label}</span>
              {formatIsoDay(schedule.startDay)}
            </span>
          ))}
          <span>Students without a class start on their own signup day.</span>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* First value                                                         */
/* ------------------------------------------------------------------ */

function FirstValueSection({ activation, windowLabel }: { activation: ActivationBoard; windowLabel: string }) {
  const composition = [
    { key: "activated", label: `First part within ${ACTIVATION_HOURS} h`, value: activation.activated, color: ENGAGE },
    { key: "pending", label: `Still inside ${ACTIVATION_HOURS} h`, value: activation.pending, color: ADMIN_COLORS.amberSoft },
    { key: "missed", label: "Missed, had course access", value: activation.missedWithAccess, color: ALERT },
    { key: "locked", label: "Missed, no course granted", value: activation.missedNoAccess, color: LATE },
  ];
  return (
    <section aria-labelledby="learning-first-value" className="flex flex-col gap-space-12">
      <SectionHeading
        id="learning-first-value"
        icon="rocket_launch"
        title="First value"
        color={ENGAGE}
        meta={`${plural(activation.signups, "signup")} ${windowLabel}`}
      />
      <Reveal className="grid grid-cols-1 gap-space-16 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] 2xl:gap-space-20">
        <div className="grid grid-cols-1 gap-space-16 sm:grid-cols-2 xl:grid-cols-1 2xl:gap-space-20">
          <MetricTile
            icon="bolt"
            label="Activation rate"
            value={activation.rate == null ? null : activation.rate * 100}
            format={(value) => `${Math.round(value)}%`}
            color={ENGAGE}
            caption={
              activation.signups === 0
                ? "No new signups in this window."
                : `New signups who finished a part within ${ACTIVATION_HOURS} hours. Signups still inside ${ACTIVATION_HOURS} hours are left out.`
            }
          >
            <SegmentBar
              label="Signups by first-part outcome"
              segments={composition.map((item) => ({ key: item.key, value: item.value, color: item.color }))}
            />
            <LegendRows items={composition} />
          </MetricTile>
          <MetricTile
            icon="timer"
            label="Time to first part"
            value={activation.medianMinutes}
            format={(value) => formatWait(value)}
            color={ENGAGE}
            caption={
              activation.withFirstPart > 0
                ? `Median from signup to the first finished part, over ${plural(activation.withFirstPart, "signup")} who have one.`
                : "Nobody in this window has finished a part yet."
            }
          />
        </div>
        <ChartPanel
          icon="hourglass_top"
          color={ENGAGE}
          title="Signup to first part"
          hint={`How long each new signup took to finish a first part. Bars inside ${ACTIVATION_HOURS} hours count as activated.`}
          legend={[
            { name: `≤ ${ACTIVATION_HOURS} h`, color: ENGAGE },
            { name: "Later", color: LATE },
            { name: "None yet", color: ADMIN_COLORS.crimsonBorder },
          ]}
        >
          <BucketChart
            buckets={[
              ...activation.buckets,
              { key: "none", label: "None yet", count: activation.noPart, good: false, none: true },
            ]}
            goodColor={ENGAGE}
            lateColor={LATE}
            noneColor={ADMIN_COLORS.crimsonBorder}
            noun="Signups"
          />
        </ChartPanel>
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Habit and retention                                                 */
/* ------------------------------------------------------------------ */

function WeeklyTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: readonly { payload?: WeeklyPoint }[];
  mode: "learners" | "depth";
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <ChartTooltip
      active
      label={`Week of ${point.label}${point.partial ? " (so far)" : ""}`}
      payload={
        mode === "learners"
          ? [
              { name: "Active learners", value: point.learners, color: ENGAGE },
              { name: "Parts finished", value: point.parts, color: NEUTRAL },
            ]
          : [
              {
                name: "Parts per learner",
                value: point.perLearner == null ? "—" : point.perLearner.toLocaleString("en-GB", { maximumFractionDigits: 1 }),
                color: PACE,
              },
              { name: "Pace target", value: PACE_PARTS_PER_DAY * 7, color: NEUTRAL },
            ]
      }
    />
  );
}

function WeeklyLearnersChart({ weekly }: { weekly: readonly WeeklyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={[...weekly]} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps()} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} width={32} {...axisProps()} axisLine={false} />
        <Tooltip cursor={{ fill: ADMIN_COLORS.subtle }} content={<WeeklyTooltip mode="learners" />} />
        <Bar dataKey="learners" radius={[4, 4, 0, 0]} maxBarSize={32}>
          {weekly.map((point) => (
            <Cell key={point.key} fill={ENGAGE} fillOpacity={point.partial ? 0.4 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DepthChart({ weekly }: { weekly: readonly WeeklyPoint[] }) {
  const target = PACE_PARTS_PER_DAY * 7;
  const max = weekly.reduce((top, point) => Math.max(top, point.perLearner ?? 0), 0);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={[...weekly]} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps()} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
        <YAxis
          width={32}
          {...axisProps()}
          axisLine={false}
          domain={[0, Math.ceil(Math.max(max, target) * 1.1)]}
        />
        <Tooltip cursor={{ stroke: GRID }} content={<WeeklyTooltip mode="depth" />} />
        <ReferenceLine
          y={target}
          stroke={NEUTRAL}
          label={{ value: `Pace target ${target}`, position: "insideTopLeft", fill: AXIS, fontSize: 11 }}
        />
        <Line
          type="monotone"
          dataKey="perLearner"
          stroke={PACE}
          strokeWidth={2}
          connectNulls
          dot={{ r: 3, fill: PACE, stroke: ADMIN_COLORS.card, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: PACE, stroke: ADMIN_COLORS.card, strokeWidth: 2 }}
          animationDuration={900}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function RetentionCurve({ retention }: { retention: RetentionBoard }) {
  const gradientId = `ret-${useId().replace(/:/g, "")}`;
  const data = retention.curve.map((point) => ({
    ...point,
    value: point.rate == null ? null : point.rate * 100,
  }));
  if (data.every((point) => point.day === 0 || point.value == null)) {
    return <EmptyChart>No signup in the last {RETENTION_WEEKS} weeks has a finished day 1 yet.</EmptyChart>;
  }
  const marks = [retention.d1, retention.d7, retention.d30]
    .map((cell, index) => ({ cell, day: [1, 7, 30][index] }))
    .filter(({ cell }) => cell.rate != null);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ENGAGE} stopOpacity={0.2} />
            <stop offset="100%" stopColor={ENGAGE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="day"
          type="number"
          domain={[0, 30]}
          ticks={[0, 1, 7, 14, 21, 30]}
          {...axisProps()}
          axisLine={{ stroke: GRID }}
          tickFormatter={(day: number) => `D${day}`}
        />
        <YAxis
          domain={[0, 100]}
          width={40}
          {...axisProps()}
          axisLine={false}
          tickFormatter={(value: number) => `${value}%`}
        />
        <Tooltip
          cursor={{ stroke: GRID }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as (RetentionCell & { label: string }) | undefined;
            if (!active || !point) return null;
            return (
              <ChartTooltip
                active
                label={`Day ${point.label.slice(1)} after signup`}
                payload={[
                  { name: "Finished a part", value: pct(point.rate), color: ENGAGE },
                  { name: "Of the cohort", value: `${formatCount(point.active)} of ${formatCount(point.eligible)}`, color: ENGAGE },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={ENGAGE}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          connectNulls
          dot={false}
          activeDot={{ r: 4, fill: ENGAGE, stroke: ADMIN_COLORS.card, strokeWidth: 2 }}
          animationDuration={1000}
        />
        {marks.map(({ cell, day }) => (
          <ReferenceDot
            key={day}
            x={day}
            y={(cell.rate ?? 0) * 100}
            r={5}
            fill={ENGAGE}
            stroke={ADMIN_COLORS.card}
            strokeWidth={2}
            label={{ value: `D${day} ${pct(cell.rate)}`, position: "top", fill: ADMIN_COLORS.ink, fontSize: 11, fontWeight: 600 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** One heat cell: the ember wash deepens with the rate. */
function HeatCell({ cell, delay }: { cell: RetentionCell; delay: number }) {
  if (cell.rate == null) {
    return (
      <td className="px-space-8 py-space-4">
        <div className="flex h-10 items-center justify-center rounded-admin-control text-admin-body-sm text-admin-ink-faint" title="This day has not ended for anyone in the cohort yet">
          —
        </div>
      </td>
    );
  }
  const alpha = 0.06 + cell.rate * 0.84;
  return (
    <td className="px-space-8 py-space-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3, delay }}
        className="flex h-10 flex-col items-center justify-center rounded-admin-control"
        style={{ backgroundColor: `rgba(234, 88, 12, ${alpha})`, color: alpha > 0.5 ? "#fff" : ADMIN_COLORS.ink }}
        title={`${formatCount(cell.active)} of ${formatCount(cell.eligible)}`}
      >
        <span className="text-admin-body-sm font-semibold tabular-nums">{pct(cell.rate)}</span>
        <span className="text-[11px] leading-3 tabular-nums opacity-80">
          {formatCount(cell.active)}/{formatCount(cell.eligible)}
        </span>
      </motion.div>
    </td>
  );
}

function CohortGrid({ retention }: { retention: RetentionBoard }) {
  const cohorts = retention.cohorts.filter((cohort) => cohort.size > 0);
  return (
    <TablePanel
      icon="grid_on"
      color={ENGAGE}
      title="Signup cohorts"
      hint="One row per signup week. Each cell: share of the week's signups who finished a part on exactly day 1, 7, or 30. Darker is better."
    >
      {cohorts.length === 0 ? (
        <p className="px-space-20 py-space-24 text-admin-body-sm text-admin-ink-muted">No signups in the last {RETENTION_WEEKS} weeks.</p>
      ) : (
        <div className="max-h-[22rem] overflow-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Signup week</th>
                <th className={`${TH} text-right`}>Signups</th>
                <th className={`${TH} text-center`}>D1</th>
                <th className={`${TH} text-center`}>D7</th>
                <th className={`${TH} text-center`}>D30</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {cohorts.map((cohort, row) => (
                <tr key={cohort.key} className="border-t border-admin-hairline">
                  <td className="whitespace-nowrap px-space-16 py-space-4 text-admin-body-sm font-semibold">{cohort.label}</td>
                  <td className="px-space-16 py-space-4 text-right tabular-nums">{formatCount(cohort.size)}</td>
                  <HeatCell cell={cohort.d1} delay={row * 0.03} />
                  <HeatCell cell={cohort.d7} delay={row * 0.03 + 0.05} />
                  <HeatCell cell={cohort.d30} delay={row * 0.03 + 0.1} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TablePanel>
  );
}

function HabitSection({ weekly, retention }: { weekly: readonly WeeklyPoint[]; retention: RetentionBoard }) {
  const complete = weekly.filter((point) => !point.partial);
  const lastWeek = complete.at(-1);
  const weekBefore = complete.at(-2);
  const thisWeek = weekly.find((point) => point.partial);
  const delta = lastWeek && weekBefore ? lastWeek.learners - weekBefore.learners : null;
  return (
    <section aria-labelledby="learning-habit" className="flex flex-col gap-space-12">
      <SectionHeading
        id="learning-habit"
        icon="event_repeat"
        title="Habit and retention"
        color={ENGAGE}
        meta={`Weeks start Monday · last ${weekly.length} weeks`}
      />
      <Reveal className="grid grid-cols-1 gap-space-16 xl:grid-cols-2 2xl:gap-space-20">
        <ChartPanel
          icon="groups"
          color={ENGAGE}
          title="Weekly active learners"
          hint="Students who finished at least one part that week. Opening the app is not enough. The paler bar is this week so far."
          trailing={
            <div className="text-right">
              <p className="text-admin-headline-sm font-semibold text-admin-ink">
                <CountUp value={lastWeek?.learners ?? 0} format={(value) => formatCount(Math.round(value))} />
                {delta != null && delta !== 0 ? (
                  <span className={`ml-space-8 text-admin-label-md ${delta > 0 ? "text-admin-emerald-ink" : "text-admin-crimson-ink"}`}>
                    {delta > 0 ? "▲" : "▼"} {formatCount(Math.abs(delta))}
                  </span>
                ) : null}
              </p>
              <p className="text-admin-label-md text-admin-ink-subtle">
                last full week{thisWeek ? ` · ${formatCount(thisWeek.learners)} so far this week` : ""}
              </p>
            </div>
          }
        >
          <WeeklyLearnersChart weekly={weekly} />
        </ChartPanel>
        <ChartPanel
          icon="stacked_line_chart"
          color={PACE}
          title="Parts per active learner"
          hint={`Parts finished that week ÷ weekly active learners, replays included. The line at ${PACE_PARTS_PER_DAY * 7} is the course pace of ${PACE_PARTS_PER_DAY} a day.`}
          trailing={
            <div className="text-right">
              <p className="text-admin-headline-sm font-semibold text-admin-ink">
                {lastWeek?.perLearner == null ? (
                  "—"
                ) : (
                  <CountUp value={lastWeek.perLearner} format={(value) => value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} />
                )}
              </p>
              <p className="text-admin-label-md text-admin-ink-subtle">last full week</p>
            </div>
          }
        >
          <DepthChart weekly={weekly} />
        </ChartPanel>
      </Reveal>
      <Reveal delay={0.05} className="grid grid-cols-1 gap-space-16 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] 2xl:gap-space-20">
        <ChartPanel
          icon="ssid_chart"
          color={ENGAGE}
          title="D1 / D7 / D30 retention"
          hint={`Of ${plural(retention.signups, "signup")} in the last ${RETENTION_WEEKS} weeks: the share who finished a part on each day after signing up. A day counts once it is over.`}
          trailing={
            <div className="flex items-center gap-space-8">
              {(
                [
                  ["D1", retention.d1],
                  ["D7", retention.d7],
                  ["D30", retention.d30],
                ] as const
              ).map(([label, cell]) => (
                <span key={label} className="rounded-admin-badge bg-admin-ember-wash px-space-8 py-0.5 text-admin-label-md text-admin-ember-ink">
                  {label} <span className="font-semibold">{pct(cell.rate)}</span>
                </span>
              ))}
            </div>
          }
        >
          <RetentionCurve retention={retention} />
        </ChartPanel>
        <CohortGrid retention={retention} />
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Flow through the course                                             */
/* ------------------------------------------------------------------ */

type DropSort = "worst" | "course";

function DropOffPanel({ rows }: { rows: readonly DropOffRow[] }) {
  const [sort, setSort] = useState<DropSort>("worst");
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(
    () =>
      sort === "worst"
        ? [...rows].sort((a, b) => b.rate - a.rate || b.started - a.started || a.order - b.order)
        : [...rows],
    [rows, sort],
  );
  const shown = expanded ? sorted : sorted.slice(0, DROP_OFF_PREVIEW);
  const started = rows.reduce((sum, row) => sum + row.started, 0);
  const dropped = rows.reduce((sum, row) => sum + row.dropped, 0);
  return (
    <section className={`${CARD} flex flex-col p-space-16 sm:p-space-20`}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-space-8">
          <div className="flex min-w-0 items-center gap-space-8">
            <IconTile icon="call_split" color={ALERT} />
            <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">Drop-off by part</h3>
          </div>
          <Segmented<DropSort>
            ariaLabel="Sort parts"
            value={sort}
            options={[
              { key: "worst", label: "Worst first" },
              { key: "course", label: "Course order" },
            ]}
            onSelect={setSort}
          />
        </div>
        <p className="text-admin-body-sm text-admin-ink-subtle sm:pl-10">
          Students who opened a part in this window, and whether they have finished it since. Parts with fewer than {DROP_OFF_MIN_STARTERS} starters are left out.
        </p>
      </div>
      <div className="mt-space-12 flex flex-wrap items-center justify-between gap-space-8">
        <LegendChips
          items={[
            { name: "Finished", color: PACE },
            { name: "Started, not finished", color: ALERT },
          ]}
        />
        {started > 0 ? (
          <span className="text-admin-label-md text-admin-ink-subtle">
            {pct(dropped / started)} of all part starts unfinished
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <div className="h-48">
          <EmptyChart>Not enough part starts in this window. Try a longer date range.</EmptyChart>
        </div>
      ) : (
        <>
          <motion.ol layout className="mt-space-12 flex flex-col gap-space-8">
            <AnimatePresence initial={false}>
              {shown.map((row) => (
                <motion.li
                  key={row.key}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", duration: 0.45, bounce: 0.12 }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-space-12 gap-y-1 rounded-admin-control px-space-8 py-space-4 transition-colors hover:bg-admin-canvas sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-admin-body-sm font-semibold text-admin-ink">
                      {row.courseLabel ? `${row.courseLabel} · ` : ""}
                      {row.lessonLabel}
                    </p>
                    <p className="truncate text-[12px] leading-4 text-admin-ink-subtle">{partName(row)}</p>
                  </div>
                  <div
                    role="img"
                    aria-label={`${formatCount(row.finished)} finished, ${formatCount(row.dropped)} not finished`}
                    className="col-span-2 flex h-3 w-full gap-[2px] sm:col-span-1 sm:col-start-2 sm:row-start-1"
                  >
                    {row.finished > 0 ? (
                      <motion.span
                        className="h-full rounded-l-[4px] last:rounded-r-[4px]"
                        style={{ backgroundColor: PACE }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(row.finished / row.started) * 100}%` }}
                        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                      />
                    ) : null}
                    {row.dropped > 0 ? (
                      <motion.span
                        className="h-full rounded-r-[4px] first:rounded-l-[4px]"
                        style={{ backgroundColor: ALERT }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(row.dropped / row.started) * 100}%` }}
                        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                      />
                    ) : null}
                  </div>
                  <div className="col-start-2 row-start-1 text-right sm:col-start-3">
                    <p
                      className={`text-admin-body-sm font-semibold tabular-nums ${
                        row.rate >= 0.5 ? "text-admin-crimson-ink" : "text-admin-ink"
                      }`}
                    >
                      {pct(row.rate)}
                    </p>
                    <p className="text-[12px] leading-4 tabular-nums text-admin-ink-subtle">
                      of {formatCount(row.started)}
                    </p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ol>
          {sorted.length > DROP_OFF_PREVIEW ? (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="mt-space-12 inline-flex items-center gap-space-4 self-start rounded-admin-control px-space-8 py-space-4 text-admin-label-md font-semibold text-admin-cobalt transition-colors hover:bg-admin-cobalt-wash"
            >
              <MaterialIcon name={expanded ? "expand_less" : "expand_more"} className="text-[18px]" />
              {expanded ? "Show fewer" : `Show all ${formatCount(sorted.length)} parts`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function FlowSection({
  continuation,
  dropOff,
  windowLabel,
}: {
  continuation: ContinuationBoard;
  dropOff: readonly DropOffRow[];
  windowLabel: string;
}) {
  return (
    <section aria-labelledby="learning-flow" className="flex flex-col gap-space-12">
      <SectionHeading
        id="learning-flow"
        icon="route"
        title="Flow through the course"
        color={PACE}
        meta={`Parts first finished or opened ${windowLabel}`}
      />
      <Reveal className="grid grid-cols-1 gap-space-16 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] 2xl:gap-space-20">
        <div className="flex flex-col gap-space-16 2xl:gap-space-20">
          <MetricTile
            icon="skip_next"
            label="Part-to-part continuation"
            value={continuation.rate == null ? null : continuation.rate * 100}
            format={(value) => `${Math.round(value)}%`}
            color={PACE}
            caption={
              continuation.eligible > 0
                ? `${formatCount(continuation.continued)} of ${plural(continuation.eligible, "first finish", "first finishes")} were followed by a start on another part within ${CONTINUE_DAYS} days.${
                    continuation.tooRecent > 0 ? ` ${formatCount(continuation.tooRecent)} too recent to tell.` : ""
                  }`
                : `Needs parts finished at least ${CONTINUE_DAYS} days ago, or followed by another part.`
            }
          >
            {continuation.medianHours != null ? (
              <p className="text-admin-body-sm text-admin-ink-muted">
                Median wait for those who went on:{" "}
                <span className="font-semibold text-admin-ink">{formatWait(continuation.medianHours * 60)}</span>
              </p>
            ) : null}
          </MetricTile>
          <ChartPanel
            icon="schedule"
            color={PACE}
            title="Time to the next part"
            hint="After a part is finished for the first time, how long until the student starts a different one."
            legend={[
              { name: `≤ ${CONTINUE_DAYS} days`, color: PACE },
              { name: "Later", color: LATE },
              { name: "Not since", color: ADMIN_COLORS.crimsonBorder },
            ]}
          >
            <BucketChart
              buckets={continuation.buckets.map((bucket) => ({ ...bucket, none: bucket.key === "never" }))}
              goodColor={PACE}
              lateColor={LATE}
              noneColor={ADMIN_COLORS.crimsonBorder}
              noun="Finished parts"
            />
          </ChartPanel>
        </div>
        <DropOffPanel rows={dropOff} />
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tab                                                                 */
/* ------------------------------------------------------------------ */

function LoadingBoard() {
  return (
    <div className="flex flex-col gap-space-16" aria-busy="true" aria-label="Loading learning metrics">
      <div className={`${CARD} h-72 animate-pulse bg-admin-subtle/60`} />
      <div className="grid grid-cols-1 gap-space-16 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={`${CARD} h-36 animate-pulse bg-admin-subtle/60`} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2">
        <div className={`${CARD} h-80 animate-pulse bg-admin-subtle/60`} />
        <div className={`${CARD} h-80 animate-pulse bg-admin-subtle/60`} />
      </div>
    </div>
  );
}

export function AdminLearning({
  rows,
  allRows,
  catalog,
  range,
  window,
  failed,
  onRetry,
  onSelect,
}: {
  /** Students in the current class scope. */
  rows: readonly AdminUserRow[];
  /** Every student, so a class's day 1 does not move with the scope. */
  allRows: readonly AdminUserRow[];
  catalog: readonly AdminCatalogCourse[];
  range: AdminRange;
  /** Null while loading. */
  window: LearningWindow | null;
  failed: boolean;
  onRetry: () => void;
  onSelect: (userId: string) => void;
}) {
  const course = useMemo(() => buildLearningCourseMap(catalog), [catalog]);
  const toLearners = (list: readonly AdminUserRow[]) =>
    list
      .filter((row) => !row.isAdmin && !row.staff && !row.teacher)
      .map((row) => learningLearner(row, classKey(row.className)));
  const learners = useMemo(() => toLearners(rows), [rows]);
  const allLearners = useMemo(() => toLearners(allRows), [allRows]);
  const windowDays = adminRangeDays(range);
  const loadedAt = window?.loadedAt;
  const now = useMemo(() => (loadedAt ? Date.parse(loadedAt) : 0), [loadedAt]);
  const board = useMemo(
    () =>
      window
        ? buildLearningBoard({ learners, allLearners, window, course, windowDays, now })
        : null,
    [learners, allLearners, window, course, windowDays, now],
  );

  if (failed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-space-12 rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
        Could not load part history.
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
          Try again
        </button>
      </div>
    );
  }
  if (!board || !window) return <LoadingBoard />;

  const windowLabel = range === "today" ? "today" : `in the last ${adminRangeLabel(range).toLowerCase()}`;
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-space-32">
        {!window.ready ? (
          <div className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-20 py-space-16 text-admin-body-sm text-admin-crimson-ink">
            Part history is not available. Run supabase/study_xp_awards.sql and supabase/listening_runs.sql, then reload.
          </div>
        ) : null}
        <PaceSection
          pace={board.pace}
          trendDays={Math.max(14, windowDays)}
          now={now}
          onSelect={onSelect}
        />
        <FirstValueSection activation={board.activation} windowLabel={windowLabel} />
        <HabitSection weekly={board.weekly} retention={board.retention} />
        <FlowSection continuation={board.continuation} dropOff={board.dropOff} windowLabel={windowLabel} />
        <p className="text-admin-body-sm text-admin-ink-subtle">
          A part is a finished study part or a passed practice part. Pace counts each course part once, so replays do not
          move a student forward. Active means a finished part in the last {ACTIVE_DAYS} days. Signup is the earliest
          sign-in, visit, or part we have stored for a student.
        </p>
      </div>
    </MotionConfig>
  );
}
