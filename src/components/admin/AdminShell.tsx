"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ProfileButton } from "@/components/ProfileButton";
import type { AdminDashboardRole } from "@/lib/admins";
import { BLITZRUNDE_ICON } from "@/lib/blitzrunde";
import {
  ADMIN_RANGES,
  defaultAdminRangeForPath,
  adminRangeLabel,
  parseAdminRange,
  type AdminRange,
} from "@/lib/admin-overview";

const RAIL_EXPANDED = "16.25rem";
const RAIL_COLLAPSED = "4.5rem";
const RAIL_STORAGE_KEY = "nanu-admin-rail-collapsed";

type PickedAdminRange = { pathname: string; range: AdminRange };

const AdminRangeContext = createContext<{
  picked: PickedAdminRange | null;
  pick: (pathname: string, range: AdminRange) => void;
}>({
  picked: null,
  pick: () => {},
});

/** The date tab the admin picked on this page, or the range the server rendered. */
export function useAdminRange(serverRange: AdminRange): AdminRange {
  const pathname = usePathname();
  const { picked } = useContext(AdminRangeContext);
  if (picked && picked.pathname === pathname) return picked.range;
  return serverRange;
}

/**
 * Keeps `value` paired with the range it belongs to. A new tab keeps the
 * previous numbers until `load` returns, so the lists already on the page
 * are not fetched again.
 */
export function useAdminWindow<T>(
  serverRange: AdminRange,
  serverValue: T,
  load: (range: AdminRange) => Promise<T>,
): { range: AdminRange; value: T; pending: boolean } {
  const selected = useAdminRange(serverRange);
  const [loaded, setLoaded] = useState<{ range: AdminRange; value: T } | null>(null);

  useEffect(() => {
    if (selected === serverRange) return;
    let cancelled = false;
    void load(selected)
      .then((value) => {
        if (!cancelled) setLoaded({ range: selected, value });
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, serverRange, load]);

  if (selected === serverRange) {
    return { range: serverRange, value: serverValue, pending: false };
  }
  if (loaded?.range === selected) {
    return { range: selected, value: loaded.value, pending: false };
  }
  if (loaded) {
    return { range: loaded.range, value: loaded.value, pending: true };
  }
  return { range: serverRange, value: serverValue, pending: true };
}

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

const AdminRoleContext = createContext<AdminDashboardRole>("staff");

export function useAdminRole(): AdminDashboardRole {
  return useContext(AdminRoleContext);
}

export function StaffBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-admin-badge border border-admin-cobalt/20 bg-admin-cobalt-wash px-1.5 py-0.5 text-admin-label-sm text-admin-cobalt">
      <MaterialIcon name="admin_panel_settings" className="text-[14px]" />
      Staff
    </span>
  );
}

export function TeacherBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-admin-badge border border-admin-emerald/30 bg-admin-emerald-wash px-1.5 py-0.5 text-admin-label-sm text-admin-emerald-ink">
      <MaterialIcon name="school" className="text-[14px]" />
      Teacher
    </span>
  );
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
      { href: "/admin/outreach", label: "Outreach", icon: "support_agent", ready: true },
    ],
  },
  {
    id: "learning",
    label: "Learning",
    items: [
      { href: "/admin/levels", label: "Levels", icon: "route", ready: true },
      { href: "/admin/content", label: "Catalog", icon: "library_books", ready: true },
      { href: "/admin/content/clips", label: "Practice clip difficulty", icon: "graphic_eq", ready: true },
      { href: "/admin/content/videos", label: "Videos", icon: "smart_display", ready: true },
      { href: "/admin/content/grammar", label: "Grammar gaps", icon: "edit_note", ready: true },
      { href: "/admin/runs", label: "Practice", icon: "fitness_center", ready: true, ranged: true },
    ],
  },
  {
    id: "engagement",
    label: "Engagement",
    items: [
      { href: "/admin/activity", label: "Activity", icon: "timeline", ready: true, ranged: true },
      { href: "/admin/xp", label: "XP", icon: "bolt", ready: true, ranged: true },
      { href: "/admin/duels", label: "Duels", icon: "swords", ready: true, ranged: true },
      { href: "/admin/blitzrunde", label: "Blitzrunde", icon: BLITZRUNDE_ICON, ready: true },
      { href: "/admin/class-league", label: "Class league", icon: "groups", ready: true },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { href: "/admin/health", label: "Health", icon: "monitor_heart", ready: true },
      { href: "/admin/previews", label: "Previews", icon: "play_circle", ready: true },
    ],
  },
];

