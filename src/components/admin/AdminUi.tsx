"use client";

import {
  useEffect,
  useId,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { MaterialIcon } from "@/components/admin/AdminShell";
import { ADMIN_COLORS, type AdminDomain } from "@/lib/admin-tokens";

/**
 * Shared primitives for every admin page, following the Lumina Lexicon Admin
 * guide: white cards on hairline borders, crisp 4/6/8px corners, and one accent
 * colour per domain (ember engagement, amber achievement, emerald curriculum,
 * violet media, crimson alerts, cobalt operations).
 */

/** Level 1 card surface. */
export const CARD =
  "rounded-admin-card border border-admin-hairline bg-admin-card shadow-admin-card";

const CARD_HOVER = "transition-colors duration-200 hover:border-admin-border";

/** Sticky table header cell. */
export const TH = "px-space-16 py-space-12 text-admin-label-sm uppercase";

/** Sticky table header row background. */
export const THEAD = "sticky top-0 z-10 bg-admin-subtle text-admin-ink-subtle";

/** 52px table row with a hairline divider and hover tint. */
export const TR =
  "group h-[52px] border-t border-admin-hairline transition-colors hover:bg-admin-canvas";

/** 38px text input with the cobalt focus ring. */
export const INPUT =
  "h-[38px] w-full rounded-admin-control border border-admin-border bg-admin-card px-space-12 text-admin-body-md text-admin-ink outline-none transition-shadow placeholder:text-admin-ink-faint focus:border-admin-cobalt focus:shadow-admin-focus disabled:cursor-not-allowed disabled:bg-admin-subtle";

export function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

export function formatPercent(share: number): string {
  return `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
}

/** Wash, ink and border classes per domain. Spelled out so Tailwind can see them. */
const TONE: Record<AdminDomain | "neutral", { wash: string; solid: string; chip: string }> = {
  neutral: {
    wash: "bg-admin-subtle text-admin-ink-muted ring-admin-hairline",
    solid: "bg-admin-ink text-white",
    chip: "border-admin-ink-muted bg-admin-subtle text-admin-ink",
  },
  cobalt: {
    wash: "bg-admin-cobalt-wash text-admin-cobalt-ink ring-admin-cobalt/20",
    solid: "bg-admin-cobalt text-white",
    chip: "border-admin-cobalt bg-admin-cobalt-wash text-admin-cobalt-ink",
  },
  ember: {
    wash: "bg-admin-ember-wash text-admin-ember-ink ring-admin-ember/20",
    solid: "bg-admin-ember text-white",
    chip: "border-admin-ember bg-admin-ember-wash text-admin-ember-ink",
  },
  amber: {
    wash: "bg-admin-amber-wash text-admin-amber-ink ring-admin-amber/25",
    solid: "bg-admin-amber text-white",
    chip: "border-admin-amber bg-admin-amber-wash text-admin-amber-ink",
  },
  emerald: {
    wash: "bg-admin-emerald-wash text-admin-emerald-ink ring-admin-emerald/20",
    solid: "bg-admin-emerald text-white",
    chip: "border-admin-emerald bg-admin-emerald-wash text-admin-emerald-ink",
  },
  violet: {
    wash: "bg-admin-violet-wash text-admin-violet-ink ring-admin-violet/20",
    solid: "bg-admin-violet text-white",
    chip: "border-admin-violet bg-admin-violet-wash text-admin-violet-ink",
  },
  crimson: {
    wash: "bg-admin-crimson-wash text-admin-crimson-ink ring-admin-crimson-border/60",
    solid: "bg-admin-crimson text-white",
    chip: "border-admin-crimson bg-admin-crimson-wash text-admin-crimson-ink",
  },
};

export type BadgeTone = AdminDomain | "neutral";

/** 4px tag for statuses, counts and CEFR levels. */
export function Badge({
  tone = "neutral",
  solid = false,
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  solid?: boolean;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-admin-badge px-1.5 text-[12px] font-semibold leading-4 tabular-nums ${
        solid ? TONE[tone].solid : `ring-1 ring-inset ${TONE[tone].wash}`
      } ${className ?? ""}`}
    >
      {dot ? (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
}

/** Floating menu surface for row menus, pickers and comboboxes. */
export const POPOVER =
  "fixed z-[80] overflow-hidden rounded-admin-card border border-admin-border bg-admin-card py-1 shadow-admin-pop";

export const POPOVER_ITEM =
  "flex w-full items-center gap-space-8 px-space-12 py-space-8 text-left text-admin-body-md font-medium text-admin-ink outline-none hover:bg-admin-subtle focus-visible:bg-admin-subtle disabled:opacity-40";

/** 28px lock/unlock chip for course grants. Open grants read amber, the CEFR colour. */
export function GrantChip({
  label,
  on,
  disabled,
  title,
  onToggle,
}: {
  label: string;
  on: boolean;
  disabled: boolean;
  title: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      className={`inline-flex h-7 items-center gap-1 rounded-admin-badge border px-space-8 text-admin-label-md font-semibold outline-none transition-colors focus-visible:shadow-admin-focus disabled:opacity-50 ${
        on
          ? "border-admin-amber bg-admin-amber-wash text-admin-amber-ink"
          : "border-transparent bg-admin-subtle text-admin-ink-muted hover:bg-admin-hairline hover:text-admin-ink"
      }`}
    >
      <MaterialIcon name={on ? "lock_open" : "lock"} className="text-[14px]" />
      {label}
    </button>
  );
}

/** Quiet context tag beside a page title, like "Vietnam time · GMT+7". */
export function HeaderChip({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-admin-badge border border-admin-hairline bg-admin-card px-space-8 text-admin-label-md font-medium text-admin-ink-muted">
      <MaterialIcon name={icon} className="text-[16px] text-admin-ink-subtle" />
      {children}
    </span>
  );
}

/** IDs, emails, file paths and env keys. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-admin-mono text-admin-mono ${className ?? ""}`}>{children}</span>
  );
}

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
type ButtonSize = "compact" | "default";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-admin-cobalt text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] hover:bg-admin-cobalt-strong",
  secondary:
    "border border-admin-hairline bg-admin-card text-admin-ink-muted hover:border-admin-border hover:bg-admin-canvas hover:text-admin-ink",
  destructive:
    "border border-admin-crimson-border bg-admin-crimson-wash text-admin-crimson hover:bg-admin-crimson-hover",
  ghost: "text-admin-ink-muted hover:bg-admin-subtle hover:text-admin-ink",
};

/** Class string for a button, so links can share the look. */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "compact") {
  return `inline-flex shrink-0 items-center justify-center gap-space-8 rounded-admin-control px-space-12 text-admin-body-md font-semibold outline-none transition-colors focus-visible:shadow-admin-focus disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "compact" ? "h-9" : "h-10 px-space-16"
  } ${BUTTON_VARIANT[variant]}`;
}

export function Button({
  variant = "secondary",
  size = "compact",
  icon,
  className,
  children,
  type = "button",
  ...props
}: ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
}) {
  return (
    <button type={type} className={`${buttonClass(variant, size)} ${className ?? ""}`} {...props}>
      {icon ? <MaterialIcon name={icon} className="-ml-0.5 text-[18px]" /> : null}
      {children}
    </button>
  );
}

