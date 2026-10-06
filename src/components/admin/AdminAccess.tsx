"use client";

import { useRouter } from "next/navigation";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  removeAdminPendingAccess,
  setAdminPendingAccess,
  setAdminUserInterviewAccess,
  setAdminUserLevelAccess,
  setAdminUserLivingAccess,
} from "@/app/admin/actions";
import { ClassCell } from "@/components/admin/AdminUsersDashboard";
import { AdminPageHeader, MaterialIcon, StaffBadge } from "@/components/admin/AdminShell";
import {
  Badge,
  Button,
  Checkbox,
  GrantChip,
  INPUT,
  KpiTile,
  Mono,
  POPOVER,
  POPOVER_ITEM,
  Pager,
  ScopeChips,
  TH,
  THEAD,
  TR,
  TablePanel,
  formatCount,
} from "@/components/admin/AdminUi";
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
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import type { PendingLevelGrant } from "@/lib/progress-store";

const INTERVIEW_LABEL = "Phỏng vấn";

export type AdminWorkplaceOption = { slug: string; label: string };

function courseSummary(
  levels: readonly AdminLevelOption[],
  levelAccess: readonly string[],
  interview: boolean,
  workplaces: readonly AdminWorkplaceOption[],
  living: readonly string[],
): string {
  const labels = [
    ...levels.filter((level) => levelAccess.includes(level.slug)).map((level) => level.level),
    ...(interview ? [INTERVIEW_LABEL] : []),
    ...workplaces.filter((workplace) => living.includes(workplace.slug)).map((workplace) => workplace.label),
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

function PickerOption({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button type="button" role="option" aria-selected={on} onClick={onToggle} className={POPOVER_ITEM}>
      <MaterialIcon
        name={on ? "check_box" : "check_box_outline_blank"}
        className={`text-[18px] ${on ? "text-admin-cobalt" : "text-admin-ink-faint"}`}
        filled={on}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

function CoursePicker({
  label,
  levels,
  levelAccess,
  interview,
  workplaces,
  living,
  disabled,
  onChange,
}: {
  label: string;
  levels: readonly AdminLevelOption[];
  levelAccess: readonly string[];
  interview: boolean;
  workplaces: readonly AdminWorkplaceOption[];
  living: readonly string[];
  disabled: boolean;
  onChange: (levelAccess: string[], interview: boolean, living: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const box = useMenuBox(open, buttonRef);
  const summary = courseSummary(levels, levelAccess, interview, workplaces, living);
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
    onChange(next, interview, [...living]);
  }

  function toggleWorkplace(slug: string) {
    const next = living.includes(slug)
      ? living.filter((item) => item !== slug)
      : [...living, slug];
    onChange([...levelAccess], interview, next);
  }

  const menu =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            className={`${POPOVER} max-h-72 overflow-y-auto`}
            style={{ top: box.top, left: box.left, width: box.width }}
          >
            {levels.map((level) => (
              <PickerOption
                key={level.slug}
                on={levelAccess.includes(level.slug)}
                label={level.level}
                onToggle={() => toggleLevel(level.slug)}
              />
            ))}
            <PickerOption
              on={interview}
              label={INTERVIEW_LABEL}
              onToggle={() => onChange([...levelAccess], !interview, [...living])}
            />
            {workplaces.map((workplace) => (
              <PickerOption
                key={workplace.slug}
                on={living.includes(workplace.slug)}
                label={`Leben in DE · ${workplace.label}`}
                onToggle={() => toggleWorkplace(workplace.slug)}
              />
            ))}
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
        className={`${INPUT} flex items-center justify-between gap-space-8 text-left ${
          open ? "border-admin-cobalt shadow-admin-focus" : "hover:border-admin-ink-faint"
        } ${chosen ? "text-admin-ink" : "text-admin-ink-faint"}`}
      >
        <span className="truncate">{summary}</span>
        <MaterialIcon name="expand_more" className="shrink-0 text-[20px] text-admin-ink-subtle" />
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
            id="pending-class-options"
            role="listbox"
            aria-label="Classes"
            className={`${POPOVER} max-h-60 overflow-y-auto`}
            style={{ top: box.top, left: box.left, width: box.width }}
          >
            {matches.length === 0 ? (
              <p className="px-space-12 py-space-8 text-admin-body-sm text-admin-ink-muted">
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
                  aria-selected={classKey(label) === needle}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(label);
                    setOpen(false);
                  }}
                  className={POPOVER_ITEM}
                >
                  <MaterialIcon name="school" className="text-[16px] text-admin-cobalt" />
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
        aria-controls="pending-class-options"
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={INPUT}
      />
      {menu}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-admin-card border border-admin-crimson-border bg-admin-crimson-wash px-space-16 py-space-12 text-admin-body-sm text-admin-crimson-ink"
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-admin-label-md font-semibold text-admin-ink">{children}</span>;
}

export function AdminAccess({
  rows,
  levels,
  workplaces,
  storeConfigured,
  pending,
  pendingReady,
}: {
  rows: AdminUserRow[];
  levels: readonly AdminLevelOption[];
  workplaces: readonly AdminWorkplaceOption[];
  storeConfigured: boolean;
  pending: PendingLevelGrant[];
  pendingReady: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string | "all">("all");
  const [lockedOnly, setLockedOnly] = useState(false);
  const [nothingOnly, setNothingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [accessByUser, setAccessByUser] = useState<Record<string, string[]>>({});
  const [interviewByUser, setInterviewByUser] = useState<Record<string, boolean>>({});
  const [livingByUser, setLivingByUser] = useState<Record<string, string[]>>({});
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [savingInterviewIds, setSavingInterviewIds] = useState<string[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [draftLevels, setDraftLevels] = useState<string[]>([]);
  const [draftInterview, setDraftInterview] = useState(false);
  const [draftLiving, setDraftLiving] = useState<string[]>([]);
  const [draftClass, setDraftClass] = useState("");
  const [pendingClassFilter, setPendingClassFilter] = useState<string | "all">("all");
  const [savingGrant, setSavingGrant] = useState(false);
  const [pendingRows, setPendingRows] = useState(pending);
  const [savingPending, setSavingPending] = useState<string[]>([]);
  const savingRef = useRef(new Set<string>());
  const savingInterviewRef = useRef(new Set<string>());
  const savingPendingRef = useRef(new Set<string>());
  const pendingSignature = pending
    .map(
      (row) =>
        `${row.email}:${row.levelAccess.join(",")}:${row.interviewAccess}:${row.livingAccess.join(",")}:${row.className ?? ""}`,
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

  function livingFor(row: AdminUserRow): string[] {
    return livingByUser[row.userId] ?? row.livingAccess;
  }

  const liveRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        levelAccess: accessByUser[row.userId] ?? row.levelAccess,
        interviewAccess: Object.hasOwn(interviewByUser, row.userId)
          ? interviewByUser[row.userId]
          : row.interviewAccess,
        livingAccess: livingByUser[row.userId] ?? row.livingAccess,
      })),
    [rows, accessByUser, interviewByUser, livingByUser],
  );

  const waitingMembers = useMemo(
    () =>
      pendingRows.map((row) => ({
        className: row.className,
        levelAccess: row.levelAccess,
        interviewAccess: row.interviewAccess,
      })),
    [pendingRows],
  );
  const board = useMemo(
    () => buildAdminAccessBoard(liveRows, levels, waitingMembers),
    [liveRows, levels, waitingMembers],
  );
  const classOptions = useMemo(
    () => listAdminClasses([...liveRows, ...waitingMembers]),
    [liveRows, waitingMembers],
  );
  const pendingClassOptions = useMemo(
    () => listAdminClasses(pendingRows),
    [pendingRows],
  );
  const pendingUnassigned = useMemo(
    () => pendingRows.filter((row) => !classKey(row.className)).length,
    [pendingRows],
  );
  const pendingFilterValid =
    pendingClassFilter === "all" ||
    (pendingClassFilter === ""
      ? pendingUnassigned > 0
      : pendingClassOptions.some((option) => option.key === pendingClassFilter));
  if (!pendingFilterValid) {
    setPendingClassFilter("all");
  }
  const activePendingClass = pendingFilterValid ? pendingClassFilter : "all";
  const visiblePending = useMemo(() => {
    if (activePendingClass === "all") return pendingRows;
    return pendingRows.filter((row) => classKey(row.className) === activePendingClass);
  }, [pendingRows, activePendingClass]);
  const pendingClassChips: { key: string | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: pendingRows.length },
    ...pendingClassOptions.map((option) => ({
      key: option.key,
      label: option.label,
      count: option.count,
    })),
    ...(pendingUnassigned > 0
      ? [{ key: "" as const, label: "Unassigned", count: pendingUnassigned }]
      : []),
  ];
  const unassignedCount = useMemo(
    () => liveRows.filter((row) => !classKey(row.className)).length,
    [liveRows],
  );

  const filtered = useMemo(() => {
    const searched = filterAdminUsers(liveRows, query);
    const inClass =
      classFilter === "all" ? searched : usersInClass(searched, classFilter);
    return inClass.filter((row) => {
      if (lockedOnly && (row.isAdmin || row.levelAccess.length > 0)) return false;
      if (
        nothingOnly &&
        (row.isAdmin ||
          row.levelAccess.length > 0 ||
          row.interviewAccess ||
          row.livingAccess.length > 0)
      ) {
        return false;
      }
      return true;
    });
  }, [liveRows, query, classFilter, lockedOnly, nothingOnly]);

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

  async function toggleLiving(row: AdminUserRow, workplaceSlug: string) {
    if (
      row.isAdmin ||
      savingRef.current.has(row.userId) ||
      savingInterviewRef.current.has(row.userId)
    ) {
      return;
    }
    // Grants for one user share a single level_access list, so saves never overlap.
    savingInterviewRef.current.add(row.userId);
    const current = livingFor(row);
    const granted = !current.includes(workplaceSlug);
    const next = granted
      ? [...current, workplaceSlug]
      : current.filter((slug) => slug !== workplaceSlug);
    setLivingByUser((prev) => ({ ...prev, [row.userId]: next }));
    setSavingInterviewIds((prev) =>
      prev.includes(row.userId) ? prev : [...prev, row.userId],
    );
    setAccessError(null);
    try {
      const result = await setAdminUserLivingAccess(row.userId, workplaceSlug, granted);
      if (!result.ok) {
        setLivingByUser((prev) => ({ ...prev, [row.userId]: current }));
        setAccessError(result.error);
        return;
      }
      setLivingByUser((prev) => ({ ...prev, [row.userId]: result.livingAccess }));
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
    if (draftLevels.length === 0 && !draftInterview && draftLiving.length === 0 && !className) {
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
        draftLiving,
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
      setDraftLiving([]);
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
        next.livingAccess,
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

  const learnerShare = (count: number) => (board.learners > 0 ? count / board.learners : 0);
  const pendingDisabled = !storeConfigured || !pendingReady || savingGrant;
  const classSuggestions = classOptions.map((option) => option.label);
  const emptyGrants =
    liveRows.length === 0
      ? "No users have synced progress yet."
      : classFilter !== "all" &&
          usersInClass(liveRows, classFilter).length === 0 &&
          waitingMembers.some((row) => classKey(row.className) === classFilter)
        ? "No signed-in students in this class yet. Emails waiting to join are listed under Pre-unlock."
        : "No students match this filter.";

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="People"
        title="Access"
        subtitle="Who can open each CEFR level, Luyện phỏng vấn and Leben in Deutschland, including emails that have not signed up yet. Admins are unlocked everywhere."
      />

      {!storeConfigured ? (
        <Notice>
          Cloud progress is not configured. This page only lists learners who have synced progress
          to Supabase.
        </Notice>
      ) : null}

      {accessError ? <Notice>{accessError}</Notice> : null}

      <section
        aria-label="Access totals"
        className="grid grid-cols-2 gap-space-16 md:grid-cols-3 2xl:grid-cols-6"
      >
        <KpiTile
          icon="group"
          label="Students"
          value={formatCount(board.students)}
          caption="Everyone with a progress record"
          color={ADMIN_COLORS.cobalt}
        />
        <KpiTile
          icon="lock_open"
          label="With a level"
          value={formatCount(board.withLevel)}
          caption="At least one CEFR level"
          color={ADMIN_COLORS.amber}
          progress={learnerShare(board.withLevel)}
          progressLabel="Share of learners with a level"
        />
        <KpiTile
          icon="lock"
          label="None"
          value={formatCount(board.locked)}
          caption="No CEFR level yet"
          color={board.locked > 0 ? ADMIN_COLORS.crimson : ADMIN_COLORS.inkSubtle}
        />
        <KpiTile
          icon="record_voice_over"
          label="Interview"
          value={formatCount(board.interview)}
          caption="Can open Luyện phỏng vấn"
          color={ADMIN_COLORS.amber}
        />
        <KpiTile
          icon="storefront"
          label="Leben in DE"
          value={formatCount(board.living)}
          caption="At least one workplace"
          color={ADMIN_COLORS.amber}
        />
        <KpiTile
          icon="verified"
          label="Admins"
          value={formatCount(board.admins)}
          caption="Already have every course"
          color={ADMIN_COLORS.cobalt}
        />
      </section>

      <TablePanel
        icon="mark_email_unread"
        title="Pre-unlock"
        hint="Grant courses and a class to an email that has not signed up yet. When they sign in with Google using that address, those courses are already open and they join that class."
      >
        <div className="flex flex-col gap-space-16 p-space-16 sm:p-space-20">
          {storeConfigured && !pendingReady ? (
            <Notice>
              Pre-unlock is not ready yet. Run <Mono>supabase/pending_level_access.sql</Mono> once in
              the Supabase SQL editor, then reload this page.
            </Notice>
          ) : null}
          <form
            className="grid gap-space-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void savePendingGrant();
            }}
          >
            <label className="flex min-w-0 flex-col gap-space-4">
              <FieldLabel>Email</FieldLabel>
              <input
                type="email"
                required
                autoComplete="off"
                value={grantEmail}
                onChange={(event) => setGrantEmail(event.target.value)}
                placeholder="student@email.com"
                disabled={pendingDisabled}
                className={INPUT}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-space-4">
              <FieldLabel>Class</FieldLabel>
              <ClassNameField
                value={draftClass}
                suggestions={classSuggestions}
                disabled={pendingDisabled}
                onChange={setDraftClass}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-space-4">
              <FieldLabel>Courses</FieldLabel>
              <CoursePicker
                label="Courses to pre-unlock"
                levels={levels}
                levelAccess={draftLevels}
                interview={draftInterview}
                workplaces={workplaces}
                living={draftLiving}
                disabled={pendingDisabled}
                onChange={(nextLevels, nextInterview, nextLiving) => {
                  setDraftLevels(nextLevels);
                  setDraftInterview(nextInterview);
                  setDraftLiving(nextLiving);
                }}
              />
            </label>
            <Button type="submit" variant="primary" icon="key" disabled={pendingDisabled} className="h-[38px]">
              {savingGrant ? "Saving…" : "Pre-unlock"}
            </Button>
          </form>
        </div>

        {!pendingReady ? null : pendingRows.length === 0 ? (
          <p className="border-t border-admin-hairline px-space-16 py-space-16 text-admin-body-sm text-admin-ink-muted sm:px-space-20">
            No emails are waiting to sign up.
          </p>
        ) : (
          <div className="flex flex-col border-t border-admin-hairline">
            <div className="px-space-16 py-space-12 sm:px-space-20">
              <ScopeChips
                label="Waiting"
                icon="hourglass_top"
                ariaLabel="Filter pre-unlock by class"
                value={activePendingClass}
                options={pendingClassChips}
                onSelect={setPendingClassFilter}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left">
                <thead className={THEAD}>
                  <tr>
                    <th className={TH}>Email</th>
                    <th className={TH}>Class</th>
                    <th className={TH}>Courses</th>
                    <th className={`${TH} w-28 text-right`}>
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePending.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-space-16 py-space-24 text-admin-body-sm text-admin-ink-muted">
                        No waiting emails in this class.
                      </td>
                    </tr>
                  ) : null}
                  {visiblePending.map((row) => {
                    const busy = savingPending.includes(row.email);
                    return (
                      <tr key={row.email} className={TR}>
                        <td className="px-space-16 py-space-8">
                          <Mono className="block min-w-[12rem] text-admin-ink">{row.email}</Mono>
                        </td>
                        <ClassCell
                          userId={row.email}
                          studentName={row.email}
                          value={row.className}
                          suggestions={classSuggestions}
                          saving={busy}
                          onSave={(next) => void savePendingRow(row, { ...row, className: next || null })}
                        />
                        <td className="min-w-[14rem] px-space-16 py-space-8">
                          <CoursePicker
                            label={`Courses for ${row.email}`}
                            levels={levels}
                            levelAccess={row.levelAccess}
                            interview={row.interviewAccess}
                            workplaces={workplaces}
                            living={row.livingAccess}
                            disabled={busy}
                            onChange={(nextLevels, nextInterview, nextLiving) =>
                              void savePendingRow(row, {
                                ...row,
                                levelAccess: nextLevels,
                                interviewAccess: nextInterview,
                                livingAccess: nextLiving,
                              })
                            }
                          />
                        </td>
                        <td className="px-space-16 py-space-8 text-right">
                          <Button
                            variant="ghost"
                            icon="close"
                            disabled={busy}
                            onClick={() => void removePending(row.email)}
                            className="text-admin-crimson hover:bg-admin-crimson-wash hover:text-admin-crimson"
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </TablePanel>

      <TablePanel
        icon="key"
        title="Grants"
        hint="Toggle a level to unlock or lock it. Same grants as on Students."
        footer={
          <Pager
            page={paged.page}
            pageCount={paged.pageCount}
            start={rangeStart}
            end={rangeEnd}
            total={paged.total}
            noun="students"
            onPage={setPage}
          />
        }
      >
        <div className="flex flex-col gap-space-12 border-b border-admin-hairline px-space-16 py-space-12 sm:px-space-20">
          <div className="flex flex-col gap-space-12 sm:flex-row sm:items-center">
            <label className="relative flex w-full max-w-md items-center">
              <span className="sr-only">Search by name, email, or class</span>
              <MaterialIcon
                name="search"
                className="pointer-events-none absolute left-space-12 text-[18px] text-admin-ink-faint"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                placeholder="Search by name, email, or class"
                className={`${INPUT} pl-9`}
              />
            </label>
            <label
              className={`inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-space-8 rounded-admin-control border px-space-12 text-admin-label-md font-semibold transition-colors has-[:focus-visible]:shadow-admin-focus ${
                lockedOnly
                  ? "border-admin-crimson-border bg-admin-crimson-wash text-admin-crimson-ink"
                  : "border-admin-hairline bg-admin-card text-admin-ink-muted hover:border-admin-border"
              }`}
            >
              <Checkbox
                checked={lockedOnly}
                onChange={(event) => {
                  setLockedOnly(event.target.checked);
                  setPage(1);
                }}
              />
              No CEFR level
            </label>
            <label
              className={`inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-space-8 rounded-admin-control border px-space-12 text-admin-label-md font-semibold transition-colors has-[:focus-visible]:shadow-admin-focus ${
                nothingOnly
                  ? "border-admin-amber bg-admin-amber-wash text-admin-amber-ink"
                  : "border-admin-hairline bg-admin-card text-admin-ink-muted hover:border-admin-border"
              }`}
              title="No CEFR level, Luyện phỏng vấn, or Leben in Deutschland workplace"
            >
              <Checkbox
                checked={nothingOnly}
                onChange={(event) => {
                  setNothingOnly(event.target.checked);
                  setPage(1);
                }}
              />
              No access
            </label>
          </div>
          <ScopeChips
            label="Class"
            icon="school"
            ariaLabel="Filter by class"
            value={classFilter}
            options={classChips}
            onSelect={handleClassFilter}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead className={THEAD}>
              <tr>
                <th className={`${TH} sticky left-0 z-20 bg-admin-subtle`}>Student</th>
                <th className={TH}>Class</th>
                <th className={TH}>Levels</th>
              </tr>
            </thead>
            <tbody className="text-admin-body-md text-admin-ink">
              {paged.pageRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-space-16 py-space-48 text-center text-admin-body-md text-admin-ink-muted">
                    {emptyGrants}
                  </td>
                </tr>
              ) : (
                paged.pageRows.map((row) => {
                  const granted = grantedFor(row);
                  const interview = interviewFor(row);
                  const living = livingFor(row);
                  const busy = savingIds.includes(row.userId) || savingInterviewIds.includes(row.userId);
                  const classLabel =
                    classOptions.find((option) => option.key === classKey(row.className))?.label ??
                    row.className;
                  return (
                    <tr key={row.userId} className={TR}>
                      <td className="sticky left-0 z-10 bg-admin-card px-space-16 py-space-8 group-hover:bg-admin-canvas">
                        <div className="flex min-w-[12rem] flex-col">
                          <span className="flex flex-wrap items-center gap-space-8">
                            <span className="font-semibold text-admin-ink">{row.displayName}</span>
                            {row.staff && !row.isAdmin ? <StaffBadge /> : null}
                          </span>
                          {row.email && row.email !== row.displayName ? (
                            <span className="truncate text-admin-body-sm text-admin-ink-subtle">{row.email}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-space-16 py-space-8">
                        {classLabel ? (
                          <Badge tone="cobalt">{classLabel}</Badge>
                        ) : (
                          <span className="text-admin-ink-faint">—</span>
                        )}
                      </td>
                      <td className="px-space-16 py-space-8">
                        {row.isAdmin ? (
                          <Badge tone="cobalt">
                            <MaterialIcon name="verified" className="-mx-0.5 text-[14px]" filled />
                            All access
                          </Badge>
                        ) : (
                          <div className="flex max-w-[40rem] flex-wrap gap-space-4">
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
                              label={INTERVIEW_LABEL}
                              on={interview}
                              disabled={busy}
                              title={interview ? "Hide Luyện phỏng vấn theo nghề" : "Show Luyện phỏng vấn theo nghề"}
                              onToggle={() => void toggleInterview(row)}
                            />
                            {workplaces.map((workplace) => {
                              const on = living.includes(workplace.slug);
                              return (
                                <GrantChip
                                  key={`living-${workplace.slug}`}
                                  label={workplace.label}
                                  on={on}
                                  disabled={busy}
                                  title={
                                    on
                                      ? `Hide Leben in Deutschland · ${workplace.label}`
                                      : `Show Leben in Deutschland · ${workplace.label}`
                                  }
                                  onToggle={() => void toggleLiving(row, workplace.slug)}
                                />
                              );
                            })}
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
      </TablePanel>
    </main>
  );
}
