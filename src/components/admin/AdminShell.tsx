"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ProfileButton } from "@/components/ProfileButton";
import {
  ADMIN_RANGES,
  DEFAULT_ADMIN_RANGE,
  adminRangeLabel,
  parseAdminRange,
  type AdminRange,
} from "@/lib/admin-overview";

const RAIL_EXPANDED = "16.25rem";
const RAIL_COLLAPSED = "4.25rem";
const RAIL_STORAGE_KEY = "nanu-admin-rail-collapsed";

/**
 * The rail preference lives in localStorage, which the server cannot read, so it
 * is exposed as an external store. That keeps the expanded default in the first
 * paint and swaps in the stored value on hydration without a mount effect.
 */
const railListeners = new Set<() => void>();

function readCollapsed(): boolean {
  return window.localStorage.getItem(RAIL_STORAGE_KEY) === "1";
}

function subscribeCollapsed(onChange: () => void): () => void {
  railListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    railListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function writeCollapsed(next: boolean): void {
  window.localStorage.setItem(RAIL_STORAGE_KEY, next ? "1" : "0");
  for (const listener of railListeners) listener();
}

export function MaterialIcon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

type AdminNavItem = {
  href: string;
  label: string;
  icon: string;
  /** Unbuilt sections render as disabled so the structure stays visible. */
  ready?: boolean;
  /** Whether the page reads the date range, so the pill can hide elsewhere. */
  ranged?: boolean;
};

type AdminNavGroup = {
  id: string;
  label: string | null;
  items: AdminNavItem[];
};

const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: "root",
    label: null,
    items: [
      {
        href: "/admin",
        label: "Overview",
        icon: "space_dashboard",
        ready: true,
        ranged: true,
      },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { href: "/admin/students", label: "Students", icon: "group", ready: true },
      { href: "/admin/classes", label: "Classes", icon: "school", ready: true },
      { href: "/admin/access", label: "Access", icon: "lock", ready: true },
    ],
  },
  {
    id: "learning",
    label: "Learning",
    items: [
      { href: "/admin/content", label: "Catalog", icon: "library_books", ready: true },
      { href: "/admin/content/clips", label: "Clip difficulty", icon: "graphic_eq", ready: true },
      { href: "/admin/content/videos", label: "Videos", icon: "smart_display", ready: true },
      { href: "/admin/runs", label: "Listening runs", icon: "headphones", ready: true, ranged: true },
    ],
  },
  {
    id: "engagement",
    label: "Engagement",
    items: [
      { href: "/admin/activity", label: "Activity", icon: "timeline", ready: true, ranged: true },
      { href: "/admin/retention", label: "Retention", icon: "event_repeat", ready: true, ranged: true },
      { href: "/admin/xp", label: "XP", icon: "bolt", ready: true, ranged: true },
      { href: "/admin/duels", label: "Duels", icon: "swords", ready: true, ranged: true },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [{ href: "/admin/health", label: "Health", icon: "monitor_heart", ready: true }],
  },
];

function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The deepest matching nav item, so `/admin/content/clips` beats `/admin/content`. */
function activeItem(pathname: string): AdminNavItem | null {
  let best: AdminNavItem | null = null;
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (!isActiveHref(pathname, item.href)) continue;
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}

function withAdminRange(href: string, range: string | null): string {
  if (
    !range ||
    range === DEFAULT_ADMIN_RANGE ||
    !(ADMIN_RANGES as readonly string[]).includes(range)
  ) {
    return href;
  }
  return `${href}?range=${range}`;
}

