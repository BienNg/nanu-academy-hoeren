"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useMemo, useRef, useState, useTransition, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  removeAdminPendingAccess,
  setAdminPendingAccess,
  setAdminUserInterviewAccess,
  setAdminUserLevelAccess,
} from "@/app/admin/actions";
import { ClassCell } from "@/components/admin/AdminUsersDashboard";
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

const INTERVIEW_LABEL = "Phỏng vấn";

function courseSummary(
  levels: readonly AdminLevelOption[],
  levelAccess: readonly string[],
  interview: boolean,
): string {
  const labels = [
    ...levels.filter((level) => levelAccess.includes(level.slug)).map((level) => level.level),
    ...(interview ? [INTERVIEW_LABEL] : []),
  ];
  return labels.length === 0 ? "Choose courses" : labels.join(", ");
}

function useMenuBox(open: boolean, anchorRef: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const node = anchorRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const width = Math.max(rect.width, 240);
      const menuHeight = 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < menuHeight && rect.top > spaceBelow
          ? Math.max(8, rect.top - menuHeight - 6)
          : rect.bottom + 6;
      setBox({
        top,
        left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
        width,
      });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  return box;
}

function CoursePicker({
  label,
  levels,
  levelAccess,
  interview,
  disabled,
  onChange,
}: {
  label: string;
  levels: readonly AdminLevelOption[];
  levelAccess: readonly string[];
  interview: boolean;
  disabled: boolean;
  onChange: (levelAccess: string[], interview: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const box = useMenuBox(open, buttonRef);
  const summary = courseSummary(levels, levelAccess, interview);
  const chosen = summary !== "Choose courses";

  useLayoutEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggleLevel(slug: string) {
    const next = levelAccess.includes(slug)
      ? levelAccess.filter((item) => item !== slug)
      : [...levelAccess, slug];
    onChange(next, interview);
  }

  const menu =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            className="fixed z-[80] max-h-72 overflow-y-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest py-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            style={{ top: box.top, left: box.left, width: box.width }}
          >
            {levels.map((level) => {
              const on = levelAccess.includes(level.slug);
              return (
                <button
                  key={level.slug}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggleLevel(level.slug)}
                  className="flex w-full items-center gap-space-8 px-space-12 py-space-8 text-left font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container"
                >
                  <MaterialIcon
                    name={on ? "check_box" : "check_box_outline_blank"}
                    className={`text-[18px] ${on ? "text-primary" : "text-outline"}`}
                  />
                  <span className="truncate">{level.level}</span>
                </button>
              );
            })}
            <button
              type="button"
              role="option"
              aria-selected={interview}
              onClick={() => onChange([...levelAccess], !interview)}
              className="flex w-full items-center gap-space-8 px-space-12 py-space-8 text-left font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container"
            >
              <MaterialIcon
                name={interview ? "check_box" : "check_box_outline_blank"}
                className={`text-[18px] ${interview ? "text-primary" : "text-outline"}`}
              />
              <span className="truncate">{INTERVIEW_LABEL}</span>
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative min-w-[12rem]">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-11 w-full items-center justify-between gap-space-8 rounded-2xl border px-space-16 text-left font-body-md text-body-md outline-none transition-colors disabled:opacity-50 ${
          open
            ? "border-primary-container ring-2 ring-primary-fixed"
            : "border-outline-variant/50 hover:bg-surface-container"
        } ${chosen ? "text-on-surface" : "text-outline"}`}
      >
        <span className="truncate">{summary}</span>
        <MaterialIcon name="expand_more" className="shrink-0 text-[20px] text-on-surface-variant" />
      </button>
      {menu}
    </div>
  );
}

function ClassNameField({
  value,
  suggestions,
  disabled,
  onChange,
}: {
  value: string;
  suggestions: readonly string[];
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const box = useMenuBox(open, inputRef);
  const needle = classKey(value);
  const matches = suggestions.filter((label) => !needle || classKey(label).includes(needle));

  useLayoutEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (inputRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const menu =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Classes"
            className="fixed z-[80] max-h-60 overflow-y-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest py-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            style={{ top: box.top, left: box.left, width: box.width }}
          >
            {matches.length === 0 ? (
              <p className="px-space-12 py-space-8 font-body-sm text-body-sm text-on-surface-variant">
                {suggestions.length === 0
                  ? "Type a class name."
                  : "No matching classes. This name will be created."}
              </p>
            ) : (
              matches.map((label) => (
                <button
                  key={label}
                  type="button"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(label);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-space-8 px-space-12 py-space-8 text-left font-label-sm text-label-sm font-semibold text-on-surface hover:bg-surface-container"
                >
                  <MaterialIcon name="school" className="text-[16px] text-primary" />
                  <span className="truncate">{label}</span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        maxLength={64}
        autoComplete="off"
        placeholder="Class name"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="h-11 w-full rounded-2xl border border-outline-variant/50 bg-surface-container-lowest px-space-16 font-body-md text-body-md text-on-surface outline-none placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary-fixed disabled:opacity-50"
      />
      {menu}
    </div>
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
  const [draftClass, setDraftClass] = useState("");
  const [savingGrant, setSavingGrant] = useState(false);
  const [pendingRows, setPendingRows] = useState(pending);
  const [savingPending, setSavingPending] = useState<string[]>([]);
  const savingRef = useRef(new Set<string>());
  const savingInterviewRef = useRef(new Set<string>());
  const savingPendingRef = useRef(new Set<string>());
  const pendingSignature = pending
    .map(
      (row) =>
        `${row.email}:${row.levelAccess.join(",")}:${row.interviewAccess}:${row.className ?? ""}`,
    )
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
    const className = draftClass.trim();
    if (draftLevels.length === 0 && !draftInterview && !className) {
      setAccessError("Choose a course or a class.");
      return;
    }
    setSavingGrant(true);
    setAccessError(null);
    try {
      const result = await setAdminPendingAccess(
        email,
        draftLevels,
        draftInterview,
        className,
      );
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
      setDraftClass("");
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setSavingGrant(false);
    }
  }

  async function savePendingRow(previous: PendingLevelGrant, next: PendingLevelGrant) {
    if (savingPendingRef.current.has(previous.email)) return;
    savingPendingRef.current.add(previous.email);
    setPendingRows((prev) =>
      prev.map((item) => (item.email === previous.email ? next : item)),
    );
    setSavingPending((prev) =>
      prev.includes(previous.email) ? prev : [...prev, previous.email],
    );
    setAccessError(null);
    try {
      const result = await setAdminPendingAccess(
        next.email,
        next.levelAccess,
        next.interviewAccess,
        next.className ?? "",
      );
      if (!result.ok) {
        setPendingRows((prev) =>
          prev.map((item) => (item.email === previous.email ? previous : item)),
        );
        setAccessError(result.error);
        return;
      }
      const grant = result.grant;
      setPendingRows((prev) => {
        if (!grant) return prev.filter((item) => item.email !== previous.email);
        return prev.map((item) => (item.email === previous.email ? grant : item));
      });
      startTransition(() => {
        router.refresh();
      });
    } finally {
      savingPendingRef.current.delete(previous.email);
      setSavingPending((prev) => prev.filter((email) => email !== previous.email));
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
            Grant courses and a class to an email that has not signed up yet.
            When they sign in with Google using that address, those courses are
            already open and they join that class.
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
          <div className="grid gap-space-12 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-space-8">
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
            <label className="flex min-w-0 flex-col gap-space-8">
              <span className="font-label-sm text-label-sm font-semibold text-on-surface">
                Class
              </span>
              <ClassNameField
                value={draftClass}
                suggestions={classOptions.map((option) => option.label)}
                disabled={!storeConfigured || !pendingReady || savingGrant}
                onChange={setDraftClass}
              />
            </label>
          </div>
          <label className="flex w-full max-w-md flex-col gap-space-8">
            <span className="font-label-sm text-label-sm font-semibold text-on-surface">
              Courses
            </span>
            <CoursePicker
              label="Courses to pre-unlock"
              levels={levels}
              levelAccess={draftLevels}
              interview={draftInterview}
              disabled={!storeConfigured || !pendingReady || savingGrant}
              onChange={(nextLevels, nextInterview) => {
                setDraftLevels(nextLevels);
                setDraftInterview(nextInterview);
              }}
            />
          </label>
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
          <div className="overflow-x-auto border-t border-outline-variant/20">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="font-label-sm text-label-sm font-semibold text-on-surface-variant">
                  <th className="px-space-4 py-space-12">Email</th>
                  <th className="px-space-16 py-space-12">Class</th>
                  <th className="px-space-16 py-space-12">Courses</th>
                  <th className="w-28 px-space-4 py-space-12 text-right">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map((row) => {
                  const busy = savingPending.includes(row.email);
                  return (
                    <tr key={row.email} className="border-t border-outline-variant/20">
                      <td className="px-space-4 py-space-12">
                        <p className="min-w-[12rem] font-label-md text-label-md font-semibold text-on-surface">
                          {row.email}
                        </p>
                      </td>
                      <ClassCell
                        userId={row.email}
                        studentName={row.email}
                        value={row.className}
                        suggestions={classOptions.map((option) => option.label)}
                        saving={busy}
                        onSave={(next) =>
                          void savePendingRow(row, { ...row, className: next || null })
                        }
                      />
                      <td className="min-w-[14rem] px-space-16 py-space-12">
                        <CoursePicker
                          label={`Courses for ${row.email}`}
                          levels={levels}
                          levelAccess={row.levelAccess}
                          interview={row.interviewAccess}
                          disabled={busy}
                          onChange={(nextLevels, nextInterview) =>
                            void savePendingRow(row, {
                              ...row,
                              levelAccess: nextLevels,
                              interviewAccess: nextInterview,
                            })
                          }
                        />
                      </td>
                      <td className="px-space-4 py-space-12 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removePending(row.email)}
                          className="inline-flex h-8 items-center rounded-full px-space-12 font-label-sm text-label-sm font-semibold text-error hover:bg-error-container/40 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