/** 16px cobalt checkbox around a native input. */
export function Checkbox({
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<"input">, "type">) {
  return (
    <span className={`relative inline-flex h-4 w-4 shrink-0 ${className ?? ""}`}>
      <input
        type="checkbox"
        className="peer h-4 w-4 cursor-pointer appearance-none rounded-[3px] border border-admin-border bg-admin-card outline-none transition-colors checked:border-admin-cobalt checked:bg-admin-cobalt focus-visible:shadow-admin-focus disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <svg
        viewBox="0 0 16 16"
        className="pointer-events-none absolute inset-0 hidden h-4 w-4 text-white peer-checked:block"
        aria-hidden="true"
      >
        <path
          d="M4 8.2 6.6 10.8 12 5.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function SectionHeading({
  icon,
  title,
  meta,
  id,
  color = ADMIN_COLORS.cobalt,
}: {
  icon: string;
  title: string;
  meta?: ReactNode;
  id: string;
  color?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-space-8">
      <h2
        id={id}
        className="flex items-center gap-space-8 text-admin-label-sm uppercase text-admin-ink-subtle"
      >
        <span style={{ color }} className="flex">
          <MaterialIcon name={icon} className="text-[18px]" />
        </span>
        {title}
      </h2>
      {meta ? <div className="text-admin-label-md text-admin-ink-subtle">{meta}</div> : null}
    </div>
  );
}

export function IconTile({
  icon,
  color = ADMIN_COLORS.cobalt,
  size = "md",
}: {
  icon: string;
  color?: string;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-admin-control ${
        size === "lg" ? "h-9 w-9" : "h-8 w-8"
      }`}
      style={{ backgroundColor: `${color}14`, color }}
    >
      <MaterialIcon name={icon} className={size === "lg" ? "text-[20px]" : "text-[18px]"} />
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
          <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">{title}</h3>
        </div>
        {trailing}
      </div>
      <p className="text-admin-body-sm text-admin-ink-subtle sm:pl-10">{hint}</p>
    </div>
  );
}

/** Card with a header strip, for tables and lists. */
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
    <div className={`${CARD} flex flex-col overflow-hidden`}>
      <div className="border-b border-admin-hairline p-space-16 sm:p-space-20">
        <PanelHeader icon={icon} title={title} hint={hint} trailing={trailing} color={color} />
      </div>
      {children}
      {footer ? (
        <div className="border-t border-admin-hairline bg-admin-canvas px-space-16 py-space-12 text-admin-body-sm text-admin-ink-subtle sm:px-space-20">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** Card for one chart: icon header, hint, optional legend or control, fixed-height plot. */
export function ChartPanel({
  icon,
  title,
  hint,
  color,
  legend,
  trailing,
  footer,
  children,
}: {
  icon: string;
  title: string;
  hint: string;
  color?: string;
  legend?: readonly { name: string; color: string }[];
  trailing?: ReactNode;
  /** Shown under the chart, inside the same card. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`${CARD} flex flex-col p-space-16 sm:p-space-20`}>
      <PanelHeader
        icon={icon}
        title={title}
        hint={hint}
        color={color}
        trailing={trailing ?? (legend ? <LegendChips items={legend} /> : undefined)}
      />
      <div className="mt-space-16 h-64 w-full sm:h-72">{children}</div>
      {footer}
    </section>
  );
}

export function LegendChips({ items }: { items: readonly { name: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-space-12 text-admin-label-md text-admin-ink-muted">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-space-4">
          <span
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ backgroundColor: item.color }}
            aria-hidden="true"
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

/** A tiny trend line for KPI tiles; flat when there is nothing to draw. */
export function Sparkline({
  values,
  color = ADMIN_COLORS.ember,
  className,
}: {
  values: readonly number[];
  color?: string;
  className?: string;
}) {
  const gradientId = useId();
  if (values.length < 2) return null;
  const width = 100;
  const height = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * width,
    height - 2 - ((value - min) / span) * (height - 4),
  ]);
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`h-7 w-full ${className ?? ""}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ShareBar({ share, color, label }: { share: number; color: string; label: string }) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-admin-subtle"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(1, share) * 100)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: formatPercent(share), backgroundColor: color }}
      />
    </div>
  );
}

export type MicroMetric = { icon: string; label: string; value: string };

/**
 * One KPI domain: a coloured top rule, icon header with badge, headline number,
 * a share bar, a two-metric strip, and a small visual anchored to the bottom.
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
  /** "alert" swaps the badge to crimson, for things that need fixing. */
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
  const badgeColor = badgeTone === "alert" ? ADMIN_COLORS.crimson : color;
  return (
    <article
      className={`${CARD} ${CARD_HOVER} flex flex-col justify-between overflow-hidden border-t-2 p-space-16 2xl:p-space-20`}
      style={{ borderTopColor: color }}
    >
      <div className="flex flex-col gap-space-12">
        <header className="flex items-start justify-between gap-space-8">
          <div className="flex min-w-0 items-center gap-space-8">
            <IconTile icon={icon} color={color} size="lg" />
            <div className="min-w-0">
              <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">{title}</h3>
              <p className="text-admin-body-sm text-admin-ink-subtle">{hint}</p>
            </div>
          </div>
          <span
            className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-admin-badge px-1.5 text-[12px] font-semibold leading-4 tabular-nums"
            style={{ backgroundColor: `${badgeColor}14`, color: badgeColor }}
          >
            {badge}
          </span>
        </header>

        <p className="flex items-baseline gap-space-4 pt-space-4">
          <span className="font-admin-display text-admin-metric tabular-nums text-admin-ink">
            {value}
          </span>
          <span className="text-admin-body-md text-admin-ink-subtle">{unit}</span>
        </p>

        <ShareBar share={progress} color={color} label={progressLabel} />

        <dl className="grid grid-cols-2 divide-x divide-admin-hairline rounded-admin-control border border-admin-hairline bg-admin-canvas py-space-8">
          {metrics.map((metric, index) => (
            <div key={metric.label} className="flex min-w-0 flex-col px-space-12">
              <dt className="flex items-center gap-space-4 text-admin-label-md text-admin-ink-subtle">
                <MaterialIcon name={metric.icon} className="text-[14px]" />
                <span className="truncate">{metric.label}</span>
              </dt>
              <dd
                className="truncate text-admin-body-md font-semibold tabular-nums text-admin-ink"
                style={{ color: index === 0 ? color : undefined }}
              >
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="pt-space-12">
        <div className="flex items-center justify-between gap-space-8 pb-1 text-admin-label-md text-admin-ink-subtle">
          <span className="truncate">{footerLabel}</span>
          {footerAside ? <span className="shrink-0 font-semibold">{footerAside}</span> : null}
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
              className="w-full max-w-6 rounded-t-[2px]"
              style={{
                height: item.value > 0 ? `${Math.max(12, (item.value / max) * 100)}%` : "2px",
                backgroundColor: item.value > 0 ? color : ADMIN_COLORS.hairline,
                opacity: item.value === max && item.value > 0 ? 1 : 0.55,
              }}
            />
          </div>
          <span className="w-full truncate text-center text-[10px] leading-3 text-admin-ink-subtle">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Row of 28px filter chips with a leading label, like "Class scope". */
export function ScopeChips({
  label,
  icon = "filter_list",
  ariaLabel,
  value,
  options,
  onSelect,
  tone = "cobalt",
}: {
  label: string;
  icon?: string;
  ariaLabel: string;
  value: string;
  options: readonly { key: string; label: string; count: ReactNode }[];
  onSelect: (key: string) => void;
  tone?: AdminDomain;
}) {
  return (
    <div className="-mx-space-16 flex items-center gap-space-8 overflow-x-auto px-space-16 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <span className="flex shrink-0 items-center gap-space-4 text-admin-label-sm uppercase text-admin-ink-subtle">
        <MaterialIcon name={icon} className="text-[16px]" />
        {label}
      </span>
      <div role="tablist" aria-label={ariaLabel} className="flex shrink-0 gap-space-4 sm:flex-wrap">
        {options.map((option) => {
          const on = option.key === value;
          return (
            <button
              key={option.key || "none"}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(option.key)}
              className={`inline-flex h-7 shrink-0 items-center gap-space-8 rounded-admin-badge border pl-space-8 pr-space-4 text-admin-label-md font-semibold outline-none transition-colors focus-visible:shadow-admin-focus ${
                on
                  ? TONE[tone].chip
                  : "border-transparent bg-admin-subtle text-admin-ink-muted hover:bg-admin-hairline hover:text-admin-ink"
              }`}
            >
              {option.label}
              <span
                className={`rounded-[3px] px-1 tabular-nums ${on ? "bg-white/80" : "bg-white text-admin-ink-subtle"}`}
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

/** A count as a soft tag; zero reads as muted text. */
export function CountPill({
  value,
  tone = "neutral",
}: {
  value: number;
  tone?: "neutral" | "peak" | "alert" | "good";
}) {
  if (value <= 0) {
    return <span className="text-admin-label-md font-semibold text-admin-ink-faint">0</span>;
  }
  return (
    <Badge
      tone={tone === "peak" ? "cobalt" : tone === "alert" ? "crimson" : tone === "good" ? "emerald" : "neutral"}
      solid={tone === "peak"}
      className="min-w-7 justify-center"
    >
      {formatCount(value)}
    </Badge>
  );
}

/** Coloured status tag with a leading dot. */
export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "warn" | "bad" | "muted";
}) {
  const badgeTone: BadgeTone =
    tone === "good" ? "emerald" : tone === "warn" ? "amber" : tone === "bad" ? "crimson" : "neutral";
  return (
    <Badge tone={badgeTone} dot>
      {label}
    </Badge>
  );
}

/** Sortable column header: the active column turns cobalt and shows its direction. */
export function SortHeader<K extends string>({
  label,
  column,
  sort,
  dir,
  onSort,
  align = "left",
  className,
  children,
}: {
  label: string;
  column: K;
  sort: K;
  dir: "asc" | "desc";
  onSort: (column: K) => void;
  align?: "left" | "center" | "right";
  className?: string;
  /** Rendered before the sort button, e.g. a select-all checkbox. */
  children?: ReactNode;
}) {
  const active = sort === column;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  const alignment = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th scope="col" aria-sort={ariaSort} className={`${TH} whitespace-nowrap ${alignment} ${className ?? ""}`}>
      <span className="inline-flex items-center gap-space-12">
        {children}
        <button
          type="button"
          onClick={() => onSort(column)}
          className={`-mx-space-4 inline-flex items-center gap-space-4 rounded-admin-badge px-space-4 py-0.5 uppercase outline-none transition-colors hover:bg-admin-hairline hover:text-admin-ink focus-visible:shadow-admin-focus ${
            active ? "text-admin-cobalt" : ""
          }`}
        >
          {label}
          <MaterialIcon
            name={!active ? "unfold_more" : dir === "asc" ? "arrow_upward" : "arrow_downward"}
            className={`text-[16px] ${active ? "text-admin-cobalt" : "text-admin-ink-faint"}`}
          />
        </button>
      </span>
    </th>
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
  "inline-flex h-8 min-w-8 items-center justify-center gap-0.5 rounded-admin-control border px-space-8 text-admin-label-md font-semibold tabular-nums outline-none transition-colors focus-visible:shadow-admin-focus";

const PAGER_IDLE =
  "border-admin-hairline bg-admin-card text-admin-ink-muted hover:border-admin-border hover:text-admin-ink disabled:cursor-not-allowed disabled:text-admin-ink-faint disabled:hover:border-admin-hairline";

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
      <span className="text-admin-body-sm tabular-nums text-admin-ink-subtle">
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
            className={`${PAGER_BUTTON} ${PAGER_IDLE}`}
          >
            <MaterialIcon name="chevron_left" className="text-[18px]" />
            <span className="hidden sm:inline">Previous</span>
          </button>
          {pageSlots(page, pageCount).map((slot, index) =>
            slot === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-admin-ink-faint" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={slot}
                type="button"
                aria-current={slot === page ? "page" : undefined}
                onClick={() => onPage(slot)}
                className={`${PAGER_BUTTON} ${
                  slot === page ? "border-admin-cobalt bg-admin-cobalt text-white" : PAGER_IDLE
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
            className={`${PAGER_BUTTON} ${PAGER_IDLE}`}
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
 * A quiet KPI: icon, label, big number, one caption, and an optional share bar
 * or trend line. Use it where a full CategoryCard would be too busy.
 */
export function KpiTile({
  icon,
  label,
  value,
  caption,
  color = ADMIN_COLORS.cobalt,
  progress,
  progressLabel,
  trend,
}: {
  icon: string;
  label: string;
  value: string;
  caption: ReactNode;
  color?: string;
  progress?: number;
  progressLabel?: string;
  /** Oldest-first values for a sparkline under the number. */
  trend?: readonly number[];
}) {
  return (
    <article className={`${CARD} ${CARD_HOVER} flex flex-col gap-space-12 p-space-16 2xl:p-space-20`}>
      <div className="flex items-center gap-space-8">
        <IconTile icon={icon} color={color} />
        <h3 className="text-admin-label-sm uppercase text-admin-ink-subtle">{label}</h3>
      </div>
      <p className="font-admin-display text-admin-metric tabular-nums text-admin-ink">{value}</p>
      {trend ? <Sparkline values={trend} color={color} /> : null}
      {progress != null ? (
        <ShareBar share={progress} color={color} label={progressLabel ?? label} />
      ) : null}
      <p className="text-admin-body-sm text-admin-ink-subtle">{caption}</p>
    </article>
  );
}

/** Enclosed switch, like the range toggle in the top bar. */
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
      className="inline-flex shrink-0 items-center gap-0.5 rounded-admin-control bg-admin-subtle p-0.5"
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
            className={`inline-flex h-7 items-center gap-space-4 rounded-admin-badge px-space-12 text-admin-label-md font-semibold outline-none transition-colors focus-visible:shadow-admin-focus ${
              on
                ? "bg-admin-card text-admin-cobalt shadow-admin-card ring-1 ring-admin-hairline"
                : "text-admin-ink-muted hover:text-admin-ink"
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
    <label className="relative flex min-w-0 flex-1 items-center sm:w-64 sm:flex-none">
      <span className="sr-only">{label}</span>
      <MaterialIcon
        name="search"
        className="pointer-events-none absolute left-space-12 text-[18px] text-admin-ink-faint"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${INPUT} pl-9`}
      />
    </label>
  );
}

type TooltipRow = {
  name?: string;
  value?: number | string;
  color?: string;
};

/** Dark chart tooltip shared by the admin charts. */
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
    <div className="rounded-admin-control bg-admin-ink px-space-12 py-space-8 shadow-admin-pop">
      <p className="text-admin-label-md font-semibold text-white/70">{label}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {payload.map((row) => (
          <li
            key={row.name}
            className="flex items-center justify-between gap-space-16 text-admin-body-sm text-white"
          >
            <span className="flex items-center gap-space-8">
              <span
                className="h-2 w-2 rounded-[2px]"
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

/** Escape to close, body scroll lock, and focus moved into the panel while open. */
function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [open]);

  return panelRef;
}

/**
 * 420px inspector pinned to the right edge. Full width on phones; the backdrop
 * dims below 1280px and stays clear (but still closes on click) above it.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  header,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  /** Replaces the default title block, e.g. with an avatar and badges. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        tabIndex={-1}
        onClick={onClose}
        className="admin-fade-in fixed inset-0 z-[70] cursor-default bg-admin-ink/30 xl:bg-admin-ink/5"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="admin-drawer-in fixed inset-y-0 right-0 z-[71] flex w-full flex-col border-l border-admin-border bg-admin-card shadow-admin-drawer outline-none sm:w-[420px]"
      >
        <div className="flex shrink-0 items-start gap-space-12 border-b border-admin-hairline px-space-20 py-space-16 pt-safe">
          <div className="min-w-0 flex-1">
            {header ?? (
              <>
                <h2 id={titleId} className="truncate font-admin-display text-admin-headline-md text-admin-ink">
                  {title}
                </h2>
                {subtitle ? (
                  <div className="mt-0.5 text-admin-body-sm text-admin-ink-subtle">{subtitle}</div>
                ) : null}
              </>
            )}
            {header ? (
              <h2 id={titleId} className="sr-only">
                {title}
              </h2>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-space-8 flex h-8 w-8 shrink-0 items-center justify-center rounded-admin-control text-admin-ink-subtle outline-none transition-colors hover:bg-admin-subtle hover:text-admin-ink focus-visible:shadow-admin-focus"
          >
            <MaterialIcon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-space-8 border-t border-admin-hairline bg-admin-canvas px-space-20 py-space-12 pb-safe">
            {footer}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Centred confirm dialog with a title, a line of context, and actions. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div className="admin-fade-in fixed inset-0 z-[80] flex items-center justify-center px-space-16">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-admin-ink/30"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-admin-card border border-admin-border bg-admin-card p-space-24 shadow-admin-pop outline-none"
      >
        <h2 id={titleId} className="font-admin-display text-admin-headline-md text-admin-ink">
          {title}
        </h2>
        {description ? (
          <div className="mt-space-8 text-admin-body-md text-admin-ink-muted">{description}</div>
        ) : null}
        {children ? <div className="mt-space-16">{children}</div> : null}
        <div className="mt-space-24 flex flex-wrap justify-end gap-space-8">{actions}</div>
      </div>
    </div>
  );
}
