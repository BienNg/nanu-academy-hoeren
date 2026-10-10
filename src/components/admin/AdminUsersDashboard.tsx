"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  deleteAdminUser,
  setAdminUserClass,
  setAdminUserInterviewAccess,
  setAdminUserLevelAccess,
  setAdminUserStaff,
  setAdminUserTeacher,
} from "@/app/admin/actions";
import {
  AdminPageHeader,
  MaterialIcon,
  StaffBadge,
  TeacherBadge,
  useAdminRole,
} from "@/components/admin/AdminShell";
import { StudentDetail } from "@/components/admin/StudentDrawer";
import {
  Badge,
  Button,
  CARD,
  ChartTooltip,
  Checkbox,
  Dialog,
  HeaderChip,
  INPUT,
  PanelHeader,
  Pager,
  Segmented,
  TH,
  THEAD,
  TR,
  formatCount,
  SortHeader,
  GrantChip,
  POPOVER,
  POPOVER_ITEM,
} from "@/components/admin/AdminUi";
import type { AdminCatalogCourse } from "@/lib/admin-detail";
import {
  CLASS_NAME_MAX_LENGTH,
  buildAdminRosterTrend,
  classKey,
  filterAdminUsers,
  listAdminClasses,
  normalizeClassName,
  formatAdminTimestamp,
  paginateAdminUsers,
  sortAdminUsers,
  type AdminLevelOption,
  type AdminSortDir,
  type AdminSortKey,
  type AdminUserRow,
} from "@/lib/admin-overview";
import { ADMIN_COLORS } from "@/lib/admin-tokens";

const STUDENTS_PAGE_SIZE = 15;

type RosterSeries = "users" | "classes";

function formatAbsoluteTime(iso: string | null): string | null {
  return formatAdminTimestamp(iso);
}

function Streak({ days }: { days: number }) {
  const active = days > 0;
  return (
    <span
      className={`inline-flex items-center gap-space-4 tabular-nums ${
        active ? "text-admin-ember-ink" : "text-admin-ink-faint"
      }`}
      title={active ? `${days} day${days === 1 ? "" : "s"} in a row` : "No active streak"}
    >
      <MaterialIcon
        name="local_fire_department"
        className={`text-[18px] ${active ? "text-admin-ember" : ""}`}
        filled={active}
      />
      <span className="text-admin-body-md font-semibold">{days}</span>
      <span className="text-admin-body-sm text-admin-ink-subtle">{days === 1 ? "day" : "days"}</span>
    </span>
  );
}

function LastSeen({ iso }: { iso: string | null }) {
  const absolute = formatAbsoluteTime(iso);
  if (!iso || !absolute) {
    return <span className="text-admin-body-sm text-admin-ink-subtle">Not seen yet</span>;
  }
  const comma = absolute.indexOf(", ");
  const date = comma === -1 ? absolute : absolute.slice(0, comma);
  const time = comma === -1 ? null : absolute.slice(comma + 2);
  return (
    <time dateTime={iso} className="flex flex-col text-admin-body-sm text-admin-ink">
      <span className="whitespace-nowrap">{date}</span>
      {time ? <span className="whitespace-nowrap text-admin-ink-subtle">{time}</span> : null}
    </time>
  );
}

