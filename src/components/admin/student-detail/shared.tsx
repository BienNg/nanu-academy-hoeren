"use client";

import type { ReactNode } from "react";
import { MaterialIcon } from "@/components/admin/AdminShell";
import { CARD, Segmented } from "@/components/admin/AdminUi";
import type { AdminVisitRange } from "@/lib/admin-detail";
import { formatAdminTimestamp } from "@/lib/admin-overview";
import { formatActiveDuration } from "@/lib/progress";

export type DetailTab = "overview" | "courses" | "activity" | "account";

export function formatAbsoluteTime(iso: string | null): string | null {
  return formatAdminTimestamp(iso);
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function compactDuration(label: string): string {
  return label
    .replace("under 1 min", "<1m")
    .replace(/(\d+)\s+h\s+(\d+)\s+min/g, "$1h $2m")
    .replace(/(\d+)\s+h/g, "$1h")
    .replace(/(\d+)\s+min/g, "$1m");
}

export function shortDuration(seconds: number): string {
  return compactDuration(formatActiveDuration(seconds));
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${CARD} overflow-hidden ${className}`}>{children}</div>;
}

/** Section title with a one-line description and an optional control on the right. */
export function ColumnHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 flex-wrap items-start justify-between gap-space-12">
      <div className="min-w-0">
        <h3 className="font-admin-display text-admin-headline-sm text-admin-ink">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-admin-body-sm text-admin-ink-subtle">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function MetricBand({
  items,
  columns = "four",
}: {
  items: { label: string; value: string; detail?: string | null; title?: string }[];
  columns?: "four" | "two";
}) {
  return (
    <Panel>
      <dl
        className={`grid gap-px bg-admin-hairline ${
          columns === "two" ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {items.map((item) => (
          <div key={item.label} title={item.title} className="min-w-0 bg-admin-card px-space-16 py-space-16 sm:px-space-20">
            <dt className="text-admin-label-sm uppercase text-admin-ink-subtle">{item.label}</dt>
            <dd className="mt-space-8 whitespace-nowrap font-admin-display text-[26px] font-semibold leading-8 tabular-nums tracking-[-0.02em] text-admin-ink sm:text-admin-metric">
              {item.value}
            </dd>
            <dd className="mt-1 min-h-4 truncate text-[12px] leading-4 text-admin-ink-subtle">
              {item.detail ?? " "}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export type StripTone = "cobalt" | "violet" | "emerald" | "neutral";

const STRIP_TONE: Record<StripTone, string> = {
  cobalt: "bg-admin-cobalt-wash text-admin-cobalt",
  violet: "bg-admin-violet-wash text-admin-violet",
  emerald: "bg-admin-emerald-wash text-admin-emerald",
  neutral: "bg-admin-subtle text-admin-ink-subtle",
};

/** A row of small totals. With icons it reads as tiles; without, as labelled numbers. */
export function StatStrip({
  items,
}: {
  items: { label: string; value: string; icon?: string; tone?: StripTone }[];
}) {
  const iconic = items.every((item) => item.icon);
  const columns =
    items.length === 4 ? "grid-cols-4" : items.length === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <Panel>
      <div className={`grid gap-px bg-admin-hairline ${columns}`}>
        {items.map((item) =>
          iconic ? (
            <div
              key={item.label}
              className="flex min-w-0 flex-col items-center gap-1 bg-admin-card px-space-8 py-space-12 text-center"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-admin-control ${STRIP_TONE[item.tone ?? "cobalt"]}`}
              >
                <MaterialIcon name={item.icon!} className="text-[16px]" filled />
              </span>
              <p className="text-admin-body-md font-semibold tabular-nums text-admin-ink">{item.value}</p>
              <p className="text-[11px] leading-[14px] text-admin-ink-subtle">{item.label}</p>
            </div>
          ) : (
            <div key={item.label} className="min-w-0 bg-admin-card px-space-16 py-space-12">
              <p className="text-admin-label-sm uppercase text-admin-ink-subtle">{item.label}</p>
              <p className="mt-1 font-admin-display text-admin-headline-md tabular-nums text-admin-ink">
                {item.value}
              </p>
            </div>
          ),
        )}
      </div>
    </Panel>
  );
}

const VISIT_RANGES: { key: AdminVisitRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "all", label: "All time" },
];

export function VisitRangeSwitch({
  range,
  onChange,
}: {
  range: AdminVisitRange;
  onChange: (range: AdminVisitRange) => void;
}) {
  return (
    <Segmented ariaLabel="Visit range" value={range} options={VISIT_RANGES} onSelect={onChange} />
  );
}

export function AccessSwitch({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`relative h-5 w-9 shrink-0 overflow-hidden rounded-full outline-none transition-colors focus-visible:shadow-admin-focus disabled:opacity-40 ${
        on ? "bg-admin-cobalt" : "bg-admin-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.25)] transition-[left] ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function DeleteProgressButton({
  label,
  onClick,
  className = "",
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-admin-control text-admin-ink-faint outline-none transition-colors hover:bg-admin-crimson-wash hover:text-admin-crimson focus-visible:shadow-admin-focus ${className}`}
    >
      <MaterialIcon name="delete" className="text-[18px]" />
    </button>
  );
}

export function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <Panel>
      <p className="px-space-24 py-space-40 text-center text-admin-body-md text-admin-ink-muted">
        {children}
      </p>
    </Panel>
  );
}
