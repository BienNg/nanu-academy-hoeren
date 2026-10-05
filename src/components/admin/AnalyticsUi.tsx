"use client";

import type { ReactNode } from "react";
import { MaterialIcon } from "@/components/admin/AdminShell";

/**
 * Shared look for the analytics-style admin pages (Activity, Catalog): an
 * indigo / azure / slate palette, frosted cards, and icon-led headers.
 */
export const ANALYTICS = {
  axis: "#777586",
  grid: "#c7c4d7",
  indigo: "#4338ca",
  deepIndigo: "#2a14b4",
  azure: "#0284c7",
  ocean: "#006398",
  slate: "#283044",
  emerald: "#10b981",
  rose: "#e11d48",
  amber: "#b45309",
} as const;

/** Frosted card surface. */
export const GLASS =
  "rounded-2xl border border-[#e2e8f0]/80 bg-white/85 shadow-[0_1px_3px_0_rgba(15,23,42,0.04),0_1px_2px_-1px_rgba(15,23,42,0.03)] backdrop-blur-xl";

const GLASS_HOVER =
  "transition-shadow duration-300 hover:shadow-[0_10px_25px_-5px_rgba(67,56,202,0.08),0_8px_10px_-6px_rgba(15,23,42,0.04)]";

/** Sticky table header cell. */
export const TH =
  "px-space-16 py-space-12 font-label-sm text-[11px] leading-4 font-semibold uppercase tracking-wider";

/** Sticky table header row background. */
export const THEAD = "sticky top-0 z-10 bg-[#f2f3ff] text-on-surface-variant";

/** Table row with a hairline divider and hover tint. */
export const TR =
  "group border-t border-[#e2e8f0]/70 transition-colors hover:bg-[#f2f3ff]/60";

export function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

export function formatPercent(share: number): string {
  return `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
}

export function SectionHeading({
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

export function IconTile({
  icon,
  color = ANALYTICS.indigo,
  size = "md",
}: {
  icon: string;
  color?: string;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center ${
        size === "lg" ? "h-10 w-10 rounded-xl" : "h-8 w-8 rounded-lg"
      }`}
      style={{ backgroundColor: `${color}14`, color }}
    >
      <MaterialIcon name={icon} className={size === "lg" ? "text-[22px]" : "text-[18px]"} />
    </div>
  );
}

export function PanelHeader({
  icon,
  title,
  hint,
  trailing,
  color,
}: {
  icon: string;
  title: string;
  hint: ReactNode;
  trailing?: ReactNode;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-space-8">
        <div className="flex min-w-0 items-center gap-space-8">
          <IconTile icon={icon} color={color} />
          <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">{title}</h3>
        </div>
        {trailing}
      </div>
      <p className="font-body-sm text-[12px] leading-[18px] text-on-surface-variant sm:pl-10">
        {hint}
      </p>
    </div>
  );
}