function NavRow({
  item,
  active,
  collapsed,
  rangeQuery,
  onNavigate,
}: {
  item: AdminNavItem;
  active: boolean;
  collapsed: boolean;
  rangeQuery: string | null;
  onNavigate: () => void;
}) {
  const body = (
    <>
      <MaterialIcon
        name={item.icon}
        className={`shrink-0 text-[20px] ${active ? "" : "text-outline"}`}
        filled={active}
      />
      <span
        className={`min-w-0 flex-1 truncate text-left font-label-md text-label-md ${
          active ? "font-bold" : "font-medium"
        } ${collapsed ? "lg:hidden" : ""}`}
      >
        {item.label}
      </span>
      {item.ready ? null : (
        <span
          className={`shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 font-caption text-[10px] font-semibold uppercase tracking-wider text-outline ${
            collapsed ? "lg:hidden" : ""
          }`}
        >
          Soon
        </span>
      )}
    </>
  );

  const shared =
    "flex h-10 w-full items-center gap-space-12 rounded-xl px-space-12 transition-colors";

  if (!item.ready) {
    return (
      <li>
        <span
          aria-disabled="true"
          aria-label={`${item.label} — not built yet`}
          title={`${item.label} is not built yet`}
          className={`${shared} cursor-not-allowed text-outline`}
        >
          {body}
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={withAdminRange(item.href, rangeQuery)}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        // Named explicitly because the collapsed rail hides the label text and
        // would otherwise fall back to the icon ligature.
        aria-label={item.label}
        title={collapsed ? item.label : undefined}
        className={`${shared} ${
          active
            ? "bg-primary-fixed text-on-primary-fixed"
            : "text-on-surface hover:bg-surface-container"
        }`}
      >
        {body}
      </Link>
    </li>
  );
}

function AdminSidebar({
  collapsed,
  open,
  rangeQuery,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed: boolean;
  open: boolean;
  rangeQuery: string | null;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      id="admin-sidebar"
      aria-label="Admin sections"
      className={`fixed inset-y-0 left-0 z-50 flex w-[16.25rem] flex-col border-r border-outline-variant/30 bg-surface-container-lowest transition-transform duration-200 lg:w-[var(--admin-rail)] lg:translate-x-0 lg:transition-[width,transform] ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div
        className={`flex h-16 shrink-0 items-center gap-space-8 border-b border-outline-variant/30 px-space-16 ${
          collapsed
            ? "lg:h-auto lg:flex-col lg:justify-center lg:gap-space-8 lg:px-space-8 lg:py-space-12"
            : ""
        }`}
      >
        <Link
          href="/"
          onClick={onNavigate}
          aria-label="Back to the learner app"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary transition-opacity hover:opacity-90"
        >
          <MaterialIcon name="hearing" className="text-[20px]" filled />
        </Link>
        <span
          className={`min-w-0 flex-1 truncate font-headline-sm text-headline-sm font-semibold tracking-tight text-on-surface ${
            collapsed ? "lg:hidden" : ""
          }`}
        >
          Admin
        </span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="admin-sidebar"
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container lg:flex ${
            collapsed ? "" : "ml-auto"
          }`}
        >
          <MaterialIcon
            name={collapsed ? "chevron_right" : "chevron_left"}
            className="text-[20px]"
          />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-space-8 py-space-12">
        {ADMIN_NAV.map((group) => (
          <div key={group.id} className="mb-space-12 last:mb-0">
            {group.label ? (
              <p
                className={`px-space-12 pb-space-4 pt-space-8 font-label-sm text-[11px] font-semibold uppercase tracking-[0.08em] text-outline ${
                  collapsed ? "lg:hidden" : ""
                }`}
              >
                {group.label}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  active={activeItem(pathname)?.href === item.href}
                  collapsed={collapsed}
                  rangeQuery={rangeQuery}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function AdminSidebarWithRange(
  props: Omit<Parameters<typeof AdminSidebar>[0], "rangeQuery">,
) {
  const searchParams = useSearchParams();
  return (
    <AdminSidebar {...props} rangeQuery={searchParams.get("range")} />
  );
}

function RangeOption({
  range,
  selected,
  onSelect,
}: {
  range: AdminRange;
  selected: boolean;
  onSelect: (range: AdminRange) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(range)}
      className={`h-7 rounded-full px-space-12 font-label-sm text-label-sm font-semibold transition-colors ${
        selected
          ? "bg-surface-container-lowest text-on-surface shadow-[0_1px_2px_rgba(27,27,29,0.12)]"
          : "text-on-surface-variant hover:text-on-surface"
      }`}
    >
      {adminRangeLabel(range)}
    </button>
  );
}

/** Writes `?range=` so range-aware pages can read it from their searchParams prop. */
function RangePill() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = parseAdminRange(searchParams.get("range") ?? undefined);

  const select = useCallback(
    (range: AdminRange) => {
      const params = new URLSearchParams(searchParams.toString());
      if (range === DEFAULT_ADMIN_RANGE) {
        params.delete("range");
      } else {
        params.set("range", range);
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [router, pathname, searchParams],
  );

  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex items-center rounded-full bg-surface-container p-1"
    >
      {ADMIN_RANGES.map((range) => (
        <RangeOption
          key={range}
          range={range}
          selected={range === current}
          onSelect={select}
        />
      ))}
    </div>
  );
}

function RangePillFallback() {
  return <div className="h-9 w-[17rem] rounded-full bg-surface-container" />;
}

function AdminTopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const pathname = usePathname();
  const showRange = activeItem(pathname)?.ranged === true;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-outline-variant/30 bg-surface/90 pt-safe backdrop-blur-xl">
      <div className="flex h-16 w-full items-center gap-space-12 px-space-16 sm:px-space-24">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open admin menu"
          aria-controls="admin-sidebar"
          className="-ml-space-8 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container lg:hidden"
        >
          <MaterialIcon name="menu" className="text-[22px]" />
        </button>

        <div className="min-w-0 flex-1" />

        {showRange ? (
          <div className="hidden sm:block">
            <Suspense fallback={<RangePillFallback />}>
              <RangePill />
            </Suspense>
          </div>
        ) : null}

        <Link
          href="/"
          className="hidden h-9 shrink-0 items-center gap-space-4 rounded-full px-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface sm:inline-flex"
        >
          <MaterialIcon name="arrow_back" className="text-[16px]" />
          Learner app
        </Link>

        <ProfileButton />
      </div>

      {showRange ? (
        <div className="flex w-full justify-center border-t border-outline-variant/20 px-space-16 py-space-8 sm:hidden">
          <Suspense fallback={<RangePillFallback />}>
            <RangePill />
          </Suspense>
        </div>
      ) : null}
    </header>
  );
}

/**
 * Page title block. Lives in the content area rather than the top bar so each
 * page owns its own heading, subtitle, and primary action.
 */
export function AdminPageHeader({
  kicker,
  title,
  subtitle,
  trailing,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-space-12">
      <div className="min-w-0">
        {kicker ? (
          <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-primary">
            {kicker}
          </p>
        ) : null}
        <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl font-body-sm text-body-sm text-on-surface-variant">
            {subtitle}
          </p>
        ) : null}
      </div>
      {trailing ? (
        <div className="flex shrink-0 items-center gap-space-12">{trailing}</div>
      ) : null}
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    () => false,
  );
  const [open, setOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    writeCollapsed(!readCollapsed());
  }, []);

  // Every nav link calls this, so the sheet closes on navigation without an effect.
  const closeSidebar = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div
      data-layout="wide"
      className="flex min-h-dvh w-full flex-1 bg-surface"
      style={
        {
          "--admin-rail": collapsed ? RAIL_COLLAPSED : RAIL_EXPANDED,
        } as CSSProperties
      }
    >
      {open ? (
        <button
          type="button"
          aria-label="Close admin menu"
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      ) : null}

      <Suspense
        fallback={
          <AdminSidebar
            collapsed={collapsed}
            open={open}
            rangeQuery={null}
            onToggleCollapsed={toggleCollapsed}
            onNavigate={closeSidebar}
          />
        }
      >
        <AdminSidebarWithRange
          collapsed={collapsed}
          open={open}
          onToggleCollapsed={toggleCollapsed}
          onNavigate={closeSidebar}
        />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col transition-[padding] duration-200 lg:pl-[var(--admin-rail)]">
        <AdminTopBar onOpenSidebar={() => setOpen(true)} />
        {children}
      </div>
    </div>
  );
}
