"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  removeAdminPendingAccess,
  setAdminPendingAccess,
  setAdminUserInterviewAccess,
  setAdminUserLevelAccess,
} from "@/app/admin/actions";
import { AdminPageHeader, MaterialIcon, StaffBadge } from "@/components/admin/AdminShell";
import {
  ADMIN_PAGE_SIZE,
  buildAdminAccessBoard,
  classKey,
  filterAdminUsers,
  listAdminClasses,
  paginateAdminUsers,
  sortAdminUsers,
  usersInClass,
  type AdminLevelOption,
  type AdminUserRow,
} from "@/lib/admin-overview";
import type { PendingLevelGrant } from "@/lib/progress-store";

function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

function SummaryStat({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-space-16 shadow-sm">
      <div className="flex items-center gap-space-8">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed">
          <MaterialIcon name={icon} className="text-[18px]" />
        </div>
        <p className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">
          {label}
        </p>
      </div>
      <p className="mt-space-12 font-headline-lg text-headline-lg tabular-nums text-on-surface">
        {value}
      </p>
      <p className="mt-1 font-caption text-caption text-on-surface-variant">{hint}</p>
    </div>
  );
}

function GrantChip({
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
      className={`inline-flex h-8 items-center gap-1 rounded-full px-space-12 font-label-sm text-label-sm font-semibold transition-colors disabled:opacity-50 ${
        on
          ? "bg-primary text-on-primary"
          : "border border-outline-variant/60 bg-surface text-on-surface-variant hover:bg-surface-container"
      }`}
    >
      <MaterialIcon name={on ? "lock_open" : "lock"} className="text-[14px]" />
      {label}
    </button>
  );
}