/** Glass card with a tinted header strip, for tables and lists. */
export function TablePanel({
  icon,
  title,
  hint,
  trailing,
  color,
  footer,
  children,
}: {
  icon: string;
  title: string;
  hint: ReactNode;
  trailing?: ReactNode;
  color?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${GLASS} flex flex-col overflow-hidden`}>
      <div className="bg-[#f2f3ff]/40 p-space-20">
        <PanelHeader icon={icon} title={title} hint={hint} trailing={trailing} color={color} />
      </div>
      {children}
      {footer ? (
        <div className="border-t border-[#e2e8f0]/70 bg-[#f2f3ff]/40 px-space-20 py-space-12 font-body-sm text-body-sm text-on-surface-variant">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function LegendChips({ items }: { items: readonly { name: string; color: string }[] }) {
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

export type MicroMetric = { icon: string; label: string; value: string };

/**
 * One KPI category: icon header with badge, headline number, a share bar, a
 * two-metric strip, and a small visual anchored to the bottom edge.
 */
export function CategoryCard({
  icon,
  title,
  hint,
  color,
  value,
  unit,
  badge,
  badgeTone,
  progress,
  progressLabel,
  metrics,
  footerLabel,
  footerAside,
  children,
}: {
  icon: string;
  title: string;
  hint: string;
  color: string;
  value: string;
  unit: string;
  badge: string;
  /** "alert" swaps the badge to rose, for things that need fixing. */
  badgeTone?: "accent" | "alert";
  /** 0–1 share drawn as a bar under the headline number. */
  progress: number;
  progressLabel: string;
  metrics: readonly [MicroMetric, MicroMetric];
  footerLabel: string;
  footerAside?: ReactNode;
  /** The bottom visual: a sparkline, mini bars, and so on. */
  children: ReactNode;
}) {
  const badgeColor = badgeTone === "alert" ? ANALYTICS.rose : color;
  return (
    <article
      className={`${GLASS} ${GLASS_HOVER} flex flex-col justify-between overflow-hidden p-space-16 2xl:p-space-20`}
    >
      <div className="flex flex-col gap-space-12">
        <header className="flex items-start justify-between gap-space-8">
          <div className="flex min-w-0 items-center gap-space-8">
            <IconTile icon={icon} color={color} size="lg" />
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
            className="shrink-0 whitespace-nowrap rounded-full px-space-8 py-0.5 font-label-sm text-[11px] font-bold leading-4 tabular-nums"
            style={{ backgroundColor: `${badgeColor}14`, color: badgeColor }}
          >
            {badge}
          </span>
        </header>

        <p className="flex items-baseline gap-space-4 pt-space-4">
          <span className="font-headline-lg text-[1.875rem] font-extrabold leading-9 tracking-[-0.03em] tabular-nums text-on-surface">
            {value}
          </span>
          <span className="font-body-md text-[14px] leading-[22px] text-on-surface-variant">
            {unit}
          </span>
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
          <span className="truncate">{footerLabel}</span>
          {footerAside ? <span className="shrink-0 font-bold">{footerAside}</span> : null}
        </div>
        {children}
      </div>
    </article>
  );
}

/** Small labelled columns, for a per-group breakdown inside a CategoryCard. */
export function MiniBars({
  items,
  color,
}: {
  items: readonly { key: string; label: string; value: number }[];
  color: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="flex h-12 items-end gap-space-4" aria-hidden="true">
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          <div className="flex h-8 w-full items-end justify-center">
            <div
              className="w-full max-w-6 rounded-t-[3px]"
              style={{
                height: item.value > 0 ? `${Math.max(12, (item.value / max) * 100)}%` : "2px",
                backgroundColor: item.value > 0 ? color : "#c7c4d7",
                opacity: item.value === max && item.value > 0 ? 1 : 0.55,
              }}
            />
          </div>
          <span className="w-full truncate text-center font-label-sm text-[10px] leading-3 text-outline">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Pill row of filters with a leading label, like "Class scope". */
export function ScopeChips({
  label,
  icon = "filter_list",
  ariaLabel,
  value,
  options,
  onSelect,
}: {
  label: string;
  icon?: string;
  ariaLabel: string;
  value: string;
  options: readonly { key: string; label: string; count: ReactNode }[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="-mx-space-16 flex items-center gap-space-8 overflow-x-auto px-space-16 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <span className="flex shrink-0 items-center gap-space-4 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-outline">
        <MaterialIcon name={icon} className="text-[16px]" />
        {label}
      </span>
      <div role="tablist" aria-label={ariaLabel} className="flex shrink-0 gap-space-8 sm:flex-wrap">
        {options.map((option) => {
          const on = option.key === value;
          return (
            <button
              key={option.key || "none"}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(option.key)}
              className={`inline-flex h-8 shrink-0 items-center gap-space-8 rounded-full pl-space-12 pr-space-4 font-label-sm text-label-sm font-semibold transition-all ${
                on
                  ? "bg-[#4338ca] text-white shadow-[0_2px_8px_rgba(67,56,202,0.3)]"
                  : "border border-[#e2e8f0] bg-white text-on-surface-variant hover:-translate-y-px hover:border-[#cbd5e1] hover:text-on-surface"
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

/** A count as a soft pill; zero reads as muted text. */
export function CountPill({
  value,
  tone = "neutral",
}: {
  value: number;
  tone?: "neutral" | "peak" | "alert" | "good";
}) {
  if (value <= 0) {
    return <span className="font-label-sm text-label-sm font-semibold text-outline">0</span>;
  }
  const styles =
    tone === "peak"
      ? "bg-[#4338ca] text-white shadow-sm"
      : tone === "alert"
        ? "bg-[#ffe4e6] text-[#9f1239]"
        : tone === "good"
          ? "bg-[#6ffbbe]/30 text-[#00442d]"
          : "bg-[#eaedff] text-on-surface";
  return (
    <span
      className={`inline-flex min-w-7 justify-center rounded-full px-2.5 py-0.5 font-label-sm text-label-sm font-semibold tabular-nums ${styles}`}
    >
      {formatCount(value)}
    </span>
  );
}

/** Coloured status pill with a leading dot. */
export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "warn" | "bad" | "muted";
}) {
  const styles = {
    good: { pill: "bg-[#6ffbbe]/30 text-[#00442d]", dot: "bg-[#10b981]" },
    warn: { pill: "bg-[#fef3c7] text-[#92400e]", dot: "bg-[#f59e0b]" },
    bad: { pill: "bg-[#ffe4e6] text-[#9f1239]", dot: "bg-[#e11d48]" },
    muted: { pill: "bg-[#eaedff] text-on-surface-variant", dot: "bg-[#777586]" },
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-space-8 py-0.5 font-label-sm text-label-sm font-bold ${styles.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/** One page of `items`, with the page clamped into range. */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): { pageItems: T[]; page: number; pageCount: number; start: number; end: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(Math.max(1, page), pageCount);
  const from = (safe - 1) * pageSize;
  return {
    pageItems: items.slice(from, from + pageSize),
    page: safe,
    pageCount,
    start: items.length === 0 ? 0 : from + 1,
    end: Math.min(from + pageSize, items.length),
  };
}

/** Page numbers to show: first, last, and a window around the current page. */
function pageSlots(page: number, pageCount: number): (number | "gap")[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const slots: (number | "gap")[] = [];
  for (const n of pages) {
    const last = slots[slots.length - 1];
    if (typeof last === "number" && n - last > 1) slots.push("gap");
    slots.push(n);
  }
  return slots;
}

const PAGER_BUTTON =
  "inline-flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-lg px-space-8 font-label-sm text-label-sm font-semibold tabular-nums transition-colors";

/** Footer strip: "Showing 1–10 of 42 lessons" with Previous, page numbers, and Next. */
export function Pager({
  page,
  pageCount,
  start,
  end,
  total,
  noun,
  onPage,
}: {
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-between gap-space-8 sm:flex-row">
      <span className="font-body-sm text-body-sm text-on-surface-variant">
        {total === 0
          ? `No ${noun}`
          : `Showing ${formatCount(start)}–${formatCount(end)} of ${formatCount(total)} ${noun}`}
      </span>
      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-space-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className={`${PAGER_BUTTON} bg-white text-on-surface-variant shadow-sm hover:text-on-surface disabled:cursor-not-allowed disabled:text-outline disabled:shadow-none`}
          >
            <MaterialIcon name="chevron_left" className="text-[18px]" />
            <span className="hidden sm:inline">Previous</span>
          </button>
          {pageSlots(page, pageCount).map((slot, index) =>
            slot === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-outline" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={slot}
                type="button"
                aria-current={slot === page ? "page" : undefined}
                onClick={() => onPage(slot)}
                className={`${PAGER_BUTTON} ${
                  slot === page
                    ? "bg-[#4338ca] text-white shadow-sm"
                    : "bg-white text-on-surface-variant shadow-sm hover:text-on-surface"
                }`}
              >
                {slot}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
            className={`${PAGER_BUTTON} bg-white text-on-surface-variant shadow-sm hover:text-on-surface disabled:cursor-not-allowed disabled:text-outline disabled:shadow-none`}
          >
            <span className="hidden sm:inline">Next</span>
            <MaterialIcon name="chevron_right" className="text-[18px]" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * A quiet KPI: icon, label, big number, one caption, and an optional share bar.
 * Use it where a full CategoryCard would be too busy.
 */
export function KpiTile({
  icon,
  label,
  value,
  caption,
  color = ANALYTICS.indigo,
  progress,
  progressLabel,
}: {
  icon: string;
  label: string;
  value: string;
  caption: ReactNode;
  color?: string;
  progress?: number;
  progressLabel?: string;
}) {
  return (
    <article className={`${GLASS} ${GLASS_HOVER} flex flex-col gap-space-12 p-space-16 2xl:p-space-20`}>
      <div className="flex items-center gap-space-8">
        <IconTile icon={icon} color={color} />
        <h3 className="font-label-sm text-[11px] font-bold uppercase leading-4 tracking-wider text-on-surface-variant">
          {label}
        </h3>
      </div>
      <p className="font-headline-lg text-[1.875rem] font-extrabold leading-9 tracking-[-0.03em] tabular-nums text-on-surface">
        {value}
      </p>
      {progress != null ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[#eaedff]"
          role="progressbar"
          aria-label={progressLabel ?? label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.min(1, progress) * 100)}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: formatPercent(progress), backgroundColor: color }}
          />
        </div>
      ) : null}
      <p className="font-body-sm text-[12px] leading-[18px] text-on-surface-variant">{caption}</p>
    </article>
  );
}

/** Enclosed pill switch, like the range toggle in the top bar. */
export function Segmented<K extends string>({
  ariaLabel,
  value,
  options,
  onSelect,
}: {
  ariaLabel: string;
  value: K;
  options: readonly { key: K; label: string; icon?: string }[];
  onSelect: (key: K) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center rounded-full bg-[#eaedff] p-1"
    >
      {options.map((option) => {
        const on = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(option.key)}
            className={`inline-flex h-7 items-center gap-space-4 rounded-full px-space-12 font-label-sm text-label-sm font-semibold transition-all ${
              on ? "bg-white text-[#4338ca] shadow-sm" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {option.icon ? <MaterialIcon name={option.icon} className="text-[16px]" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Search field that sits in a TablePanel header. */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center rounded-xl bg-white px-space-12 py-1.5 shadow-sm sm:w-64 sm:flex-none">
      <span className="sr-only">{label}</span>
      <MaterialIcon name="search" className="mr-space-4 text-[18px] text-outline" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline"
      />
    </label>
  );
}

type TooltipRow = {
  name?: string;
  value?: number | string;
  color?: string;
};

/** Dark chart tooltip shared by the analytics charts. */
export function ChartTooltip({
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