const TEACHER_HREFS = new Set([
  "/admin/students",
  "/admin/classes",
  "/admin/levels",
  "/admin/activity",
  "/admin/xp",
  "/admin/duels",
  "/admin/class-league",
]);

function navForRole(role: AdminDashboardRole): AdminNavGroup[] {
  if (role !== "teacher") return ADMIN_NAV;
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => TEACHER_HREFS.has(item.href)),
  })).filter((group) => group.items.length > 0);
}

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
    range === defaultAdminRangeForPath(href) ||
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
        className={`shrink-0 text-[20px] ${active ? "" : "text-admin-ink-subtle"}`}
        filled={active}
      />
      <span
        className={`min-w-0 flex-1 truncate text-left text-admin-body-md ${
          active ? "font-semibold" : "font-medium"
        } ${collapsed ? "lg:hidden" : ""}`}
      >
        {item.label}
      </span>
      {item.ready ? null : (
        <span
          className={`shrink-0 rounded-admin-badge bg-admin-subtle px-1.5 py-0.5 text-admin-label-sm uppercase text-admin-ink-subtle ${
            collapsed ? "lg:hidden" : ""
          }`}
        >
          Soon
        </span>
      )}
    </>
  );

  const shared =
    "flex h-9 w-full items-center gap-space-12 rounded-admin-control px-space-12 transition-colors";

  if (!item.ready) {
    return (
      <li>
        <span
          aria-disabled="true"
          aria-label={`${item.label} — not built yet`}
          title={`${item.label} is not built yet`}
          className={`${shared} cursor-not-allowed text-admin-ink-faint`}
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
            ? "bg-admin-cobalt-wash text-admin-cobalt"
            : "text-admin-ink-muted hover:bg-admin-subtle hover:text-admin-ink"
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
  const role = useAdminRole();
  const nav = navForRole(role);

  return (
    <aside
      id="admin-sidebar"
      aria-label="Admin sections"
      className={`fixed inset-y-0 left-0 z-50 flex w-[16.25rem] flex-col border-r border-admin-hairline bg-admin-card transition-transform duration-200 lg:w-[var(--admin-rail)] lg:translate-x-0 lg:transition-[width,transform] ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div
        className={`flex min-h-16 shrink-0 items-center gap-space-8 border-b border-admin-hairline px-space-16 py-space-8 ${
          collapsed
            ? "lg:h-auto lg:flex-col lg:justify-center lg:gap-space-8 lg:px-space-8 lg:py-space-12"
            : ""
        }`}
      >
        <Link
          href="/"
          onClick={onNavigate}
          aria-label="Back to the learner app"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-admin-card bg-admin-cobalt text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)] transition-colors hover:bg-admin-cobalt-strong"
        >
          <MaterialIcon name="school" className="text-[20px]" filled />
        </Link>
        <span
          className={`min-w-0 flex-1 truncate ${collapsed ? "lg:hidden" : ""}`}
        >
          <span className="block truncate font-admin-display text-admin-headline-sm text-admin-ink">
            Admin
          </span>
          {role === "staff" ? (
            <span className="block truncate text-[11px] font-medium leading-[14px] text-admin-ink-subtle">
              Staff · cannot delete
            </span>
          ) : role === "teacher" ? (
            <span className="block truncate text-[11px] font-medium leading-[14px] text-admin-ink-subtle">
              Teacher · your classes
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="admin-sidebar"
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-admin-control text-admin-ink-subtle transition-colors hover:bg-admin-subtle hover:text-admin-ink lg:flex ${
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
        {nav.map((group) => (
          <div key={group.id} className="mb-space-12 last:mb-0">
            {group.label ? (
              <p
                className={`px-space-12 pb-space-4 pt-space-8 text-admin-label-sm uppercase text-admin-ink-faint ${
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { picked } = useContext(AdminRangeContext);
  const rangeQuery =
    picked && picked.pathname === pathname
      ? picked.range === defaultAdminRangeForPath(pathname)
        ? null
        : picked.range
      : searchParams.get("range");
  return <AdminSidebar {...props} rangeQuery={rangeQuery} />;
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
      className={`h-7 rounded-admin-badge px-space-12 text-admin-label-md font-semibold transition-colors ${
        selected
          ? "bg-admin-card text-admin-cobalt shadow-admin-card ring-1 ring-admin-hairline"
          : "text-admin-ink-muted hover:text-admin-ink"
      }`}
    >
      {adminRangeLabel(range)}
    </button>
  );
}

/** Updates the date tab in place. The lists already on the page stay put. */
function RangePill() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pick } = useContext(AdminRangeContext);
  const fallback = defaultAdminRangeForPath(pathname);
  const current = useAdminRange(parseAdminRange(searchParams.get("range") ?? undefined, fallback));

  const select = useCallback(
    (range: AdminRange) => {
      pick(pathname, range);
      const params = new URLSearchParams(searchParams.toString());
      if (range === fallback) {
        params.delete("range");
      } else {
        params.set("range", range);
      }
      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      window.history.replaceState(window.history.state, "", url);
    },
    [pick, pathname, searchParams, fallback],
  );

  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex items-center gap-0.5 rounded-admin-control bg-admin-subtle p-0.5"
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
  return <div className="h-8 w-[17rem] rounded-admin-control bg-admin-subtle" />;
}

function AdminTopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const pathname = usePathname();
  const showRange = activeItem(pathname)?.ranged === true;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-admin-hairline/80 bg-white/85 pt-safe backdrop-blur-[12px]">
      <div className="flex h-16 w-full items-center gap-space-12 px-space-16 sm:px-space-24 min-[1440px]:px-space-32">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open admin menu"
          aria-controls="admin-sidebar"
          className="-ml-space-8 flex h-9 w-9 shrink-0 items-center justify-center rounded-admin-control text-admin-ink transition-colors hover:bg-admin-subtle lg:hidden"
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
          className="hidden h-9 shrink-0 items-center gap-space-4 rounded-admin-control border border-admin-hairline px-space-12 text-admin-label-md font-semibold text-admin-ink-muted transition-colors hover:border-admin-border hover:bg-admin-canvas hover:text-admin-ink sm:inline-flex"
        >
          Learner app
        </Link>

        <ProfileButton />
      </div>

      {showRange ? (
        <div className="flex w-full justify-center border-t border-admin-hairline/80 px-space-16 py-space-8 sm:hidden">
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
          <p className="text-admin-label-sm uppercase text-admin-cobalt">
            {kicker}
          </p>
        ) : null}
        <h1 className="font-admin-display text-admin-headline-lg text-admin-ink sm:text-admin-display-mobile">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-admin-body-md text-admin-ink-subtle">
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

export function AdminShell({
  children,
  role,
  fontClassName,
}: {
  children: ReactNode;
  role: AdminDashboardRole;
  /** next/font variable classes for Inter and JetBrains Mono, set by the layout. */
  fontClassName?: string;
}) {
  const pathname = usePathname();
  const [picked, setPicked] = useState<PickedAdminRange | null>(null);
  const pick = useCallback((path: string, range: AdminRange) => {
    setPicked({ pathname: path, range });
  }, []);
  const activePick = picked && picked.pathname === pathname ? picked : null;
  const rangeContext = useMemo(() => ({ picked: activePick, pick }), [activePick, pick]);
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
    <AdminRoleContext.Provider value={role}>
    <AdminRangeContext.Provider value={rangeContext}>
    <div
      data-layout="wide"
      className={`admin-root flex min-h-dvh w-full flex-1 ${fontClassName ?? ""}`}
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
          className="fixed inset-0 z-40 bg-admin-ink/30 lg:hidden"
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
    </AdminRangeContext.Provider>
    </AdminRoleContext.Provider>
  );
}