export function AdminAccess({
  rows,
  levels,
  storeConfigured,
  pending,
  pendingReady,
}: {
  rows: AdminUserRow[];
  levels: readonly AdminLevelOption[];
  storeConfigured: boolean;
  pending: PendingLevelGrant[];
  pendingReady: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string | "all">("all");
  const [lockedOnly, setLockedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [accessByUser, setAccessByUser] = useState<Record<string, string[]>>({});
  const [interviewByUser, setInterviewByUser] = useState<Record<string, boolean>>({});
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [savingInterviewIds, setSavingInterviewIds] = useState<string[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [draftLevels, setDraftLevels] = useState<string[]>([]);
  const [draftInterview, setDraftInterview] = useState(false);
  const [savingGrant, setSavingGrant] = useState(false);
  const [pendingRows, setPendingRows] = useState(pending);
  const [savingPending, setSavingPending] = useState<string[]>([]);
  const savingRef = useRef(new Set<string>());
  const savingInterviewRef = useRef(new Set<string>());
  const savingPendingRef = useRef(new Set<string>());
  const pendingSignature = pending
    .map((row) => `${row.email}:${row.levelAccess.join(",")}:${row.interviewAccess}`)
    .join("|");
  const [seenPending, setSeenPending] = useState(pendingSignature);
  if (seenPending !== pendingSignature) {
    setSeenPending(pendingSignature);
    setPendingRows(pending);
  }

  function grantedFor(row: AdminUserRow): string[] {
    return accessByUser[row.userId] ?? row.levelAccess;
  }

  function interviewFor(row: AdminUserRow): boolean {
    if (Object.hasOwn(interviewByUser, row.userId)) return interviewByUser[row.userId];
    return row.interviewAccess;
  }

  const liveRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        levelAccess: accessByUser[row.userId] ?? row.levelAccess,
        interviewAccess: Object.hasOwn(interviewByUser, row.userId)
          ? interviewByUser[row.userId]
          : row.interviewAccess,
      })),
    [rows, accessByUser, interviewByUser],
  );

  const board = useMemo(
    () => buildAdminAccessBoard(liveRows, levels),
    [liveRows, levels],
  );
  const classOptions = useMemo(() => listAdminClasses(liveRows), [liveRows]);
  const unassignedCount = useMemo(
    () => liveRows.filter((row) => !classKey(row.className)).length,
    [liveRows],
  );

  const filtered = useMemo(() => {
    const searched = filterAdminUsers(liveRows, query);
    const inClass =
      classFilter === "all" ? searched : usersInClass(searched, classFilter);
    if (!lockedOnly) return inClass;
    return inClass.filter((row) => !row.isAdmin && row.levelAccess.length === 0);
  }, [liveRows, query, classFilter, lockedOnly]);

  const sorted = useMemo(
    () => sortAdminUsers(filtered, "name", "asc"),
    [filtered],
  );
  const paged = useMemo(
    () => paginateAdminUsers(sorted, page, ADMIN_PAGE_SIZE),
    [sorted, page],
  );

  async function toggleLevel(row: AdminUserRow, slug: string) {
    if (
      row.isAdmin ||
      savingRef.current.has(row.userId) ||
      savingInterviewRef.current.has(row.userId)
    ) {
      return;
    }
    savingRef.current.add(row.userId);
    const current = grantedFor(row);
    const next = current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug];
    setAccessByUser((prev) => ({ ...prev, [row.userId]: next }));
    setSavingIds((prev) => (prev.includes(row.userId) ? prev : [...prev, row.userId]));
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

  async function toggleInterview(row: AdminUserRow) {
    if (
      row.isAdmin ||
      savingRef.current.has(row.userId) ||
      savingInterviewRef.current.has(row.userId)
    ) {
      return;
    }
    savingInterviewRef.current.add(row.userId);
    const current = interviewFor(row);
    const next = !current;
    setInterviewByUser((prev) => ({ ...prev, [row.userId]: next }));
    setSavingInterviewIds((prev) =>
      prev.includes(row.userId) ? prev : [...prev, row.userId],
    );
    setAccessError(null);
    try {
      const result = await setAdminUserInterviewAccess(row.userId, next);
      if (!result.ok) {
        setInterviewByUser((prev) => ({ ...prev, [row.userId]: current }));
        setAccessError(result.error);
        return;
      }
      setInterviewByUser((prev) => ({
        ...prev,
        [row.userId]: result.interviewAccess,
      }));
      startTransition(() => {
        router.refresh();
      });
    } finally {
      savingInterviewRef.current.delete(row.userId);
      setSavingInterviewIds((prev) => prev.filter((id) => id !== row.userId));
    }
  }

  async function savePendingGrant() {
    const email = grantEmail.trim();
    if (!email || savingGrant) return;
    if (draftLevels.length === 0 && !draftInterview) {
      setAccessError("Choose at least one course.");
      return;
    }
    setSavingGrant(true);
    setAccessError(null);
    try {
      const result = await setAdminPendingAccess(email, draftLevels, draftInterview);
      if (!result.ok) {
        setAccessError(result.error);
        return;
      }
      const grant = result.grant;
      if (grant) {
        setPendingRows((current) =>
          [...current.filter((row) => row.email !== grant.email), grant].sort((a, b) =>
            a.email.localeCompare(b.email),
          ),
        );
      }
      setGrantEmail("");
      setDraftLevels([]);
      setDraftInterview(false);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setSavingGrant(false);
    }
  }

  async function togglePendingLevel(row: PendingLevelGrant, slug: string) {
    if (savingPendingRef.current.has(row.email)) return;
    savingPendingRef.current.add(row.email);
    const current = row.levelAccess;
    const next = current.includes(slug)
      ? current.filter((item) => item !== slug)
      : [...current, slug];
    setPendingRows((prev) =>
      prev.map((item) => (item.email === row.email ? { ...item, levelAccess: next } : item)),
    );
    setSavingPending((prev) => (prev.includes(row.email) ? prev : [...prev, row.email]));
    setAccessError(null);
    try {
      const result = await setAdminPendingAccess(row.email, next, row.interviewAccess);
      if (!result.ok) {
        setPendingRows((prev) =>
          prev.map((item) =>
            item.email === row.email ? { ...item, levelAccess: current } : item,
          ),
        );
        setAccessError(result.error);
        return;
      }
      const grant = result.grant;
      setPendingRows((prev) => {
        if (!grant) return prev.filter((item) => item.email !== row.email);
        return prev.map((item) => (item.email === row.email ? grant : item));
      });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      savingPendingRef.current.delete(row.email);
      setSavingPending((prev) => prev.filter((email) => email !== row.email));
    }
  }

  async function togglePendingInterview(row: PendingLevelGrant) {
    if (savingPendingRef.current.has(row.email)) return;
    savingPendingRef.current.add(row.email);
    const next = !row.interviewAccess;
    setPendingRows((prev) =>
      prev.map((item) =>
        item.email === row.email ? { ...item, interviewAccess: next } : item,
      ),
    );
    setSavingPending((prev) => (prev.includes(row.email) ? prev : [...prev, row.email]));
    setAccessError(null);
    try {
      const result = await setAdminPendingAccess(row.email, row.levelAccess, next);
      if (!result.ok) {
        setPendingRows((prev) =>
          prev.map((item) =>
            item.email === row.email ? { ...item, interviewAccess: row.interviewAccess } : item,
          ),
        );
        setAccessError(result.error);
        return;
      }
      const grant = result.grant;
      setPendingRows((prev) => {
        if (!grant) return prev.filter((item) => item.email !== row.email);
        return prev.map((item) => (item.email === row.email ? grant : item));
      });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      savingPendingRef.current.delete(row.email);
      setSavingPending((prev) => prev.filter((email) => email !== row.email));
    }
  }

  async function removePending(email: string) {
    if (savingPendingRef.current.has(email)) return;
    savingPendingRef.current.add(email);
    const previous = pendingRows;
    setPendingRows((prev) => prev.filter((row) => row.email !== email));
    setSavingPending((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setAccessError(null);
    try {
      const result = await removeAdminPendingAccess(email);
      if (!result.ok) {
        setPendingRows(previous);
        setAccessError(result.error);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } finally {
      savingPendingRef.current.delete(email);
      setSavingPending((prev) => prev.filter((item) => item !== email));
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function handleClassFilter(next: string | "all") {
    setClassFilter(next);
    setPage(1);
  }

  const rangeStart = paged.total === 0 ? 0 : (paged.page - 1) * ADMIN_PAGE_SIZE + 1;
  const rangeEnd = Math.min(paged.page * ADMIN_PAGE_SIZE, paged.total);
  const learnerDenom = Math.max(board.learners, 1);

  const classChips: { key: string | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: liveRows.length },
    ...classOptions.map((option) => ({
      key: option.key,
      label: option.label,
      count: option.count,
    })),
    ...(unassignedCount > 0
      ? [{ key: "" as const, label: "Unassigned", count: unassignedCount }]
      : []),
  ];

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24">
      <AdminPageHeader
        kicker="People"
        title="Access"
        subtitle="Who can open each CEFR level and Luyện phỏng vấn, including emails that have not signed up yet. Admins are unlocked everywhere."
      />

      {!storeConfigured ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          Cloud progress is not configured. This page only lists learners who have
          synced progress to Supabase.
        </div>
      ) : null}

      {accessError ? (
        <div className="rounded-2xl border border-error-container bg-error-container/40 px-space-20 py-space-16 font-body-sm text-body-sm text-on-error-container">
          {accessError}
        </div>
      ) : null}

      <section
        aria-label="Access totals"
        className="grid grid-cols-2 gap-space-12 md:grid-cols-3 xl:grid-cols-5"
      >
        <SummaryStat
          label="Students"
          value={formatCount(board.students)}
          icon="group"
          hint="Everyone with a progress record"
        />
        <SummaryStat
          label="With a level"
          value={formatCount(board.withLevel)}
          icon="lock_open"
          hint="Learners granted at least one CEFR level"
        />
        <SummaryStat
          label="None"
          value={formatCount(board.locked)}
          icon="lock"
          hint="Learners with no CEFR level yet"
        />
        <SummaryStat
          label="Interview"
          value={formatCount(board.interview)}
          icon="record_voice_over"
          hint="Learners who can open Luyện phỏng vấn"
        />
        <SummaryStat
          label="Admins"
          value={formatCount(board.admins)}
          icon="verified"
          hint="Already have every course"
        />
      </section>

      <div className="grid grid-cols-1 gap-space-16 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
          <div className="px-space-16 py-space-12">
            <h2 className="font-label-md text-label-md font-semibold text-on-surface">
              Coverage by level
            </h2>
            <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
              Share of learners, not including admins.
            </p>
          </div>
          {board.learners === 0 ? (
            <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
              No learners to count yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-space-12 px-space-16 pb-space-16">
              {board.levels.map((level) => {
                const pct = Math.round((level.granted / learnerDenom) * 100);
                return (
                  <li key={level.slug}>
                    <div className="flex items-baseline justify-between gap-space-12">
                      <p className="font-label-md text-label-md font-semibold text-on-surface">
                        {level.label}
                      </p>
                      <p className="font-caption text-caption tabular-nums text-on-surface-variant">
                        {formatCount(level.granted)} of {formatCount(board.learners)} · {pct}%
                      </p>
                    </div>
                    <div className="mt-space-8 h-2 overflow-hidden rounded-full bg-surface-container-high">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
          <div className="px-space-16 py-space-12">
            <h2 className="font-label-md text-label-md font-semibold text-on-surface">
              Coverage by class
            </h2>
            <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
              Granted counts include admins in that class.
            </p>
          </div>
          {board.classes.length === 0 ? (
            <p className="px-space-16 py-space-24 font-body-sm text-body-sm text-on-surface-variant">
              No classes yet. Assign one on Students.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left">
                <thead>
                  <tr className="border-t border-outline-variant/15 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                    <th className="px-space-16 py-space-8">Class</th>
                    <th className="px-space-12 py-space-8 text-right">Students</th>
                    {levels.map((level) => (
                      <th key={level.slug} className="px-space-12 py-space-8 text-right">
                        {level.level}
                      </th>
                    ))}
                    <th className="px-space-12 py-space-8 text-right">Interview</th>
                    <th className="px-space-16 py-space-8 text-right">None</th>
                  </tr>
                </thead>
                <tbody>
                  {board.classes.map((row) => (
                    <tr
                      key={row.key || "unassigned"}
                      className="border-t border-outline-variant/15 font-body-sm text-body-sm text-on-surface"
                    >
                      <td className="px-space-16 py-space-8 font-medium">{row.label}</td>
                      <td className="px-space-12 py-space-8 text-right tabular-nums">
                        {formatCount(row.students)}
                      </td>
                      {levels.map((level) => (
                        <td
                          key={level.slug}
                          className="px-space-12 py-space-8 text-right tabular-nums"
                        >
                          {formatCount(row.grantedBySlug[level.slug] ?? 0)}
                        </td>
                      ))}
                      <td className="px-space-12 py-space-8 text-right tabular-nums">
                        {formatCount(row.interview)}
                      </td>
                      <td className="px-space-16 py-space-8 text-right tabular-nums font-medium">
                        {formatCount(row.locked)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-space-16 overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-space-16 shadow-sm">
        <div>
          <h2 className="font-label-md text-label-md font-semibold text-on-surface">
            Pre-unlock
          </h2>
          <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
            Grant courses to an email that has not signed up yet. When they sign
            in with Google using that address, those courses are already open.
          </p>
        </div>
        {storeConfigured && !pendingReady ? (
          <p className="rounded-2xl border border-error-container bg-error-container/40 px-space-16 py-space-12 font-body-sm text-body-sm text-on-error-container">
            Pre-unlock is not ready yet. Run supabase/pending_level_access.sql once
            in the Supabase SQL editor, then reload this page.
          </p>
        ) : null}
        <form
          className="flex flex-col gap-space-12"
          onSubmit={(event) => {
            event.preventDefault();
            void savePendingGrant();
          }}
        >
          <label className="flex w-full max-w-md flex-col gap-space-8">
            <span className="font-label-sm text-label-sm font-semibold text-on-surface">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="off"
              value={grantEmail}
              onChange={(event) => setGrantEmail(event.target.value)}
              placeholder="student@email.com"
              disabled={!storeConfigured || !pendingReady || savingGrant}
              className="h-11 w-full rounded-2xl border border-outline-variant/50 bg-surface-container-lowest px-space-16 font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-fixed disabled:opacity-50"
            />
          </label>
          <div className="flex flex-wrap gap-space-8">
            {levels.map((level) => {
              const on = draftLevels.includes(level.slug);
              return (
                <GrantChip
                  key={level.slug}
                  label={level.level}
                  on={on}
                  disabled={!storeConfigured || !pendingReady || savingGrant}
                  title={on ? `Remove ${level.level}` : `Grant ${level.level}`}
                  onToggle={() =>
                    setDraftLevels((current) =>
                      current.includes(level.slug)
                        ? current.filter((slug) => slug !== level.slug)
                        : [...current, level.slug],
                    )
                  }
                />
              );
            })}
            <GrantChip
              label="Phỏng vấn"
              on={draftInterview}
              disabled={!storeConfigured || !pendingReady || savingGrant}
              title={
                draftInterview
                  ? "Remove Luyện phỏng vấn theo nghề"
                  : "Grant Luyện phỏng vấn theo nghề"
              }
              onToggle={() => setDraftInterview((current) => !current)}
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={!storeConfigured || !pendingReady || savingGrant}
              className="inline-flex h-11 items-center rounded-2xl bg-primary px-space-16 font-label-md text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingGrant ? "Saving…" : "Pre-unlock"}
            </button>
          </div>
        </form>
        {!pendingReady ? null : pendingRows.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            No emails are waiting to sign up.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-outline-variant/20 border-t border-outline-variant/20">
            {pendingRows.map((row) => {
              const busy = savingPending.includes(row.email);
              return (
                <li
                  key={row.email}
                  className="flex flex-col gap-space-12 py-space-16 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="min-w-[12rem] font-label-md text-label-md font-semibold text-on-surface">
                    {row.email}
                  </p>
                  <div className="flex flex-1 flex-wrap items-center gap-space-8">
                    {levels.map((level) => {
                      const on = row.levelAccess.includes(level.slug);
                      return (
                        <GrantChip
                          key={level.slug}
                          label={level.level}
                          on={on}
                          disabled={busy}
                          title={on ? `Lock ${level.level}` : `Unlock ${level.level}`}
                          onToggle={() => void togglePendingLevel(row, level.slug)}
                        />
                      );
                    })}
                    <GrantChip
                      label="Phỏng vấn"
                      on={row.interviewAccess}
                      disabled={busy}
                      title={
                        row.interviewAccess
                          ? "Hide Luyện phỏng vấn theo nghề"
                          : "Show Luyện phỏng vấn theo nghề"
                      }
                      onToggle={() => void togglePendingInterview(row)}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removePending(row.email)}
                      className="inline-flex h-8 items-center rounded-full px-space-12 font-label-sm text-label-sm font-semibold text-error disabled:opacity-50 hover:bg-error-container/40"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-space-12 overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-space-12 px-space-16 py-space-12">
          <div>
            <h2 className="font-label-md text-label-md font-semibold text-on-surface">
              Grants
            </h2>
            <p className="mt-0.5 font-caption text-caption text-on-surface-variant">
              Toggle a level to unlock or lock it. Same grants as on Students.
            </p>
          </div>
          <div className="flex flex-col gap-space-12 lg:flex-row lg:items-center">
            <label className="relative w-full max-w-md">
              <span className="sr-only">Search by name, email, or class</span>
              <MaterialIcon
                name="search"
                className="pointer-events-none absolute left-space-12 top-1/2 -translate-y-1/2 text-[20px] text-outline"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder="Search by name, email, or class"
                className="h-11 w-full rounded-2xl border border-outline-variant/50 bg-surface-container-lowest py-space-8 pl-10 pr-space-16 font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-fixed"
              />
            </label>
            <label className="inline-flex h-11 cursor-pointer items-center gap-space-8 rounded-2xl border border-outline-variant/40 px-space-16 font-label-sm text-label-sm font-semibold text-on-surface">
              <input
                type="checkbox"
                checked={lockedOnly}
                onChange={(event) => {
                  setLockedOnly(event.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 accent-primary"
              />
              No CEFR level
            </label>
          </div>
          <div
            role="tablist"
            aria-label="Filter by class"
            className="flex flex-wrap gap-space-8"
          >
            {classChips.map((chip) => {
              const selected = chip.key === classFilter;
              return (
                <button
                  key={chip.key === "" ? "unassigned" : chip.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => handleClassFilter(chip.key)}
                  className={`inline-flex h-9 items-center gap-space-8 rounded-full px-space-16 font-label-sm text-label-sm font-semibold transition-colors ${
                    selected
                      ? "bg-primary text-on-primary"
                      : "border border-outline-variant/40 bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {chip.label}
                  <span
                    className={`tabular-nums ${selected ? "text-on-primary/80" : "text-on-surface-variant"}`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="sticky left-0 z-10 bg-surface-container-low px-space-16 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Student
                </th>
                <th className="px-space-16 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Class
                </th>
                <th className="px-space-16 py-space-12 font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  Levels
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-space-16 py-space-48 text-center font-body-md text-body-md text-on-surface-variant"
                  >
                    {liveRows.length === 0
                      ? "No users have synced progress yet."
                      : "No students match this filter."}
                  </td>
                </tr>
              ) : (
                paged.pageRows.map((row) => {
                  const granted = grantedFor(row);
                  const interview = interviewFor(row);
                  const busy =
                    savingIds.includes(row.userId) ||
                    savingInterviewIds.includes(row.userId);
                  const classLabel =
                    classOptions.find((option) => option.key === classKey(row.className))
                      ?.label ?? row.className;
                  return (
                    <tr
                      key={row.userId}
                      className="border-t border-outline-variant/20"
                    >
                      <td className="sticky left-0 z-10 bg-surface-container-lowest px-space-16 py-space-16">
                        <div className="flex min-w-[12rem] flex-col">
                          <span className="flex flex-wrap items-center gap-space-8">
                            <span className="font-label-md text-label-md font-semibold text-on-surface">
                              {row.displayName}
                            </span>
                            {row.staff && !row.isAdmin ? <StaffBadge /> : null}
                          </span>
                          {row.email && row.email !== row.displayName ? (
                            <span className="font-body-sm text-body-sm text-on-surface-variant">
                              {row.email}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-space-16 py-space-16 font-body-sm text-body-sm text-on-surface-variant">
                        {classLabel ?? "—"}
                      </td>
                      <td className="px-space-16 py-space-16">
                        {row.isAdmin ? (
                          <span className="inline-flex items-center gap-space-4 rounded-full bg-primary-fixed px-space-12 py-1 font-label-sm text-label-sm font-semibold text-on-primary-fixed">
                            <MaterialIcon name="verified" className="text-[16px]" filled />
                            All access
                          </span>
                        ) : (
                          <div className="flex max-w-[40rem] flex-wrap gap-space-8">
                            {levels.map((level) => {
                              const on = granted.includes(level.slug);
                              return (
                                <GrantChip
                                  key={level.slug}
                                  label={level.level}
                                  on={on}
                                  disabled={busy}
                                  title={on ? `Lock ${level.level}` : `Unlock ${level.level}`}
                                  onToggle={() => void toggleLevel(row, level.slug)}
                                />
                              );
                            })}
                            <GrantChip
                              label="Phỏng vấn"
                              on={interview}
                              disabled={busy}
                              title={
                                interview
                                  ? "Hide Luyện phỏng vấn theo nghề"
                                  : "Show Luyện phỏng vấn theo nghề"
                              }
                              onToggle={() => void toggleInterview(row)}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-space-12 border-t border-outline-variant/20 px-space-16 py-space-12">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {paged.total === 0
              ? "0 students"
              : `${rangeStart}–${rangeEnd} of ${paged.total}`}
          </p>
          <div className="flex items-center gap-space-8">
            <button
              type="button"
              disabled={paged.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="inline-flex h-9 items-center rounded-xl px-space-12 font-label-sm text-label-sm font-semibold text-on-surface disabled:text-outline hover:bg-surface-container"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={paged.page >= paged.pageCount}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex h-9 items-center rounded-xl px-space-12 font-label-sm text-label-sm font-semibold text-on-surface disabled:text-outline hover:bg-surface-container"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
