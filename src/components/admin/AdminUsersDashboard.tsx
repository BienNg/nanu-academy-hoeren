"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import {
  deleteAdminUser,
  setAdminUserLevelAccess,
} from "@/app/admin/actions";
import { StudentDetailModal } from "@/components/admin/StudentDetailModal";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import {
  ADMIN_PAGE_SIZE,
  filterAdminUsers,
  paginateAdminUsers,
  sortAdminUsers,
  type AdminLevelOption,
  type AdminSortDir,
  type AdminSortKey,
  type AdminUserRow,
} from "@/lib/admin-overview";
import { ProfileButton } from "@/components/ProfileButton";

function MaterialIcon({
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

function SortHeader({
  label,
  column,
  sort,
  dir,
  onSort,
  className,
}: {
  label: string;
  column: AdminSortKey;
  sort: AdminSortKey;
  dir: AdminSortDir;
  onSort: (column: AdminSortKey) => void;
  className?: string;
}) {
  const active = sort === column;
  const ariaSort = active ? (dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`whitespace-nowrap px-space-16 py-space-12 text-left font-label-sm text-label-sm font-semibold text-on-surface-variant ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-space-4 rounded-md px-space-4 py-0.5 transition-colors hover:bg-surface-container-high hover:text-on-surface"
      >
        {label}
        <MaterialIcon
          name={
            !active ? "unfold_more" : dir === "asc" ? "arrow_upward" : "arrow_downward"
          }
          className={`text-[16px] ${active ? "text-primary" : "text-outline"}`}
        />
      </button>
    </th>
  );
}

function formatAbsoluteTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StreakCell({ days }: { days: number }) {
  const active = days > 0;

  return (
    <td className="whitespace-nowrap px-space-16 py-space-16">
      <span
        className={`inline-flex items-center gap-space-4 ${
          active ? "text-on-surface" : "text-outline"
        }`}
        title={
          active
            ? `${days} day${days === 1 ? "" : "s"} in a row`
            : "No active streak"
        }
      >
        <MaterialIcon
          name="local_fire_department"
          className={`text-[18px] ${active ? "text-[#ff9500]" : "text-outline"}`}
          filled={active}
        />
        <span className="font-label-md text-label-md font-semibold">
          {days}
        </span>
        <span className="font-caption text-caption text-on-surface-variant">
          {days === 1 ? "day" : "days"}
        </span>
      </span>
    </td>
  );
}

function LastLoginCell({ iso }: { iso: string | null }) {
  const absolute = formatAbsoluteTime(iso);

  if (!iso || !absolute) {
    return (
      <td className="whitespace-nowrap px-space-16 py-space-16 font-body-sm text-body-sm text-outline">
        Never logged in
      </td>
    );
  }

  return (
    <td className="whitespace-nowrap px-space-16 py-space-16 font-body-sm text-body-sm text-on-surface">
      <time dateTime={iso}>{absolute}</time>
    </td>
  );
}

function LevelAccessCell({
  row,
  levels,
  granted,
  saving,
  onToggle,
}: {
  row: AdminUserRow;
  levels: readonly AdminLevelOption[];
  granted: readonly string[];
  saving: boolean;
  onToggle: (slug: string) => void;
}) {
  if (row.isAdmin) {
    return (
      <td className="px-space-16 py-space-16">
        <span className="inline-flex items-center gap-space-4 rounded-full bg-primary-fixed px-space-12 py-1 font-label-sm text-label-sm font-semibold text-on-primary-fixed">
          <MaterialIcon name="verified" className="text-[16px]" filled />
          All levels
        </span>
      </td>
    );
  }

  return (
    <td
      className="px-space-16 py-space-16"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex max-w-[28rem] flex-wrap gap-space-8">
        {levels.map((level) => {
          const on = granted.includes(level.slug);
          return (
            <button
              key={level.slug}
              type="button"
              aria-pressed={on}
              disabled={saving}
              title={on ? `Lock ${level.level}` : `Unlock ${level.level}`}
              onClick={() => onToggle(level.slug)}
              className={`inline-flex h-8 items-center gap-1 rounded-full px-space-12 font-label-sm text-label-sm font-semibold transition-colors disabled:opacity-50 ${
                on
                  ? "bg-primary text-on-primary"
                  : "border border-outline-variant/60 bg-surface text-on-surface-variant hover:bg-surface-container"
              }`}
            >
              <MaterialIcon
                name={on ? "lock_open" : "lock"}
                className="text-[14px]"
              />
              {level.level}
            </button>
          );
        })}
      </div>
    </td>
  );
}

type AdminUsersDashboardProps = {
  rows: AdminUserRow[];
  levels: readonly AdminLevelOption[];
  courseCatalog: readonly AdminCatalogCourse[];
  storeConfigured: boolean;
  currentUserId: string;
};

export function AdminUsersDashboard({
  rows,
  levels,
  courseCatalog,
  storeConfigured,
  currentUserId,
}: AdminUsersDashboardProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AdminSortKey>("lastLogin");
  const [dir, setDir] = useState<AdminSortDir>("desc");
  const [page, setPage] = useState(1);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [confirmRow, setConfirmRow] = useState<AdminUserRow | null>(null);
  const [detailRow, setDetailRow] = useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [accessByUser, setAccessByUser] = useState<Record<string, string[]>>({});
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);
  const savingRef = useRef(new Set<string>());

  function grantedFor(row: AdminUserRow): string[] {
    return accessByUser[row.userId] ?? row.levelAccess;
  }

  async function toggleLevel(row: AdminUserRow, slug: string) {
    if (row.isAdmin || savingRef.current.has(row.userId)) return;
    savingRef.current.add(row.userId);
    const current = grantedFor(row);
    const next = current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug];
    setAccessByUser((prev) => ({ ...prev, [row.userId]: next }));
    setSavingIds((prev) =>
      prev.includes(row.userId) ? prev : [...prev, row.userId],
    );
    setAccessError(null);
    try {
      const result = await setAdminUserLevelAccess(row.userId, next);
      if (!result.ok) {
        setAccessByUser((prev) => ({ ...prev, [row.userId]: current }));
        setAccessError(result.error);
        return;
      }
      setAccessByUser((prev) => ({ ...prev, [row.userId]: result.levelAccess }));
      startTransition(() => {
        router.refresh();
      });
    } finally {
      savingRef.current.delete(row.userId);
      setSavingIds((prev) => prev.filter((id) => id !== row.userId));
    }
  }

  const visibleRows = useMemo(
    () => rows.filter((row) => !deletedIds.includes(row.userId)),
    [rows, deletedIds],
  );

  const filtered = useMemo(
    () => filterAdminUsers(visibleRows, query),
    [visibleRows, query],
  );
  const sorted = useMemo(
    () => sortAdminUsers(filtered, sort, dir),
    [filtered, sort, dir],
  );
  const paged = useMemo(
    () => paginateAdminUsers(sorted, page, ADMIN_PAGE_SIZE),
    [sorted, page],
  );

  function handleSort(column: AdminSortKey) {
    if (sort === column) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setDir(column === "name" ? "asc" : "desc");
    }
    setPage(1);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  async function handleConfirmDelete() {
    if (!confirmRow || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteAdminUser(confirmRow.userId);
    if (!result.ok) {
      setDeleteError(result.error);
      setDeleting(false);
      return;
    }
    const deletedId = confirmRow.userId;
    setDeletedIds((current) =>
      current.includes(deletedId) ? current : [...current, deletedId],
    );
    setDetailRow((current) => (current?.userId === deletedId ? null : current));
    setConfirmRow(null);
    setDeleting(false);
    startTransition(() => {
      router.refresh();
    });
  }

  const closeDetail = useCallback(() => setDetailRow(null), []);

  const rangeStart =
    paged.total === 0 ? 0 : (paged.page - 1) * ADMIN_PAGE_SIZE + 1;
  const rangeEnd = Math.min(paged.page * ADMIN_PAGE_SIZE, paged.total);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-outline-variant/30 bg-surface/90 pt-safe backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between gap-space-16 px-space-24">
          <div className="flex min-w-0 items-center gap-space-12">
            <Link
              href="/"
              aria-label="Back to home"
              className="-ml-space-8 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-container"
            >
              <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
            </Link>
            <div className="flex min-w-0 flex-col">
              <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-primary">
                Admin
              </p>
              <h1 className="truncate font-headline-sm text-headline-sm tracking-tight text-on-surface">
                User overview
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-space-12">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {visibleRows.length} {visibleRows.length === 1 ? "user" : "users"}
            </p>
            <ProfileButton />
          </div>
        </div>
      </header>

      <main className="flex w-full flex-1 flex-col gap-space-20 px-space-24 py-space-24">
        {!storeConfigured ? (
          <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
            Cloud progress is not configured. This dashboard only lists
            learners who have synced progress to Supabase.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-space-12">
          <label className="relative min-w-[16rem] flex-1 max-w-md">
            <span className="sr-only">Search by name or email</span>
            <MaterialIcon
              name="search"
              className="pointer-events-none absolute left-space-12 top-1/2 -translate-y-1/2 text-[20px] text-outline"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Search by name or email"
              className="h-11 w-full rounded-2xl border border-outline-variant/50 bg-surface-container-lowest py-space-8 pl-10 pr-space-16 font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-fixed"
            />
          </label>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            New students start with every level locked. Turn a level on to give
            access. Select a row for lesson detail.
          </p>
        </div>

        {accessError ? (
          <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
            {accessError}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-lowest shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead className="bg-surface-container-low">
                <tr>
                  <SortHeader
                    label="User"
                    column="name"
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    className="sticky left-0 z-10 bg-surface-container-low"
                  />
                  <SortHeader
                    label="Last login"
                    column="lastLogin"
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Streak"
                    column="streak"
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                  />
                  <th
                    scope="col"
                    className="px-space-16 py-space-12 text-left font-label-sm text-label-sm font-semibold text-on-surface-variant"
                  >
                    Level access
                  </th>
                  <th
                    scope="col"
                    className="sticky right-0 z-10 whitespace-nowrap bg-surface-container-low px-space-16 py-space-12 text-right font-label-sm text-label-sm font-semibold text-on-surface-variant"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-space-16 py-space-48 text-center font-body-md text-body-md text-on-surface-variant"
                    >
                      {visibleRows.length === 0
                        ? "No users have synced progress yet."
                        : "No users match your search."}
                    </td>
                  </tr>
                ) : (
                  paged.pageRows.map((row) => (
                    <tr
                      key={row.userId}
                      tabIndex={0}
                      onClick={() => setDetailRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setDetailRow(row);
                      }}
                      className="group cursor-pointer border-t border-outline-variant/20 hover:bg-surface-container-low/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                    >
                      <td className="sticky left-0 z-10 bg-surface-container-lowest px-space-16 py-space-16 group-hover:bg-surface-container-low">
                        <div className="flex min-w-[14rem] flex-col">
                          <span className="font-label-md text-label-md font-semibold text-on-surface">
                            {row.displayName}
                          </span>
                          {row.email && row.email !== row.displayName ? (
                            <span className="font-body-sm text-body-sm text-on-surface-variant">
                              {row.email}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <LastLoginCell iso={row.lastLoginAt} />
                      <StreakCell days={row.streakDays} />
                      <LevelAccessCell
                        row={row}
                        levels={levels}
                        granted={grantedFor(row)}
                        saving={savingIds.includes(row.userId)}
                        onToggle={(slug) => void toggleLevel(row, slug)}
                      />
                      <td className="sticky right-0 z-10 bg-surface-container-lowest px-space-12 py-space-16 text-right group-hover:bg-surface-container-low">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteError(null);
                            setConfirmRow(row);
                          }}
                          className="inline-flex h-9 items-center gap-space-4 rounded-xl px-space-12 font-label-sm text-label-sm font-semibold text-error transition-colors hover:bg-error-container"
                          aria-label={`Delete ${row.displayName}`}
                        >
                          <MaterialIcon name="delete" className="text-[18px]" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-space-12 border-t border-outline-variant/20 px-space-16 py-space-12">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {paged.total === 0
                ? "0 users"
                : `${rangeStart}–${rangeEnd} of ${paged.total}`}
            </p>
            <div className="flex items-center gap-space-8">
              <button
                type="button"
                disabled={paged.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="inline-flex h-9 items-center rounded-xl border border-outline-variant/50 bg-white px-space-12 font-label-sm text-label-sm text-on-surface transition-opacity hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Page {paged.page}/{paged.pageCount}
              </span>
              <button
                type="button"
                disabled={paged.page >= paged.pageCount}
                onClick={() =>
                  setPage((current) => Math.min(paged.pageCount, current + 1))
                }
                className="inline-flex h-9 items-center rounded-xl border border-outline-variant/50 bg-white px-space-12 font-label-sm text-label-sm text-on-surface transition-opacity hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>

      {detailRow ? (
        <StudentDetailModal
          row={detailRow}
          catalog={courseCatalog}
          onClose={closeDetail}
        />
      ) : null}

      {confirmRow ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-space-24"
          role="presentation"
          onClick={() => {
            if (!deleting) {
              setConfirmRow(null);
              setDeleteError(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            className="w-full max-w-md rounded-3xl bg-surface-container-lowest p-space-24 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="delete-account-title"
              className="font-headline-sm text-headline-sm text-on-surface"
            >
              Delete account?
            </h2>
            <p className="mt-space-8 font-body-md text-body-md text-on-surface-variant">
              This removes{" "}
              <span className="font-semibold text-on-surface">
                {confirmRow.email ?? confirmRow.displayName}
              </span>
              {confirmRow.userId === currentUserId ? " (you)" : ""} from the
              dashboard and deletes their cloud progress. They can sign in again
              and start over.
            </p>
            {deleteError ? (
              <p className="mt-space-12 font-body-sm text-body-sm text-error">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-space-24 flex justify-end gap-space-8">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setConfirmRow(null);
                  setDeleteError(null);
                }}
                className="inline-flex h-11 items-center rounded-2xl px-space-16 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex h-11 items-center rounded-2xl bg-error px-space-16 font-label-md text-label-md text-on-error transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