function RowActionsMenu({
  name,
  isAdmin,
  isStaff,
  isTeacher,
  canAssignStaff,
  canAssignTeacher,
  staffSaving,
  onStaff,
  onTeacher,
  onDelete,
}: {
  name: string;
  isAdmin: boolean;
  isStaff: boolean;
  isTeacher: boolean;
  canAssignStaff: boolean;
  canAssignTeacher: boolean;
  staffSaving: boolean;
  onStaff: () => void;
  onTeacher: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = 220;
      const itemCount =
        (canAssignStaff && !isAdmin ? 1 : 0) +
        (canAssignTeacher && !isAdmin ? 1 : 0) +
        (canAssignStaff ? 1 : 0);
      const height = Math.max(1, itemCount) * 44 + 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < height + 8 && rect.top > spaceBelow
          ? Math.max(8, rect.top - height - 6)
          : rect.bottom + 6;
      setBox({
        top,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      });
    }

    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isAdmin, canAssignStaff, canAssignTeacher]);

  const menu =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions for ${name}`}
            className={`${POPOVER} w-[220px]`}
            style={{ top: box.top, left: box.left }}
          >
            {canAssignStaff && !isAdmin ? (
              <button
                type="button"
                role="menuitem"
                disabled={staffSaving}
                onClick={() => {
                  setOpen(false);
                  onStaff();
                }}
                className={POPOVER_ITEM}
              >
                <MaterialIcon name="admin_panel_settings" className="text-[18px] text-admin-cobalt" />
                {isStaff ? "Remove staff" : "Make staff"}
              </button>
            ) : null}
            {canAssignTeacher && !isAdmin ? (
              <button
                type="button"
                role="menuitem"
                disabled={staffSaving}
                onClick={() => {
                  setOpen(false);
                  onTeacher();
                }}
                className={POPOVER_ITEM}
              >
                <MaterialIcon name="school" className="text-[18px] text-admin-emerald" />
                {isTeacher ? "Edit teacher classes" : "Make teacher"}
              </button>
            ) : null}
            {canAssignStaff ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className={`${POPOVER_ITEM} text-admin-crimson hover:bg-admin-crimson-wash focus-visible:bg-admin-crimson-wash`}
              >
                <MaterialIcon name="delete" className="text-[18px]" />
                Delete
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-admin-control text-admin-ink-subtle outline-none transition-colors hover:bg-admin-subtle hover:text-admin-ink focus-visible:shadow-admin-focus"
      >
        <MaterialIcon name="more_vert" className="text-[20px]" />
      </button>
      {menu}
    </>
  );
}

/** Inline class editor with a suggestion list. Rendered bare so cards can reuse it. */
function ClassEditor({
  userId,
  studentName,
  value,
  suggestions,
  saving,
  onSave,
  readOnly = false,
}: {
  userId: string;
  studentName: string;
  value: string | null;
  suggestions: readonly string[];
  saving: boolean;
  onSave: (next: string) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const committing = useRef(false);
  const opened = useRef(value ?? "");
  const listId = `class-options-${userId}`;

  const needle = classKey(draft);
  const matches = suggestions.filter(
    (label) => !needle || classKey(label).includes(needle),
  );

  function begin() {
    const next = value ?? "";
    committing.current = false;
    opened.current = next;
    setDraft(next);
    setEditing(true);
  }

  function commitFrom(raw: string) {
    if (committing.current) return;
    committing.current = true;
    const next = normalizeClassName(raw);
    setEditing(false);
    setMenuBox(null);
    if (next !== opened.current) onSave(next);
  }

  function cancel() {
    committing.current = true;
    setDraft(opened.current);
    setEditing(false);
    setMenuBox(null);
  }

  useLayoutEffect(() => {
    if (!editing) return;

    function placeMenu() {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const width = Math.max(rect.width, 220);
      const estimatedHeight = Math.min(240, Math.max(matches.length, 1) * 40 + 8);
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < estimatedHeight && rect.top > spaceBelow
          ? Math.max(8, rect.top - estimatedHeight - 6)
          : rect.bottom + 6;
      setMenuBox({
        top,
        left: Math.min(rect.left, window.innerWidth - width - 8),
        width,
      });
    }

    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [editing, matches.length]);

  if (readOnly) {
    return (
      <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-admin-badge bg-admin-subtle px-space-8 text-admin-label-md font-semibold text-admin-ink">
        <MaterialIcon name="school" className="text-[14px] text-admin-ink-subtle" />
        <span className="truncate">{value ?? "No class"}</span>
      </span>
    );
  }

  const menu =
    editing && menuBox && typeof document !== "undefined"
      ? createPortal(
          <div
            id={listId}
            role="listbox"
            aria-label={`Classes for ${studentName}`}
            className={`${POPOVER} max-h-60 overflow-y-auto`}
            style={{ top: menuBox.top, left: menuBox.left, width: menuBox.width }}
          >
            {matches.length === 0 ? (
              <p className="px-space-12 py-space-8 text-admin-body-sm text-admin-ink-muted">
                {suggestions.length === 0
                  ? "Type a class name, then save."
                  : "No matching classes. Save to create this one."}
              </p>
            ) : (
              matches.map((label) => (
                <button
                  key={label}
                  type="button"
                  role="option"
                  aria-selected={classKey(label) === classKey(value)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commitFrom(label)}
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
    <div
      className="w-44 max-w-44"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {editing ? (
        <form
          className="relative w-full"
          onSubmit={(event) => {
            event.preventDefault();
            commitFrom(inputRef.current?.value ?? draft);
          }}
        >
          <label className="sr-only" htmlFor={`class-${userId}`}>
            Class for {studentName}
          </label>
          <input
            ref={inputRef}
            id={`class-${userId}`}
            autoFocus
            value={draft}
            role="combobox"
            aria-expanded={matches.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            maxLength={CLASS_NAME_MAX_LENGTH}
            disabled={saving}
            placeholder="Class name"
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commitFrom(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
            className="h-8 w-full rounded-admin-control border border-admin-cobalt bg-admin-card py-0 pl-space-8 pr-8 text-admin-body-sm text-admin-ink shadow-admin-focus outline-none"
          />
          <button
            type="submit"
            disabled={saving}
            aria-label={`Save class for ${studentName}`}
            onMouseDown={(event) => event.preventDefault()}
            className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-admin-badge bg-admin-cobalt text-white transition-colors hover:bg-admin-cobalt-strong disabled:opacity-50"
          >
            <MaterialIcon name="check" className="text-[16px]" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          disabled={saving}
          onClick={begin}
          aria-label={value ? `Class ${value} for ${studentName}` : `Add class for ${studentName}`}
          className={`inline-flex h-7 max-w-full items-center gap-1 rounded-admin-badge px-space-8 text-admin-label-md font-semibold outline-none transition-colors focus-visible:shadow-admin-focus disabled:opacity-50 ${
            value
              ? "bg-admin-cobalt-wash text-admin-cobalt-ink ring-1 ring-inset ring-admin-cobalt/20 hover:bg-admin-cobalt-hover"
              : "border border-dashed border-admin-border text-admin-ink-muted hover:border-admin-ink-faint hover:bg-admin-subtle"
          }`}
        >
          <MaterialIcon name={value ? "school" : "add"} className="text-[14px]" />
          <span className="truncate">{value ?? "Add class"}</span>
        </button>
      )}
      {menu}
    </div>
  );
}

/** Table cell around ClassEditor, also used by the Overview's active users table. */
export function ClassCell(props: Parameters<typeof ClassEditor>[0]) {
  return (
    <td className="w-44 min-w-44 max-w-44 px-space-16 py-space-8">
      <ClassEditor {...props} />
    </td>
  );
}

function LevelAccessChips({
  row,
  levels,
  granted,
  saving,
  onToggle,
  interviewAccess,
  interviewSaving,
  onToggleInterview,
  locked = false,
}: {
  row: AdminUserRow;
  levels: readonly AdminLevelOption[];
  granted: readonly string[];
  saving: boolean;
  onToggle: (slug: string) => void;
  interviewAccess: boolean;
  interviewSaving: boolean;
  onToggleInterview: () => void;
  locked?: boolean;
}) {
  if (row.isAdmin) {
    return (
      <Badge tone="cobalt">
        <MaterialIcon name="verified" className="-mx-0.5 text-[14px]" filled />
        All access
      </Badge>
    );
  }

  return (
    <div
      className="flex max-w-[32rem] flex-wrap gap-space-4"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {levels.map((level) => {
        const on = granted.includes(level.slug);
        return (
          <GrantChip
            key={level.slug}
            label={level.level}
            on={on}
            disabled={locked || saving || interviewSaving}
            title={locked ? level.level : on ? `Lock ${level.level}` : `Unlock ${level.level}`}
            onToggle={() => onToggle(level.slug)}
          />
        );
      })}
      <GrantChip
        label="Phỏng vấn"
        on={interviewAccess}
        disabled={locked || saving || interviewSaving}
        title={
          locked
            ? "Luyện phỏng vấn theo nghề"
            : interviewAccess
              ? "Hide Luyện phỏng vấn theo nghề"
              : "Show Luyện phỏng vấn theo nghề"
        }
        onToggle={onToggleInterview}
      />
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

/** Bar that appears while rows are selected, for class and level changes in one go. */
function BulkBar({
  count,
  levels,
  classSuggestions,
  busy,
  onSetClass,
  onLevel,
  onClear,
}: {
  count: number;
  levels: readonly AdminLevelOption[];
  classSuggestions: readonly string[];
  busy: boolean;
  onSetClass: (className: string) => void;
  onLevel: (slug: string, grant: boolean) => void;
  onClear: () => void;
}) {
  const [className, setClassName] = useState("");
  const [level, setLevel] = useState(levels[0]?.slug ?? "");
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky top-16 z-30 flex flex-wrap items-center gap-space-12 rounded-admin-card border border-admin-cobalt/30 bg-admin-cobalt-wash px-space-16 py-space-12 shadow-admin-card"
    >
      <span className="flex items-center gap-space-8 text-admin-body-md font-semibold text-admin-cobalt-ink">
        <MaterialIcon name="check_box" className="text-[18px]" filled />
        {formatCount(count)} selected
      </span>
      <form
        className="flex items-center gap-space-8"
        onSubmit={(event) => {
          event.preventDefault();
          onSetClass(className);
        }}
      >
        <label className="sr-only" htmlFor="bulk-class">
          Class for selected students
        </label>
        <input
          id="bulk-class"
          list="bulk-class-options"
          value={className}
          maxLength={CLASS_NAME_MAX_LENGTH}
          placeholder="Class name"
          disabled={busy}
          onChange={(event) => setClassName(event.target.value)}
          className={`${INPUT} h-9 w-40`}
        />
        <datalist id="bulk-class-options">
          {classSuggestions.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
        <Button type="submit" icon="school" disabled={busy || !normalizeClassName(className)}>
          Set class
        </Button>
      </form>
      {levels.length > 0 ? (
        <div className="flex items-center gap-space-8">
          <label className="sr-only" htmlFor="bulk-level">
            Level for selected students
          </label>
          <select
            id="bulk-level"
            value={level}
            disabled={busy}
            onChange={(event) => setLevel(event.target.value)}
            className={`${INPUT} h-9 w-24 pr-space-8`}
          >
            {levels.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.level}
              </option>
            ))}
          </select>
          <Button icon="lock_open" disabled={busy || !level} onClick={() => onLevel(level, true)}>
            Unlock
          </Button>
          <Button icon="lock" disabled={busy || !level} onClick={() => onLevel(level, false)}>
            Lock
          </Button>
        </div>
      ) : null}
      <Button variant="ghost" className="ml-auto" disabled={busy} onClick={onClear}>
        {busy ? "Saving…" : "Clear"}
      </Button>
    </div>
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
  const [rosterSeries, setRosterSeries] = useState<RosterSeries>("users");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AdminSortKey>("lastLogin");
  const [dir, setDir] = useState<AdminSortDir>("desc");
  const [page, setPage] = useState(1);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [confirmRow, setConfirmRow] = useState<AdminUserRow | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [accessByUser, setAccessByUser] = useState<Record<string, string[]>>({});
  const [interviewByUser, setInterviewByUser] = useState<Record<string, boolean>>({});
  const [classByUser, setClassByUser] = useState<Record<string, string | null>>({});
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [savingInterviewIds, setSavingInterviewIds] = useState<string[]>([]);
  const [savingClassIds, setSavingClassIds] = useState<string[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [classError, setClassError] = useState<string | null>(null);
  const [staffByUser, setStaffByUser] = useState<Record<string, boolean>>({});
  const [staffPrompt, setStaffPrompt] = useState<{
    row: AdminUserRow;
    next: boolean;
  } | null>(null);
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [teacherByUser, setTeacherByUser] = useState<Record<string, boolean>>({});
  const [teacherClassesByUser, setTeacherClassesByUser] = useState<Record<string, string[]>>({});
  const [teacherPrompt, setTeacherPrompt] = useState<{
    row: AdminUserRow;
    classes: string[];
  } | null>(null);
  const [teacherSaving, setTeacherSaving] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);
  const role = useAdminRole();
  const isOwner = role === "owner";
  const readOnly = role === "teacher";
  const canAssignTeacher = role === "owner" || role === "staff";
  const savingRef = useRef(new Set<string>());
  const savingInterviewRef = useRef(new Set<string>());
  const savingClassRef = useRef(new Set<string>());

  function grantedFor(row: AdminUserRow): string[] {
    return accessByUser[row.userId] ?? row.levelAccess;
  }

  function interviewFor(row: AdminUserRow): boolean {
    if (Object.hasOwn(interviewByUser, row.userId)) return interviewByUser[row.userId];
    return row.interviewAccess;
  }

  function staffFor(row: AdminUserRow): boolean {
    if (row.isAdmin) return false;
    if (Object.hasOwn(staffByUser, row.userId)) return staffByUser[row.userId];
    return row.staff;
  }

  function teacherFor(row: AdminUserRow): boolean {
    if (row.isAdmin) return false;
    if (Object.hasOwn(teacherByUser, row.userId)) return teacherByUser[row.userId];
    return row.teacher;
  }

  function teacherClassesFor(row: AdminUserRow): string[] {
    return teacherClassesByUser[row.userId] ?? row.teacherClasses;
  }

  const classFor = useCallback(
    (row: AdminUserRow): string | null => {
      if (Object.hasOwn(classByUser, row.userId)) return classByUser[row.userId];
      return row.className;
    },
    [classByUser],
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

  async function saveClass(row: AdminUserRow, nextRaw: string) {
    if (savingClassRef.current.has(row.userId)) return;
    savingClassRef.current.add(row.userId);
    const previous = row.className;
    const next = normalizeClassName(nextRaw);
    setClassByUser((prev) => ({ ...prev, [row.userId]: next || null }));
    setSavingClassIds((prev) =>
      prev.includes(row.userId) ? prev : [...prev, row.userId],
    );
    setClassError(null);
    try {
      const result = await setAdminUserClass(row.userId, next);
      if (!result.ok) {
        setClassByUser((prev) => ({ ...prev, [row.userId]: previous }));
        setClassError(result.error);
        return;
      }
      setClassByUser((prev) => ({ ...prev, [row.userId]: result.className }));
      startTransition(() => {
        router.refresh();
      });
    } finally {
      savingClassRef.current.delete(row.userId);
      setSavingClassIds((prev) => prev.filter((id) => id !== row.userId));
    }
  }

  const visibleRows = useMemo(
    () =>
      rows
        .filter((row) => !deletedIds.includes(row.userId))
        .map((row) => ({ ...row, className: classFor(row) })),
    [rows, deletedIds, classFor],
  );

  const classOptions = useMemo(() => listAdminClasses(visibleRows), [visibleRows]);
  const schoolClassLabels = useMemo(() => listAdminClasses(rows).map((option) => option.label), [rows]);

  const displayClass = useCallback(
    (row: AdminUserRow): string | null => {
      if (!row.className) return null;
      return (
        classOptions.find((option) => option.key === classKey(row.className))?.label ??
        row.className
      );
    },
    [classOptions],
  );

  const detailRow = useMemo(() => {
    const row = visibleRows.find((item) => item.userId === detailUserId);
    if (!row) return null;
    return {
      ...row,
      className: displayClass(row),
      levelAccess: accessByUser[row.userId] ?? row.levelAccess,
      interviewAccess: Object.hasOwn(interviewByUser, row.userId)
        ? interviewByUser[row.userId]
        : row.interviewAccess,
      staff: Object.hasOwn(staffByUser, row.userId) ? staffByUser[row.userId] : row.staff,
    };
  }, [visibleRows, detailUserId, displayClass, accessByUser, interviewByUser, staffByUser]);

  const filtered = useMemo(
    () => filterAdminUsers(visibleRows, query),
    [visibleRows, query],
  );
  const sorted = useMemo(
    () => sortAdminUsers(filtered, sort, dir),
    [filtered, sort, dir],
  );
  const paged = useMemo(
    () => paginateAdminUsers(sorted, page, STUDENTS_PAGE_SIZE),
    [sorted, page],
  );
  const rosterTrend = useMemo(() => buildAdminRosterTrend(visibleRows), [visibleRows]);

  function handleSort(column: AdminSortKey) {
    if (sort === column) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setDir(column === "name" || column === "class" ? "asc" : "desc");
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
    setDetailUserId((current) => (current === deletedId ? null : current));
    setSelected((current) => current.filter((id) => id !== deletedId));
    setConfirmRow(null);
    setDeleting(false);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleConfirmStaff() {
    if (!staffPrompt || staffSaving) return;
    setStaffSaving(true);
    setStaffError(null);
    const result = await setAdminUserStaff(staffPrompt.row.userId, staffPrompt.next);
    if (!result.ok) {
      setStaffError(result.error);
      setStaffSaving(false);
      return;
    }
    setStaffByUser((current) => ({
      ...current,
      [staffPrompt.row.userId]: result.staff,
    }));
    if (result.staff) {
      setTeacherByUser((current) => ({ ...current, [staffPrompt.row.userId]: false }));
      setTeacherClassesByUser((current) => ({ ...current, [staffPrompt.row.userId]: [] }));
    }
    setStaffPrompt(null);
    setStaffSaving(false);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleSaveTeacher(remove = false) {
    if (!teacherPrompt || teacherSaving) return;
    setTeacherSaving(true);
    setTeacherError(null);
    const result = await setAdminUserTeacher(
      teacherPrompt.row.userId,
      !remove,
      remove ? [] : teacherPrompt.classes,
    );
    if (!result.ok) {
      setTeacherError(result.error);
      setTeacherSaving(false);
      return;
    }
    setTeacherByUser((current) => ({ ...current, [teacherPrompt.row.userId]: result.teacher }));
    setTeacherClassesByUser((current) => ({
      ...current,
      [teacherPrompt.row.userId]: result.classes,
    }));
    if (result.teacher) {
      setStaffByUser((current) => ({ ...current, [teacherPrompt.row.userId]: false }));
    }
    setTeacherPrompt(null);
    setTeacherSaving(false);
    startTransition(() => {
      router.refresh();
    });
  }

  const closeDetail = useCallback(() => setDetailUserId(null), []);

  const rangeStart =
    paged.total === 0 ? 0 : (paged.page - 1) * STUDENTS_PAGE_SIZE + 1;
  const rangeEnd = Math.min(paged.page * STUDENTS_PAGE_SIZE, paged.total);

  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const selectedRows = useMemo(
    () => visibleRows.filter((row) => selected.includes(row.userId)),
    [visibleRows, selected],
  );
  const pageIds = paged.pageRows.map((row) => row.userId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  function toggleSelected(userId: string) {
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  function togglePage() {
    setSelected((current) =>
      allOnPage
        ? current.filter((id) => !pageIds.includes(id))
        : [...current, ...pageIds.filter((id) => !current.includes(id))],
    );
  }

  function finishBulk(done: number, failed: number, firstError: string | undefined, what: string) {
    setBulkBusy(false);
    setBulkMessage(
      failed === 0
        ? { ok: true, text: `${what} for ${formatCount(done)} ${done === 1 ? "student" : "students"}.` }
        : {
            ok: false,
            text: `${formatCount(failed)} of ${formatCount(done + failed)} could not be saved. ${firstError ?? ""}`.trim(),
          },
    );
    startTransition(() => {
      router.refresh();
    });
  }

  // One request per student, in order, so a failure names how many did not save.
  async function bulkSetClass(raw: string) {
    const next = normalizeClassName(raw);
    if (!next || bulkBusy) return;
    setBulkBusy(true);
    setBulkMessage(null);
    let done = 0;
    let failed = 0;
    let firstError: string | undefined;
    for (const row of selectedRows) {
      const result = await setAdminUserClass(row.userId, next);
      if (result.ok) {
        done += 1;
        setClassByUser((prev) => ({ ...prev, [row.userId]: result.className }));
      } else {
        failed += 1;
        firstError ??= result.error;
      }
    }
    finishBulk(done, failed, firstError, `Class set to ${next}`);
  }

  async function bulkLevel(slug: string, grant: boolean) {
    if (bulkBusy) return;
    const label = levels.find((level) => level.slug === slug)?.level ?? slug;
    setBulkBusy(true);
    setBulkMessage(null);
    let done = 0;
    let failed = 0;
    let firstError: string | undefined;
    for (const row of selectedRows) {
      if (row.isAdmin) continue;
      const current = grantedFor(row);
      const has = current.includes(slug);
      if (has === grant) {
        done += 1;
        continue;
      }
      const next = grant ? [...current, slug] : current.filter((item) => item !== slug);
      const result = await setAdminUserLevelAccess(row.userId, next);
      if (result.ok) {
        done += 1;
        setAccessByUser((prev) => ({ ...prev, [row.userId]: result.levelAccess }));
      } else {
        failed += 1;
        firstError ??= result.error;
      }
    }
    finishBulk(done, failed, firstError, `${label} ${grant ? "unlocked" : "locked"}`);
  }

  const classSuggestions = classOptions.map((option) => option.label);

  function rowActions(row: AdminUserRow) {
    if (row.isAdmin && !isOwner) return null;
    return (
      <RowActionsMenu
        name={row.displayName}
        isAdmin={row.isAdmin}
        isStaff={staffFor(row)}
        isTeacher={teacherFor(row)}
        canAssignStaff={isOwner}
        canAssignTeacher={canAssignTeacher}
        staffSaving={staffSaving || teacherSaving}
        onStaff={() => {
          setStaffError(null);
          setStaffPrompt({ row, next: !staffFor(row) });
        }}
        onTeacher={() => {
          setTeacherError(null);
          setTeacherPrompt({
            row,
            classes: teacherFor(row) ? teacherClassesFor(row) : [],
          });
        }}
        onDelete={() => {
          setDeleteError(null);
          setConfirmRow(row);
        }}
      />
    );
  }

  function levelChips(row: AdminUserRow) {
    return (
      <LevelAccessChips
        row={row}
        levels={levels}
        granted={grantedFor(row)}
        saving={savingIds.includes(row.userId)}
        onToggle={(slug) => void toggleLevel(row, slug)}
        interviewAccess={interviewFor(row)}
        interviewSaving={savingInterviewIds.includes(row.userId)}
        onToggleInterview={() => void toggleInterview(row)}
        locked={readOnly}
      />
    );
  }

  function classEditor(row: AdminUserRow) {
    return {
      userId: row.userId,
      studentName: row.displayName,
      value: displayClass(row),
      suggestions: classSuggestions,
      saving: savingClassIds.includes(row.userId) || bulkBusy,
      readOnly,
      onSave: (next: string) => void saveClass(row, next),
    };
  }

  const emptyMessage =
    visibleRows.length === 0
      ? readOnly
        ? "No students in your classes yet."
        : "No users have synced progress yet."
      : "No users match your search.";

  return (
    <>
      <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
        <AdminPageHeader
          kicker="People"
          title="Students"
          subtitle={
            readOnly
              ? "Students in the classes you teach. You can open their progress. Grants and deletes stay with the admin."
              : isOwner
                ? "Assign classes, grant courses, and choose staff or teachers. Staff see every stat and can grant access. Only you can delete."
                : "Assign classes, grant courses, and assign teachers. You can see every stat. Deleting stays with the main admin."
          }
          trailing={
            <HeaderChip icon="group">
              {formatCount(visibleRows.length)} {visibleRows.length === 1 ? "user" : "users"}
            </HeaderChip>
          }
        />

        <section className={`${CARD} flex flex-col gap-space-16 p-space-16 sm:p-space-20`}>
          <PanelHeader
            icon="trending_up"
            title="Last 30 days"
            hint={`${
              rosterSeries === "users"
                ? "Users by the day each account was first seen."
                : "Classes by the day each one first appeared."
            } Days are Vietnam time.`}
            trailing={
              <Segmented
                ariaLabel="Chart series"
                value={rosterSeries}
                options={[
                  { key: "users", label: "Users" },
                  { key: "classes", label: "Classes" },
                ]}
                onSelect={setRosterSeries}
              />
            }
          />
          <div className="h-56 w-full sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rosterTrend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={ADMIN_COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: ADMIN_COLORS.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: ADMIN_COLORS.grid }}
                  interval={3}
                />
                <YAxis
                  allowDecimals={false}
                  width={36}
                  tick={{ fill: ADMIN_COLORS.axis, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ stroke: ADMIN_COLORS.border, strokeDasharray: "3 3" }}
                />
                <Line
                  type="monotone"
                  dataKey={rosterSeries}
                  name={rosterSeries === "users" ? "Users" : "Classes"}
                  stroke={ADMIN_COLORS.cobalt}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: ADMIN_COLORS.cobalt, strokeWidth: 2, fill: ADMIN_COLORS.card }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {!storeConfigured ? (
          <Notice>
            Cloud progress is not configured. This dashboard only lists learners who have synced
            progress to Supabase.
          </Notice>
        ) : null}

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

        {accessError ? <Notice>{accessError}</Notice> : null}
        {classError ? <Notice>{classError}</Notice> : null}
        {staffError && !staffPrompt ? <Notice>{staffError}</Notice> : null}
        {teacherError && !teacherPrompt ? <Notice>{teacherError}</Notice> : null}

        {!readOnly && selectedRows.length > 0 ? (
          <BulkBar
            count={selectedRows.length}
            levels={levels}
            classSuggestions={classSuggestions}
            busy={bulkBusy}
            onSetClass={(next) => void bulkSetClass(next)}
            onLevel={(slug, grant) => void bulkLevel(slug, grant)}
            onClear={() => {
              setSelected([]);
              setBulkMessage(null);
            }}
          />
        ) : null}
        {bulkMessage ? (
          bulkMessage.ok ? (
            <p
              role="status"
              className="flex items-center gap-space-8 text-admin-body-sm text-admin-emerald-ink"
            >
              <MaterialIcon name="check_circle" className="text-[18px] text-admin-emerald" filled />
              {bulkMessage.text}
            </p>
          ) : (
            <Notice>{bulkMessage.text}</Notice>
          )
        ) : null}

        <section className={`${CARD} overflow-hidden`}>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full border-collapse text-left">
              <thead className={THEAD}>
                <tr>
                  <SortHeader
                    label="User"
                    column="name"
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    className="sticky left-0 z-20 bg-admin-subtle"
                  >
                    {readOnly ? null : (
                      <Checkbox
                        aria-label={allOnPage ? "Clear this page" : "Select this page"}
                        checked={allOnPage}
                        disabled={pageIds.length === 0 || bulkBusy}
                        onChange={togglePage}
                      />
                    )}
                  </SortHeader>
                  <SortHeader
                    label="Class"
                    column="class"
                    sort={sort}
                    dir={dir}
                    onSort={handleSort}
                    className="w-44 min-w-44 max-w-44"
                  />
                  <SortHeader label="Last seen" column="lastLogin" sort={sort} dir={dir} onSort={handleSort} />
                  <SortHeader label="Streak" column="streak" sort={sort} dir={dir} onSort={handleSort} />
                  <th scope="col" className={`${TH} text-left`}>
                    Level access
                  </th>
                  {canAssignTeacher ? (
                    <th scope="col" className={`${TH} sticky right-0 z-20 w-14 bg-admin-subtle`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="text-admin-body-md text-admin-ink">
                {paged.pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canAssignTeacher ? 6 : 5}
                      className="px-space-16 py-space-48 text-center text-admin-body-md text-admin-ink-muted"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  paged.pageRows.map((row) => {
                    const picked = selected.includes(row.userId);
                    const stickyBg = picked
                      ? "bg-admin-cobalt-tint group-hover:bg-admin-cobalt-wash"
                      : "bg-admin-card group-hover:bg-admin-canvas";
                    return (
                      <tr
                        key={row.userId}
                        tabIndex={0}
                        aria-selected={picked}
                        onClick={() => setDetailUserId(row.userId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") setDetailUserId(row.userId);
                        }}
                        className={`${TR} cursor-pointer outline-none focus-visible:bg-admin-cobalt-wash/50 ${
                          picked ? "bg-admin-cobalt-tint hover:bg-admin-cobalt-wash" : ""
                        }`}
                      >
                        <td className={`sticky left-0 z-10 px-space-16 py-space-8 ${stickyBg}`}>
                          <div className="flex min-w-[15rem] items-center gap-space-12">
                            {readOnly ? null : (
                              <span
                                className="flex"
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <Checkbox
                                  aria-label={`Select ${row.displayName}`}
                                  checked={picked}
                                  disabled={bulkBusy}
                                  onChange={() => toggleSelected(row.userId)}
                                />
                              </span>
                            )}
                            <div className="flex min-w-0 flex-col">
                              <span className="flex flex-wrap items-center gap-space-8">
                                <span className="font-semibold text-admin-ink transition-colors group-hover:text-admin-cobalt">
                                  {row.displayName}
                                </span>
                                {staffFor(row) ? <StaffBadge /> : null}
                                {teacherFor(row) ? <TeacherBadge /> : null}
                              </span>
                              {row.email && row.email !== row.displayName ? (
                                <span className="truncate text-admin-body-sm text-admin-ink-subtle">
                                  {row.email}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <ClassCell {...classEditor(row)} />
                        <td className="px-space-16 py-space-8">
                          <LastSeen iso={row.lastLoginAt} />
                        </td>
                        <td className="whitespace-nowrap px-space-16 py-space-8">
                          <Streak days={row.streakDays} />
                        </td>
                        <td className="px-space-16 py-space-8">{levelChips(row)}</td>
                        {canAssignTeacher ? (
                          <td
                            className={`sticky right-0 z-10 px-space-12 py-space-8 text-right ${stickyBg}`}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            {rowActions(row)}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            {paged.pageRows.length === 0 ? (
              <p className="px-space-16 py-space-48 text-center text-admin-body-md text-admin-ink-muted">
                {emptyMessage}
              </p>
            ) : (
              <>
                {readOnly ? null : (
                  <div className="flex items-center gap-space-12 border-b border-admin-hairline bg-admin-subtle px-space-16 py-space-8">
                    <Checkbox
                      aria-label={allOnPage ? "Clear this page" : "Select this page"}
                      checked={allOnPage}
                      disabled={bulkBusy}
                      onChange={togglePage}
                    />
                    <span className="text-admin-label-sm uppercase text-admin-ink-subtle">Select page</span>
                  </div>
                )}
                <ul>
                  {paged.pageRows.map((row) => {
                    const picked = selected.includes(row.userId);
                    return (
                      <li
                        key={row.userId}
                        className={`flex flex-col gap-space-12 border-t border-admin-hairline px-space-16 py-space-12 first:border-t-0 ${
                          picked ? "bg-admin-cobalt-tint" : ""
                        }`}
                      >
                        <div className="flex items-start gap-space-12">
                          {readOnly ? null : (
                            <span className="flex pt-0.5">
                              <Checkbox
                                aria-label={`Select ${row.displayName}`}
                                checked={picked}
                                disabled={bulkBusy}
                                onChange={() => toggleSelected(row.userId)}
                              />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setDetailUserId(row.userId)}
                            className="min-w-0 flex-1 rounded-admin-badge text-left outline-none focus-visible:shadow-admin-focus"
                          >
                            <span className="flex flex-wrap items-center gap-space-8">
                              <span className="font-semibold text-admin-ink">{row.displayName}</span>
                              {staffFor(row) ? <StaffBadge /> : null}
                              {teacherFor(row) ? <TeacherBadge /> : null}
                            </span>
                            {row.email && row.email !== row.displayName ? (
                              <span className="block truncate text-admin-body-sm text-admin-ink-subtle">
                                {row.email}
                              </span>
                            ) : null}
                          </button>
                          {canAssignTeacher ? rowActions(row) : null}
                        </div>
                        <div
                          className={`flex flex-wrap items-center gap-x-space-16 gap-y-space-8 ${readOnly ? "" : "pl-7"}`}
                        >
                          <ClassEditor {...classEditor(row)} />
                          <Streak days={row.streakDays} />
                          <LastSeen iso={row.lastLoginAt} />
                        </div>
                        <div className={readOnly ? "" : "pl-7"}>{levelChips(row)}</div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>

          <div className="border-t border-admin-hairline bg-admin-canvas px-space-16 py-space-12 sm:px-space-20">
            <Pager
              page={paged.page}
              pageCount={paged.pageCount}
              start={rangeStart}
              end={rangeEnd}
              total={paged.total}
              noun="users"
              onPage={setPage}
            />
          </div>
        </section>
      </main>

      {detailRow ? (
        <StudentDetail
          row={detailRow}
          catalog={courseCatalog}
          onClose={closeDetail}
          onDeleted={() => {
            const deletedId = detailRow.userId;
            setDeletedIds((current) =>
              current.includes(deletedId) ? current : [...current, deletedId],
            );
            setSelected((current) => current.filter((id) => id !== deletedId));
          }}
          onAccessChange={(patch) => {
            if (patch.levelAccess) {
              setAccessByUser((prev) => ({ ...prev, [patch.userId]: patch.levelAccess ?? [] }));
            }
            if (patch.interviewAccess !== undefined) {
              setInterviewByUser((prev) => ({
                ...prev,
                [patch.userId]: patch.interviewAccess === true,
              }));
            }
          }}
        />
      ) : null}

      <Dialog
        open={confirmRow != null}
        onClose={() => {
          if (deleting) return;
          setConfirmRow(null);
          setDeleteError(null);
        }}
        title="Delete account?"
        description={
          confirmRow ? (
            <>
              This removes{" "}
              <span className="font-semibold text-admin-ink">
                {confirmRow.email ?? confirmRow.displayName}
              </span>
              {confirmRow.userId === currentUserId ? " (you)" : ""} from the dashboard and deletes
              their cloud progress. They can sign in again and start over.
            </>
          ) : null
        }
        actions={
          <>
            <Button
              disabled={deleting}
              onClick={() => {
                setConfirmRow(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              icon="delete"
              disabled={deleting}
              onClick={() => void handleConfirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        {deleteError ? (
          <p role="alert" className="text-admin-body-sm text-admin-crimson">
            {deleteError}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={staffPrompt != null}
        onClose={() => {
          if (staffSaving) return;
          setStaffPrompt(null);
          setStaffError(null);
        }}
        title={staffPrompt?.next ? "Give staff access?" : "Remove staff access?"}
        description={
          staffPrompt ? (
            <>
              <span className="font-semibold text-admin-ink">
                {staffPrompt.row.email ?? staffPrompt.row.displayName}
              </span>{" "}
              {staffPrompt.next
                ? "will be able to open this dashboard, see every stat, and grant classes and courses. They will not be able to delete accounts or progress."
                : "will no longer open this dashboard. Their class and course access stay as they are."}
            </>
          ) : null
        }
        actions={
          <>
            <Button
              disabled={staffSaving}
              onClick={() => {
                setStaffPrompt(null);
                setStaffError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant={staffPrompt?.next ? "primary" : "destructive"}
              disabled={staffSaving}
              onClick={() => void handleConfirmStaff()}
            >
              {staffSaving ? "Saving…" : staffPrompt?.next ? "Give access" : "Remove access"}
            </Button>
          </>
        }
      >
        {staffError ? (
          <p role="alert" className="text-admin-body-sm text-admin-crimson">
            {staffError}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={teacherPrompt != null}
        onClose={() => {
          if (teacherSaving) return;
          setTeacherPrompt(null);
          setTeacherError(null);
        }}
        title={teacherPrompt && teacherFor(teacherPrompt.row) ? "Teacher classes" : "Make teacher?"}
        description={
          teacherPrompt ? (
            <>
              <span className="font-semibold text-admin-ink">
                {teacherPrompt.row.email ?? teacherPrompt.row.displayName}
              </span>{" "}
              can view progress for the classes you pick. They cannot grant courses or delete.
            </>
          ) : null
        }
        actions={
          <>
            {teacherPrompt && teacherFor(teacherPrompt.row) ? (
              <Button
                variant="destructive"
                disabled={teacherSaving}
                onClick={() => void handleSaveTeacher(true)}
              >
                Remove teacher
              </Button>
            ) : (
              <Button
                disabled={teacherSaving}
                onClick={() => {
                  setTeacherPrompt(null);
                  setTeacherError(null);
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              variant="primary"
              disabled={teacherSaving || (teacherPrompt?.classes.length ?? 0) === 0}
              onClick={() => void handleSaveTeacher(false)}
            >
              {teacherSaving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {teacherPrompt ? (
          <div className="flex max-h-64 flex-col gap-space-8 overflow-y-auto">
            {teacherClassChoices(schoolClassLabels, teacherPrompt.classes).map((label) => {
              const on = teacherPrompt.classes.some((name) => classKey(name) === classKey(label));
              return (
                <label key={label} className="flex items-center gap-space-8 text-admin-body-sm text-admin-ink">
                  <Checkbox
                    aria-label={label}
                    checked={on}
                    disabled={teacherSaving}
                    onChange={() => {
                      setTeacherPrompt((current) => {
                        if (!current) return current;
                        const classes = on
                          ? current.classes.filter((name) => classKey(name) !== classKey(label))
                          : [...current.classes, label];
                        return { ...current, classes };
                      });
                    }}
                  />
                  <span className="truncate">{label}</span>
                </label>
              );
            })}
            {teacherClassChoices(schoolClassLabels, teacherPrompt.classes).length === 0 ? (
              <p className="text-admin-body-sm text-admin-ink-muted">
                No classes yet. Give a student a class first.
              </p>
            ) : null}
          </div>
        ) : null}
        {teacherError ? (
          <p role="alert" className="text-admin-body-sm text-admin-crimson">
            {teacherError}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

function teacherClassChoices(school: readonly string[], selected: readonly string[]): string[] {
  const labels = [...school];
  for (const name of selected) {
    if (!labels.some((label) => classKey(label) === classKey(name))) labels.push(name);
  }
  return labels;
}
