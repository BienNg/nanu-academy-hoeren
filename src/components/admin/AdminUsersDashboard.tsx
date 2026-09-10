"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteAdminUser } from "@/app/admin/actions";
import {
  ADMIN_PAGE_SIZE,
  filterAdminUsers,
  paginateAdminUsers,
  sortAdminUsers,
  type AdminSortDir,
  type AdminSortKey,
  type AdminTrackColumn,
  type AdminTrackProgress,
  type AdminUserRow,
} from "@/lib/admin-overview";

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

function TrackCell({ track }: { track: AdminTrackProgress }) {
  if (!track.started) {
    return (
      <span className="font-body-sm text-body-sm text-outline">Not started</span>
    );
  }

  return (
    <div className="flex min-w-[7.5rem] flex-col gap-1">
      <div className="flex items-baseline justify-between gap-space-8">
        <span className="font-label-md text-label-md font-semibold text-on-surface">
          {track.percent}%
        </span>
        <span className="font-caption text-caption text-on-surface-variant">
          {track.completedCount}/{track.totalClips}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className={`h-full rounded-full ${
            track.percent >= 100 ? "bg-[#34C759]" : "bg-primary-container"
          }`}
          style={{ width: `${track.percent}%` }}
        />
      </div>
    </div>
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

type AdminUsersDashboardProps = {
  rows: AdminUserRow[];
  tracks: AdminTrackColumn[];
  storeConfigured: boolean;
  currentUserId: string;
};

export function AdminUsersDashboard({
  rows,
  tracks,
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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    setConfirmRow(null);
    setDeleting(false);
    startTransition(() => {
      router.refresh();
    });
  }

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
          <p className="shrink-0 font-body-sm text-body-sm text-on-surface-variant">
            {visibleRows.length} {visibleRows.length === 1 ? "user" : "users"}
          </p>
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
            Progress is per Ausbildung track. CEFR levels are not stored yet.
          </p>
        </div>

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
                  {tracks.map((track) => (
                    <th
                      key={track.slug}
                      scope="col"
                      title={track.label}
                      className="whitespace-nowrap px-space-16 py-space-12 text-left font-label-sm text-label-sm font-semibold text-on-surface-variant"
                    >
                      {track.shortLabel}
                    </th>
                  ))}
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
                      colSpan={3 + tracks.length}
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
                      className="group border-t border-outline-variant/20 hover:bg-surface-container-low/60"
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
                      {row.tracks.map((track) => (
                        <td key={track.slug} className="px-space-16 py-space-16">
                          <TrackCell track={track} />
                        </td>
                      ))}
                      <td className="sticky right-0 z-10 bg-surface-container-lowest px-space-12 py-space-16 text-right group-hover:bg-surface-container-low">
                        <button
                          type="button"
                          onClick={() => {
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
